/**
 * Order Management System for Backtesting
 * Handles order placement, tracking, and P&L calculation
 */

class OrderManager {
    constructor(chart, replaySystem) {
        this.chart = chart;
        this.replaySystem = replaySystem;

        // Core order infrastructure
        if (typeof OrderEventBus !== 'undefined') {
            this.eventBus = new OrderEventBus();
        } else {
            console.warn('⚠️ OrderEventBus not available - falling back to no-op bus');
            this.eventBus = {
                emit: () => {},
                on: () => () => {}
            };
        }

        if (typeof OrderService !== 'undefined') {
            this.orderService = new OrderService({
                chart: this.chart,
                replaySystem: this.replaySystem,
                eventBus: this.eventBus
            });

            const bindServiceProp = (prop) => {
                Object.defineProperty(this, prop, {
                    configurable: true,
                    enumerable: true,
                    get: () => this.orderService[prop],
                    set: (value) => {
                        this.orderService[prop] = value;
                        return value;
                    }
                });
            };

            [
                'orders',
                'openPositions',
                'closedPositions',
                'pendingOrders',
                'orderIdCounter',
                'orderType',
                'orderSide',
                'balance',
                'initialBalance',
                'equity',
                'contractSize',
                'positionSizeMode',
                'breakevenMode',
                'mfeMaeTrackingHours',
                'tradeJournal',
                'mfeMaeTrackingPositions',
                'symbolPrecision'
            ].forEach(bindServiceProp);

            this.setupOrderServiceEventSubscriptions();
        } else {
            console.warn('⚠️ OrderService not available - using legacy in-class state');
            // Order storage
            this.orders = [];
            this.openPositions = [];
            this.closedPositions = [];
            this.pendingOrders = [];
            this.orderIdCounter = 1;

            // Order meta
            this.orderType = 'market';
            this.orderSide = 'BUY';

            // Account info
            this.balance = 10000;
            this.initialBalance = 10000;
            this.equity = 10000;

            // Trading settings
            this.contractSize = 100000; // Standard lot size (100,000 units)
            this.positionSizeMode = 'risk-usd';
            this.breakevenMode = 'pips';
            this.mfeMaeTrackingHours = 4;
            this.tradeJournal = [];
            this.mfeMaeTrackingPositions = [];
            this.symbolPrecision = 5;

            // Pip calculation settings (configurable per instrument)
            this.pipSize = 0.0001; // For most forex pairs (EUR/USD, GBP/USD, etc.)
            this.pipValuePerLot = 10; // Standard lot: $10 per pip
        }
        
        // Pip conversion helper methods
        this.priceToPips = (priceDistance) => {
            return Math.abs(priceDistance) / (this.pipSize || 0.0001);
        };
        
        this.pipToPrice = (pips) => {
            return pips * (this.pipSize || 0.0001);
        };
        
        this.formatPips = (priceDistance, decimals = 1) => {
            const pips = this.priceToPips(priceDistance);
            return pips.toFixed(decimals);
        };

        // Trade journal helpers
        this.currentTradeNote = null; // Currently active trade note form
        
        // POSITION SCALING FEATURE
        this.enablePositionScaling = true; // Master toggle for scaling feature
        this.scaleNextOrder = false; // Manual control: scale THIS order with existing position
        this.scaledTrades = new Map(); // Map of tradeGroupId -> {entries: [], avgEntry, totalQuantity, ...}
        this.tradeGroupIdCounter = 1; // Counter for unique trade group IDs
        
        // SPLIT ENTRY TRACKING (for split entries placed at once)
        this.splitTrades = new Map(); // Map of splitGroupId -> {entries: [], status, totalPnL, ...}
        
        // Order visualization
        this.orderLines = [];
        this.mfeMaeMarkers = []; // Store MFE/MAE markers
        this.previewLines = null; // Store preview TP/SL lines before order placement
        this.entryMarkers = [];
        this.exitMarkers = [];
        this.editingPendingOrderId = null;
        
        // SPLIT ENTRY SYSTEM - Multiple entry levels for pending orders
        this.splitEntries = []; // Array of { id, price, percentage, lineData }
        this.splitEntryIdCounter = 1;
        this.splitEntriesEnabled = false; // Tracks if we have split entries active
        this.isPopulatingOrderPanel = false;
        this.tpLastSyncedEntryPrice = null;
        this.tpDistributionMode = 'amount'; // percent, amount, or lots (synced with positionSizeMode: risk-usd)
        this.slLastSyncedEntryPrice = null;
        this.pendingPreviewAlignFrame = null;
        this.pendingPreviewAlignFollowupFrame = null;
        this.pendingPreviewAlignTimeout = null;
        this.pendingTargetLines = [];
        
        // Professional Trailing SL System
        this.trailingState = {
            isActive: false,           // Whether trailing has been activated
            highestProfit: 0,          // Highest profit reached (for BUY) or lowest (for SELL)
            currentSL: null,           // Current SL price
            activationThreshold: null, // Price level where trailing activates
            trailDistance: 0,          // Distance in pips to trail behind price
            lastUpdate: null           // Timestamp of last SL update
        };
        this.priceMonitorInterval = null; // Interval for monitoring price
        
        // MARKET TYPE SYSTEM - Support for different instrument types
        this.marketType = 'forex'; // Default: forex, futures, crypto, stocks
        this.marketConfigs = {
            forex: {
                name: 'Forex',
                icon: '💱',
                pipSize: 0.0001,
                pipValuePerLot: 10,
                contractSize: 100000,
                symbolPrecision: 5,
                positionLabel: 'Lots',
                sizeStep: 0.01,
                minSize: 0.01,
                showPips: true,
                showLeverage: false,
                defaultRisk: 100,
                examples: 'EUR/USD, GBP/USD, USD/JPY'
            },
            futures: {
                name: 'Futures',
                icon: '📈',
                pipSize: 0.25,  // Tick size for ES, NQ, etc.
                pipValuePerLot: 12.50, // ES = $12.50 per tick
                contractSize: 1,
                symbolPrecision: 2,
                positionLabel: 'Contracts',
                sizeStep: 1,
                minSize: 1,
                showPips: false,
                showTicks: true,
                showLeverage: true,
                defaultRisk: 200,
                examples: 'ES, NQ, CL, GC'
            },
            crypto: {
                name: 'Crypto',
                icon: '₿',
                pipSize: 0.01,
                pipValuePerLot: 1,
                contractSize: 1,
                symbolPrecision: 2,
                positionLabel: 'Units',
                sizeStep: 0.001,
                minSize: 0.001,
                showPips: false,
                showPercent: true,
                showLeverage: true,
                defaultRisk: 50,
                examples: 'BTC/USD, ETH/USD, SOL/USD'
            },
            stocks: {
                name: 'Stocks',
                icon: '📊',
                pipSize: 0.01,
                pipValuePerLot: 1,
                contractSize: 1,
                symbolPrecision: 2,
                positionLabel: 'Shares',
                sizeStep: 1,
                minSize: 1,
                showPips: false,
                showPercent: true,
                showLeverage: false,
                defaultRisk: 100,
                examples: 'AAPL, TSLA, NVDA'
            }
        };
        
        // Load saved market type
        this.loadMarketType();
        
        this.init();
    }

    getJournalStorageKey() {
        const sessionId = this.chart && typeof this.chart.getActiveTradingSessionId === 'function'
            ? this.chart.getActiveTradingSessionId()
            : null;
        if (sessionId) {
            return `tradeJournal_s${sessionId}`;
        }
        return 'tradeJournal';
    }

    persistJournal() {
        try {
            const key = this.getJournalStorageKey();
            localStorage.setItem(key, JSON.stringify(this.tradeJournal));
        } catch (e) {
            console.warn('Could not save trade journal to localStorage:', e);
        }

        if (this.chart && typeof this.chart.scheduleSessionStateSave === 'function') {
            this.chart.scheduleSessionStateSave({ journal: this.tradeJournal });
        }
    }
    
    init() {
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📊 Order Manager v2.0 - WITH NEW GRADIENT CARDS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        // Load trade journal from localStorage
        try {
            const key = this.getJournalStorageKey();
            let savedJournal = localStorage.getItem(key);
            if (!savedJournal && key !== 'tradeJournal') {
                const legacy = localStorage.getItem('tradeJournal');
                if (legacy) {
                    savedJournal = legacy;
                }
            }
            if (savedJournal) {
                this.tradeJournal = JSON.parse(savedJournal);
                console.log(`📔 Loaded ${this.tradeJournal.length} trades from journal`);
                
                // Clean up any duplicates that might exist
                const originalLength = this.tradeJournal.length;
                const seenIds = new Set();
                this.tradeJournal = this.tradeJournal.filter(trade => {
                    const id = trade.tradeId || trade.id;
                    if (seenIds.has(id)) {
                        console.warn(`🧹 Removing duplicate trade #${id} from journal`);
                        return false;
                    }
                    seenIds.add(id);
                    return true;
                });
                
                if (this.tradeJournal.length < originalLength) {
                    console.log(`🧹 Cleaned ${originalLength - this.tradeJournal.length} duplicate(s) from journal`);
                    this.persistJournal();
                }

                if (key !== 'tradeJournal') {
                    this.persistJournal();
                }
                
                // ═══ RESTORE ID COUNTERS FROM JOURNAL ═══
                // Prevent ID collisions after page refresh
                let maxOrderId = 0;
                let maxScaledGroupId = 0;
                let maxSplitGroupId = 0;
                
                this.tradeJournal.forEach(trade => {
                    const id = trade.tradeId || trade.id;
                    
                    if (typeof id === 'string') {
                        // Handle prefixed IDs: "scaled_X" or "split_X"
                        if (id.startsWith('scaled_')) {
                            const num = parseInt(id.replace('scaled_', ''), 10);
                            if (!isNaN(num) && num > maxScaledGroupId) maxScaledGroupId = num;
                        } else if (id.startsWith('split_')) {
                            const num = parseInt(id.replace('split_', ''), 10);
                            if (!isNaN(num) && num > maxSplitGroupId) maxSplitGroupId = num;
                        }
                    } else if (typeof id === 'number') {
                        // Regular numeric trade ID
                        if (id > maxOrderId) maxOrderId = id;
                    }
                    
                    // Also check scaledEntries and splitEntries for individual order IDs
                    if (trade.scaledEntries) {
                        trade.scaledEntries.forEach(e => {
                            if (e.id && typeof e.id === 'number' && e.id > maxOrderId) {
                                maxOrderId = e.id;
                            }
                        });
                    }
                    if (trade.splitEntries) {
                        trade.splitEntries.forEach(e => {
                            if (e.id && typeof e.id === 'number' && e.id > maxOrderId) {
                                maxOrderId = e.id;
                            }
                        });
                    }
                });
                
                // Set counters to max + 1 to avoid collisions
                if (maxOrderId > 0) {
                    this.orderIdCounter = maxOrderId + 1;
                    console.log(`🔢 Restored orderIdCounter to ${this.orderIdCounter} (from journal)`);
                }
                if (maxScaledGroupId > 0 || maxSplitGroupId > 0) {
                    // Use the same counter for both scaled and split groups
                    this.tradeGroupIdCounter = Math.max(maxScaledGroupId, maxSplitGroupId) + 1;
                    console.log(`🔢 Restored tradeGroupIdCounter to ${this.tradeGroupIdCounter} (from journal)`);
                }
            }
        } catch (e) {
            console.warn('Could not load trade journal from localStorage:', e);
        }
        
        // Load MFE/MAE settings from localStorage
        try {
            const savedHours = localStorage.getItem('mfeMaeTrackingHours');
            if (savedHours) {
                this.mfeMaeTrackingHours = parseFloat(savedHours);
                console.log(`⚙️ Loaded MFE/MAE tracking window: ${this.mfeMaeTrackingHours}h`);
            }
        } catch (e) {
            console.warn('Could not load MFE/MAE settings from localStorage:', e);
        }
        
        // Load instrument settings from localStorage
        try {
            const savedPipSize = localStorage.getItem('chart_pipSize');
            const savedPipValue = localStorage.getItem('chart_pipValuePerLot');
            if (savedPipSize) {
                this.pipSize = parseFloat(savedPipSize);
                console.log(`⚙️ Loaded pip size: ${this.pipSize}`);
            }
            if (savedPipValue) {
                this.pipValuePerLot = parseFloat(savedPipValue);
                console.log(`⚙️ Loaded pip value per lot: $${this.pipValuePerLot}`);
            }
        } catch (e) {
            console.warn('Could not load instrument settings from localStorage:', e);
        }
        
        // Load position scaling setting from localStorage
        try {
            const savedScaling = localStorage.getItem('enablePositionScaling');
            if (savedScaling !== null) {
                this.enablePositionScaling = savedScaling === 'true';
                console.log(`⚙️ Loaded position scaling setting: ${this.enablePositionScaling ? 'ENABLED ✓' : 'DISABLED ✗'}`);
            } else {
                // First time - enable by default and save
                this.enablePositionScaling = true;
                localStorage.setItem('enablePositionScaling', 'true');
                console.log(`⚙️ Position scaling ENABLED by default ✓`);
            }
        } catch (e) {
            console.warn('Could not load position scaling setting from localStorage:', e);
        }
        
        // Get balance from backtesting session
        const session = this.chart.backtestingSession;
        if (session && session.startBalance) {
            this.balance = parseFloat(session.startBalance);
            this.initialBalance = this.balance;
            this.equity = this.balance;
            console.log(`💰 Starting balance: $${this.balance} | Initial: $${this.initialBalance}`);
        } else {
            console.log(`⚠️ No backtesting session found, using default balance: $${this.balance}`);
        }
        
        // Create UI
        this.createOrderButtons();
        this.setupTradingPanel();
        this.createNotificationContainer();
        
        // Update panel with initial values
        setTimeout(() => {
            console.log('🔄 Initial panel update - Populating UI with existing data');
            this.updatePositionsPanel();
            this.updateJournalTab(); // Load existing trades into Journal tab
            
            // Attach export button event listener
            const exportBtn = document.getElementById('exportJournalBtn');
            if (exportBtn) {
                exportBtn.onclick = () => this.exportJournal();
            }
            
            // Force update bottom panel tabs to ensure all data is visible
            console.log('📊 Data status:');
            console.log('   - Pending Orders:', this.pendingOrders ? this.pendingOrders.length : 0);
            console.log('   - Open Positions:', this.openPositions ? this.openPositions.length : 0);
            console.log('   - Closed Positions:', this.closedPositions ? this.closedPositions.length : 0);
            console.log('   - Trade Journal:', this.tradeJournal ? this.tradeJournal.length : 0);
            
            // Attach MFE/MAE settings button event listener
            const mfeMaeSettingsBtn = document.getElementById('mfeMaeSettingsBtn');
            if (mfeMaeSettingsBtn) {
                mfeMaeSettingsBtn.onclick = () => this.showMfeMaeSettings();
            }
            
            // Attach Instrument settings button event listener
            const instrumentSettingsBtn = document.getElementById('instrumentSettingsBtn');
            if (instrumentSettingsBtn) {
                instrumentSettingsBtn.onclick = () => this.showInstrumentSettings();
            }
        }, 100);
        
        // Listen for replay updates to recalculate P&L
        if (this.replaySystem) {
            this.replaySystem.onUpdate = () => this.updatePositions();
        }
        
        console.log('✅ Order Manager initialized');
        
        // Initialize order sounds
        this.initOrderSounds();
    }
    
    /**
     * Load saved market type from localStorage
     */
    loadMarketType() {
        try {
            const saved = localStorage.getItem('chart_marketType');
            if (saved && this.marketConfigs[saved]) {
                this.marketType = saved;
                console.log(`📊 Loaded market type: ${this.marketConfigs[saved].name}`);
            }
        } catch (e) {
            console.warn('Could not load market type:', e);
        }
    }
    
    /**
     * Save market type to localStorage
     */
    saveMarketType() {
        try {
            localStorage.setItem('chart_marketType', this.marketType);
        } catch (e) {
            console.warn('Could not save market type:', e);
        }
    }
    
    /**
     * Switch to a different market type
     */
    switchMarketType(newType) {
        if (!this.marketConfigs[newType]) {
            console.warn(`Unknown market type: ${newType}`);
            return;
        }
        
        const oldType = this.marketType;
        this.marketType = newType;
        this.saveMarketType();
        
        const config = this.marketConfigs[newType];
        
        // Update trading settings based on market type
        this.pipSize = config.pipSize;
        this.pipValuePerLot = config.pipValuePerLot;
        this.contractSize = config.contractSize;
        this.symbolPrecision = config.symbolPrecision;
        
        // Save to localStorage for persistence
        localStorage.setItem('chart_pipSize', config.pipSize);
        localStorage.setItem('chart_pipValuePerLot', config.pipValuePerLot);
        
        console.log(`📊 Switched from ${this.marketConfigs[oldType].name} to ${config.name}`);
        console.log(`   Pip Size: ${config.pipSize} | Pip Value: $${config.pipValuePerLot} | Position: ${config.positionLabel}`);
        
        // Update the UI
        this.updateMarketTypeUI();
        this.updateOrderPanel();
        
        // Show notification
        this.showNotification(`📊 Switched to ${config.name} mode`, 'info');
    }
    
    /**
     * Update market type selector UI
     */
    updateMarketTypeUI() {
        const config = this.marketConfigs[this.marketType];
        const btn = document.getElementById('marketTypeBtn');
        const label = document.getElementById('marketTypeLabel');
        
        if (btn) {
            btn.innerHTML = `${config.icon} ${config.name}`;
        }
        if (label) {
            label.textContent = config.name;
        }
        
        // Update dropdown active state
        document.querySelectorAll('.market-type-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.market === this.marketType);
        });
    }
    
    /**
     * Get current market configuration
     */
    getMarketConfig() {
        return this.marketConfigs[this.marketType] || this.marketConfigs.forex;
    }
    
    /**
     * Initialize order execution sounds
     */
    initOrderSounds() {
        this.soundEnabled = true;
        
        // Try to load setting from localStorage
        try {
            const savedSoundSetting = localStorage.getItem('orderSoundEnabled');
            if (savedSoundSetting !== null) {
                this.soundEnabled = savedSoundSetting === 'true';
            }
        } catch (e) {
            console.warn('Could not load sound setting:', e);
        }
        
        // Create AudioContext for generating sounds
        this.audioContext = null;
        
        console.log(`🔊 Order sounds: ${this.soundEnabled ? 'ENABLED' : 'DISABLED'}`);
    }
    
    /**
     * Play order execution sound
     * @param {string} type - 'buy', 'sell', 'pending', or 'close'
     */
    playOrderSound(type = 'buy') {
        if (!this.soundEnabled) return;
        
        try {
            // Lazy-initialize AudioContext (required after user interaction)
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }
            
            const ctx = this.audioContext;
            const now = ctx.currentTime;
            
            // Create oscillator for the tone
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);
            
            // Different tones for different order types
            switch (type) {
                case 'buy':
                    // Rising pleasant tone for buy
                    oscillator.frequency.setValueAtTime(523.25, now); // C5
                    oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
                    oscillator.frequency.setValueAtTime(783.99, now + 0.2); // G5
                    oscillator.type = 'sine';
                    break;
                case 'sell':
                    // Falling tone for sell
                    oscillator.frequency.setValueAtTime(783.99, now); // G5
                    oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
                    oscillator.frequency.setValueAtTime(523.25, now + 0.2); // C5
                    oscillator.type = 'sine';
                    break;
                case 'pending':
                    // Single beep for pending order executed
                    oscillator.frequency.setValueAtTime(880, now); // A5
                    oscillator.frequency.setValueAtTime(1046.5, now + 0.15); // C6
                    oscillator.type = 'sine';
                    break;
                case 'close':
                    // Cash register-like sound for position close
                    oscillator.frequency.setValueAtTime(1318.51, now); // E6
                    oscillator.frequency.setValueAtTime(987.77, now + 0.1); // B5
                    oscillator.frequency.setValueAtTime(1318.51, now + 0.2); // E6
                    oscillator.type = 'triangle';
                    break;
                default:
                    oscillator.frequency.setValueAtTime(660, now);
                    oscillator.type = 'sine';
            }
            
            // Volume envelope
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02);
            gainNode.gain.linearRampToValueAtTime(0.2, now + 0.15);
            gainNode.gain.linearRampToValueAtTime(0, now + 0.3);
            
            oscillator.start(now);
            oscillator.stop(now + 0.35);
            
            console.log(`🔊 Played ${type} order sound`);
        } catch (e) {
            console.warn('Could not play order sound:', e);
        }
    }
    
    /**
     * Toggle order sounds on/off
     */
    toggleOrderSound(enabled) {
        this.soundEnabled = enabled;
        localStorage.setItem('orderSoundEnabled', enabled ? 'true' : 'false');
        console.log(`🔊 Order sounds: ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }
    
    /**
     * Setup event subscriptions for OrderService events
     * This ensures the UI panels update when orders/positions change
     */
    setupOrderServiceEventSubscriptions() {
        if (!this.eventBus) {
            console.warn('⚠️ EventBus not available, skipping event subscriptions');
            return;
        }
        
        // Subscribe to order placed events
        this.eventBus.on('order:placed', (data) => {
            console.log('📢 Event: order:placed', data);
            this.updatePositionsPanel();
        });
        
        // Subscribe to order updated events
        this.eventBus.on('order:updated', (data) => {
            console.log('📢 Event: order:updated', data);
            this.updatePositionsPanel();
        });
        
        // Subscribe to order cancelled events
        this.eventBus.on('order:cancelled', (data) => {
            console.log('📢 Event: order:cancelled', data);
            this.updatePositionsPanel();
        });
        
        // Subscribe to order filled events
        this.eventBus.on('order:filled', (data) => {
            console.log('📢 Event: order:filled', data);
            this.updatePositionsPanel();
        });
        
        // Subscribe to position opened events
        this.eventBus.on('position:opened', (data) => {
            console.log('📢 Event: position:opened', data);
            this.updatePositionsPanel();
        });
        
        // Subscribe to position updated events
        this.eventBus.on('position:updated', (data) => {
            console.log('📢 Event: position:updated', data);
            this.updatePositionsPanel();
        });
        
        // Subscribe to position closed events
        this.eventBus.on('position:closed', (data) => {
            console.log('📢 Event: position:closed', data);
            this.updatePositionsPanel();
            this.updateJournalTab(); // Update history/journal when trade closes
        });
        
        console.log('✅ OrderService event subscriptions setup complete');
    }
    
    /**
     * Show MFE/MAE settings modal
     */
    showMfeMaeSettings() {
        // Remove existing modal if any
        const existingModal = document.getElementById('mfeMaeSettingsModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'mfeMaeSettingsModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: #1a1e2e;
            border-radius: 12px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border: 1px solid #2a2e39;
        `;
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="color: #fff; margin: 0; font-size: 18px;">⚙️ MFE/MAE Settings</h3>
                <button id="closeMfeMaeSettings" style="background: transparent; border: none; color: #787b86; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px;">×</button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="color: #787b86; font-size: 12px; margin-bottom: 12px; line-height: 1.5;">
                    Configure the time window for tracking Maximum Favorable Excursion (MFE) and Maximum Adverse Excursion (MAE).
                </div>
                <div style="background: rgba(124,58,237,0.1); border: 1px solid rgba(124,58,237,0.3); border-radius: 6px; padding: 10px; margin-bottom: 16px;">
                    <div style="color: #a78bfa; font-size: 11px; line-height: 1.5;">
                        📊 <strong>MFE</strong> (Max Favorable Excursion) = Best price level reached<br>
                        📊 <strong>MAE</strong> (Max Adverse Excursion) = Worst price level reached<br>
                        <br>
                        Tracked within a time window AFTER entry, regardless of when TP/SL is hit.
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; color: #787b86; font-size: 12px; margin-bottom: 8px;">Tracking Window (Hours)</label>
                <input type="number" id="mfeMaeHoursInput" value="${this.mfeMaeTrackingHours}" min="0.5" max="168" step="0.5" 
                    style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #2a2e39; border-radius: 6px; color: #fff; padding: 12px; font-size: 14px;">
                <div style="color: #787b86; font-size: 10px; margin-top: 4px;">Examples: 0.5 = 30min, 1 = 1h, 4 = 4h, 24 = 1day, 168 = 1week</div>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button id="saveMfeMaeSettings" style="flex: 1; padding: 12px; background: #7c3aed; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Save Settings
                </button>
                <button id="cancelMfeMaeSettings" style="flex: 1; padding: 12px; background: transparent; color: #787b86; border: 1px solid #2a2e39; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Cancel
                </button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event listeners
        document.getElementById('saveMfeMaeSettings').onclick = () => {
            const newHours = parseFloat(document.getElementById('mfeMaeHoursInput').value);
            if (newHours > 0) {
                this.mfeMaeTrackingHours = newHours;
                // Save to localStorage
                try {
                    localStorage.setItem('mfeMaeTrackingHours', newHours);
                } catch (e) {
                    console.warn('Could not save MFE/MAE settings:', e);
                }
                this.showNotification(`⚙️ MFE/MAE tracking window set to ${newHours}h`, 'success');
                console.log(`⚙️ MFE/MAE tracking window updated to ${newHours} hours`);
            }
            modal.remove();
        };
        
        document.getElementById('cancelMfeMaeSettings').onclick = () => modal.remove();
        document.getElementById('closeMfeMaeSettings').onclick = () => modal.remove();
        
        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };
    }
    
    /**
     * Show Instrument Settings modal
     */
    showInstrumentSettings() {
        // Remove existing modal if any
        const existingModal = document.getElementById('instrumentSettingsModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'instrumentSettingsModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: #1a1e2e;
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border: 1px solid #2a2e39;
        `;
        
        modalContent.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h3 style="color: #fff; margin: 0; font-size: 18px;">⚙️ Instrument Settings</h3>
                <button id="closeInstrumentSettings" style="background: transparent; border: none; color: #787b86; font-size: 24px; cursor: pointer; padding: 0; width: 32px; height: 32px;">×</button>
            </div>
            
            <div style="margin-bottom: 20px;">
                <div style="color: #787b86; font-size: 12px; margin-bottom: 12px; line-height: 1.5;">
                    Configure pip size and pip value for accurate position sizing and P&L calculation.
                </div>
                <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); border-radius: 6px; padding: 10px; margin-bottom: 16px;">
                    <div style="color: #60a5fa; font-size: 11px; line-height: 1.5;">
                        💡 <strong>Common Settings:</strong><br>
                        <strong>EUR/USD, GBP/USD</strong>: Pip = 0.0001, Value = $10/lot<br>
                        <strong>USD/JPY</strong>: Pip = 0.01, Value = $9.33/lot (approx)<br>
                        <strong>Gold (XAU/USD)</strong>: Pip = 0.01, Value = $1/lot<br>
                        <strong>Indices (US30, NAS100)</strong>: Pip = 1.0, Value = varies
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; color: #787b86; font-size: 12px; margin-bottom: 8px;">Pip Size</label>
                <input type="number" id="pipSizeInput" value="${this.pipSize}" step="0.0001" min="0.0001"
                    style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #2a2e39; border-radius: 6px; color: #fff; padding: 12px; font-size: 14px;">
                <div style="color: #787b86; font-size: 10px; margin-top: 4px;">For most forex pairs: 0.0001 | For JPY pairs: 0.01</div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; color: #787b86; font-size: 12px; margin-bottom: 8px;">Pip Value per Lot ($)</label>
                <input type="number" id="pipValueInput" value="${this.pipValuePerLot}" step="0.01" min="0.01"
                    style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #2a2e39; border-radius: 6px; color: #fff; padding: 12px; font-size: 14px;">
                <div style="color: #787b86; font-size: 10px; margin-top: 4px;">Standard lot value per pip (usually $10 for major pairs)</div>
            </div>
            
            <div style="display: flex; gap: 12px;">
                <button id="saveInstrumentSettings" style="flex: 1; padding: 12px; background: #3b82f6; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Save Settings
                </button>
                <button id="cancelInstrumentSettings" style="flex: 1; padding: 12px; background: transparent; color: #787b86; border: 1px solid #2a2e39; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Cancel
                </button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event listeners
        document.getElementById('saveInstrumentSettings').onclick = () => {
            const newPipSize = parseFloat(document.getElementById('pipSizeInput').value);
            const newPipValue = parseFloat(document.getElementById('pipValueInput').value);
            
            if (newPipSize > 0 && newPipValue > 0) {
                this.pipSize = newPipSize;
                this.pipValuePerLot = newPipValue;
                
                // Save to localStorage
                try {
                    localStorage.setItem('chart_pipSize', newPipSize);
                    localStorage.setItem('chart_pipValuePerLot', newPipValue);
                } catch (e) {
                    console.warn('Could not save instrument settings:', e);
                }
                
                this.showNotification(`⚙️ Instrument settings updated: Pip=${newPipSize}, Value=$${newPipValue}/lot`, 'success');
                console.log(`⚙️ Instrument settings: pipSize=${newPipSize}, pipValuePerLot=$${newPipValue}`);
                
                // Recalculate position size with new settings
                this.calculatePositionFromRisk();
            }
            modal.remove();
        };
        
        document.getElementById('cancelInstrumentSettings').onclick = () => modal.remove();
        document.getElementById('closeInstrumentSettings').onclick = () => modal.remove();
        
        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };
    }
    
    /**
     * Update the Journal tab in sidebar with trade history
     */
    updateJournalTab() {
        console.log('🔄 updateJournalTab called - NEW VERSION 2.1');
        
        const tradeHistoryList = document.getElementById('tradeHistoryList');
        const noTradesMsg = document.getElementById('noTradesMsg');
        
        // Update sidebar journal if elements exist (don't return early anymore!)
        if (!tradeHistoryList) {
            console.warn('⚠️ tradeHistoryList element not found - sidebar journal not available');
        }
        if (!noTradesMsg) {
            console.warn('⚠️ noTradesMsg element not found - sidebar journal not available');
        }
        
        // Only update sidebar if both elements exist
        if (tradeHistoryList && noTradesMsg) {
            if (this.tradeJournal.length === 0) {
                tradeHistoryList.innerHTML = '';
                noTradesMsg.style.display = 'block';
            } else {
                noTradesMsg.style.display = 'none';
                
                // Render trade items
                const reversedJournal = this.tradeJournal.slice().reverse();
                const htmlContent = reversedJournal.map((trade, index) => this.renderTradeListItem(trade, index)).join('');
                
                console.log(`✅ Rendered ${reversedJournal.length} trade items for sidebar`);
                
                tradeHistoryList.innerHTML = htmlContent;
                
                // FORCE a small delay to ensure DOM is ready
                setTimeout(() => {
                    console.log('🎯 Attaching click handlers...');
                    
                    // Method 1: Direct click on each item
                    const items = tradeHistoryList.querySelectorAll('.trade-history-item');
                    console.log(`Found ${items.length} trade items in DOM`);
                    
                    items.forEach((item, idx) => {
                        item.style.cursor = 'pointer';
                        item.addEventListener('click', (e) => {
                            console.log(`💥 CLICK on item ${idx}!`);
                            e.stopPropagation();
                            
                            const tradeData = item.getAttribute('data-trade');
                            if (tradeData) {
                                try {
                                    const trade = JSON.parse(tradeData);
                                    console.log('📊 Opening details:', trade.id);
                                    this.showTradeDetails(trade);
                                } catch (err) {
                                    console.error('❌ Parse error:', err);
                                }
                            }
                        });
                    });
                    
                    // Method 2: Also add to parent as backup
                    tradeHistoryList.addEventListener('click', (e) => {
                        const item = e.target.closest('.trade-history-item');
                        if (item) {
                            console.log('💥 Parent caught click!');
                            const tradeData = item.getAttribute('data-trade');
                            if (tradeData) {
                                try {
                                    const trade = JSON.parse(tradeData);
                                    this.showTradeDetails(trade);
                                } catch (err) {
                                    console.error('❌ Error:', err);
                                }
                            }
                        }
                    });
                    
                    console.log('✅ All click handlers attached!');
                }, 100);
            }
        }

        // Update bottom panel positions history table
        const replayPositionsBody = document.getElementById('replayPositionsBody');
        const replayMetaOpenCount = document.getElementById('replayMetaOpenCount');
        const replayMetaClosedCount = document.getElementById('replayMetaClosedCount');
        
        console.log('🔍 History Tab (replayPositionsBody) element:', replayPositionsBody ? 'FOUND ✅' : 'NOT FOUND ❌');
        console.log('📊 Trade Journal:', {
            exists: !!this.tradeJournal,
            length: this.tradeJournal ? this.tradeJournal.length : 'N/A',
            data: this.tradeJournal ? this.tradeJournal.slice(0, 2) : 'N/A'
        });
        
        if (replayPositionsBody) {
            console.log('✅ replayPositionsBody found, updating content...');
            console.log('   Element tag:', replayPositionsBody.tagName);
            console.log('   Parent:', replayPositionsBody.parentElement?.id);
            
            if (!this.tradeJournal || this.tradeJournal.length === 0) {
                console.log('⚠️ No trades in journal, showing empty message');
                replayPositionsBody.innerHTML = `
                    <tr class="replay-empty-row">
                        <td colspan="12">
                            <div class="replay-tab-empty">
                                No closed positions yet. Once trades are executed, they will appear here.
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                console.log(`📝 Rendering ${this.tradeJournal.length} trades in History tab`);
                const reversedJournal = this.tradeJournal.slice().reverse();
                const htmlContent = reversedJournal.map((trade, index) => {
                    const tradeId = trade.tradeId || trade.id;
                    const direction = trade.direction || trade.type;
                    const sideClass = direction === 'SELL' ? 'replay-badge--sell' : 'replay-badge--buy';
                    const quantity = trade.quantity || 0;
                    const status = trade.status || 'CLOSED';
                    const statusClass = status === 'CLOSED' ? 'replay-badge--closed' : 'replay-badge--open';
                    const openTime = this.format24Hour(trade.openTime);
                    const closeTime = this.format24Hour(trade.closeTime);
                    const entryPrice = trade.entryPrice || trade.openPrice || 0;
                    const exitPrice = trade.exitPrice || trade.closePrice || 0;
                    const pnl = trade.netPnL || trade.pnl || 0;
                    const pnlClass = pnl > 0 ? 'order-value--profit' : pnl < 0 ? 'order-value--loss' : '';
                    const rulesFollowed = trade.rulesFollowed ? '✅' : '❌';
                    const tags = trade.tags && trade.tags.length > 0 ? trade.tags.join(', ') : '—';
                    
                    // Entries column: show number of entries (1 for regular, 2+ for scaled)
                    const numberOfEntries = trade.numberOfEntries || 1;
                    const entriesDisplay = numberOfEntries > 1 
                        ? `<span style="background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 12px;">${numberOfEntries}</span>`
                        : `<span style="color: #94a3b8;">${numberOfEntries}</span>`;

                    return `
                        <tr style="cursor: pointer;" onclick="window.chart.orderManager.showTradeDetailsFromBottom(${index})">
                            <td>${this.tradeJournal.length - index}</td>
                            <td>${trade.symbol || 'USD'}</td>
                            <td><span class="replay-badge ${sideClass}">${direction}</span></td>
                            <td class="replay-cell-number">${quantity.toFixed(2)}</td>
                            <td class="replay-cell-center">${entriesDisplay}</td>
                            <td><span class="replay-badge ${statusClass}">${status}</span></td>
                            <td>${openTime}</td>
                            <td>${closeTime}</td>
                            <td class="replay-cell-number">${entryPrice.toFixed(5)}</td>
                            <td class="replay-cell-number">${exitPrice.toFixed(5)}</td>
                            <td class="replay-cell-number ${pnlClass}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</td>
                            <td class="replay-cell-center">${tags}</td>
                        </tr>
                    `;
                });
                
                const finalHTML = htmlContent.join('');
                replayPositionsBody.innerHTML = finalHTML;
                console.log(`✅ History tab HTML updated with ${reversedJournal.length} trade rows`);
                console.log(`   HTML length: ${finalHTML.length} characters`);
                console.log(`   First trade: ID=${reversedJournal[0]?.id}, P&L=$${reversedJournal[0]?.pnl}`);
            }
        } else {
            console.error('❌ CRITICAL: replayPositionsBody element NOT FOUND in DOM!');
        }

        // Update position counts in bottom panel
        if (replayMetaOpenCount) {
            replayMetaOpenCount.textContent = this.openPositions.length;
        }
        if (replayMetaClosedCount) {
            replayMetaClosedCount.textContent = this.tradeJournal.length;
        }
        
        // Update View All Trades button text
        const viewAllTradesBtn = document.getElementById('viewAllTradesBottomBtn');
        if (viewAllTradesBtn) {
            viewAllTradesBtn.textContent = `View All Trades (${this.tradeJournal.length})`;
        }
        
        console.log('✅ updateJournalTab() completed - History tab updated with', this.tradeJournal.length, 'trades');
        console.log('   📈 Open positions:', this.openPositions.length);
        console.log('   📊 Closed trades:', this.tradeJournal.length);
    }
    
    /**
     * Format date/time in 24-hour format
     * @param {number|Date} timestamp - Timestamp or Date object
     * @param {boolean} dateOnly - If true, returns only date (no time)
     * @returns {string} Formatted date/time string
     */
    format24Hour(timestamp, dateOnly = false) {
        if (!timestamp) return '—';
        const date = new Date(timestamp);
        
        if (dateOnly) {
            return date.toLocaleDateString('en-GB', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        }
        
        return date.toLocaleString('en-GB', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }
    
    /**
     * Format time only in 24-hour format (HH:MM:SS)
     */
    formatTimeOnly(timestamp) {
        if (!timestamp) return '—';
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        });
    }
    
    /**
     * Show trade details from bottom panel click
     */
    showTradeDetailsFromBottom(index) {
        const reversedJournal = this.tradeJournal.slice().reverse();
        const trade = reversedJournal[index];
        if (trade) {
            this.showTradeDetails(trade);
        }
    }
    
    /**
     * Debug helper - Check journal state and force refresh
     * Call from console: window.chart.orderManager.debugJournal()
     */
    debugJournal() {
        console.log('🔍 DEBUG: Journal State Check');
        console.log('   tradeJournal exists:', !!this.tradeJournal);
        console.log('   tradeJournal length:', this.tradeJournal?.length || 0);
        console.log('   tradeJournal data:', this.tradeJournal);
        console.log('   openPositions:', this.openPositions?.length || 0);
        console.log('   closedPositions:', this.closedPositions?.length || 0);
        console.log('');
        console.log('🔄 Forcing History tab refresh...');
        this.updateJournalTab();
        console.log('✅ Refresh complete');
        
        const replayPositionsBody = document.getElementById('replayPositionsBody');
        console.log('   replayPositionsBody element:', replayPositionsBody ? 'FOUND' : 'NOT FOUND');
        if (replayPositionsBody) {
            console.log('   Current innerHTML length:', replayPositionsBody.innerHTML.length);
            console.log('   Row count:', replayPositionsBody.querySelectorAll('tr').length);
        }
    }

    /**
     * Render a single trade list item
     */
    renderTradeListItem(trade, index) {
        console.log(`🎨 Rendering trade item ${index}: NEW GRADIENT STYLE`);
        
        const date = new Date(trade.closeTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const time = this.formatTimeOnly(trade.closeTime);
        const closeTypeIcon = trade.closeType === 'TP' ? '🎯' : trade.closeType === 'SL' ? '🛑' : '✋';
        const hasNotes = trade.preTradeNotes?.reason || trade.postTradeNotes?.reason;
        const tradeId = trade.tradeId || trade.id;
        const pnl = trade.netPnL || trade.pnl || 0;
        const direction = trade.direction || trade.type;
        const entryPrice = trade.entryPrice || trade.openPrice;
        const exitPrice = trade.exitPrice || trade.closePrice;
        const priceDiff = Math.abs(exitPrice - entryPrice);
        const rMultiple = trade.rMultiple || 0;
        
        // Scaled trade indicator
        const isScaledTrade = trade.isScaledTrade || false;
        const numberOfEntries = trade.numberOfEntries || 1;
        const scaledBadge = isScaledTrade ? `<span style="
            background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
            color: #000;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 700;
            font-size: 10px;
            margin-left: 4px;
        ">${numberOfEntries}x SCALED</span>` : '';
        
        // Store trade data directly on the element via data attribute
        const tradeDataJson = JSON.stringify(trade).replace(/"/g, '&quot;');
        
        console.log(`   Trade #${tradeId}: ${direction} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
        
        return `
            <div class="trade-history-item" 
                data-trade-index="${index}"
                data-trade='${tradeDataJson}'
                style="
                    background: linear-gradient(135deg, ${pnl >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'} 0%, rgba(255,255,255,0.02) 100%);
                    border: 1px solid ${pnl >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};
                    border-left: 4px solid ${pnl >= 0 ? '#22c55e' : '#ef4444'};
                    border-radius: 8px;
                    padding: 12px;
                    margin-bottom: 10px;
                    cursor: pointer;
                    transition: all 0.25s ease;
                    user-select: none;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                "
                onmouseover="this.style.transform='translateX(4px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'; this.style.borderColor='${pnl >= 0 ? '#22c55e' : '#ef4444'}';"
                onmouseout="this.style.transform='translateX(0)'; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.1)'; this.style.borderColor='${pnl >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}';">
                
                <!-- Header Row -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; pointer-events: none;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="
                            background: ${direction === 'BUY' ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'};
                            color: ${direction === 'BUY' ? '#22c55e' : '#ef4444'};
                            padding: 3px 8px;
                            border-radius: 4px;
                            font-weight: 700;
                            font-size: 11px;
                            letter-spacing: 0.5px;
                        ">${direction}</span>
                        <span style="color: #787b86; font-size: 11px; font-weight: 500;">#${tradeId}</span>
                        ${scaledBadge}
                        <span style="font-size: 14px;">${closeTypeIcon}</span>
                    </div>
                    <div style="
                        color: ${pnl >= 0 ? '#22c55e' : '#ef4444'};
                        font-weight: 800;
                        font-size: 15px;
                        text-shadow: 0 0 10px ${pnl >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'};
                    ">
                        ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
                    </div>
                </div>
                
                <!-- Date/Time Row -->
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px; pointer-events: none;">
                    <span style="color: #787b86; font-size: 10px;">📅</span>
                    <span style="color: #9ca3af; font-size: 10px; font-weight: 500;">${date}</span>
                    <span style="color: #787b86; font-size: 10px;">•</span>
                    <span style="color: #9ca3af; font-size: 10px; font-weight: 500;">${time}</span>
                    ${trade.symbol ? `<span style="color: #787b86; font-size: 10px;">•</span><span style="color: #9ca3af; font-size: 10px; font-weight: 500;">${trade.symbol}</span>` : ''}
                </div>
                
                <!-- Price Info -->
                <div style="
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    padding: 8px;
                    background: rgba(0,0,0,0.2);
                    border-radius: 6px;
                    margin-bottom: 8px;
                    pointer-events: none;
                ">
                    <div>
                        <div style="color: #787b86; font-size: 9px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.3px;">Entry</div>
                        <div style="color: #d1d4dc; font-size: 11px; font-weight: 600;">${entryPrice.toFixed(5)}</div>
                    </div>
                    <div>
                        <div style="color: #787b86; font-size: 9px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.3px;">Exit</div>
                        <div style="color: #d1d4dc; font-size: 11px; font-weight: 600;">${exitPrice.toFixed(5)}</div>
                    </div>
                </div>
                
                <!-- Screenshot Preview Row (if available) -->
                ${trade.entryScreenshot || trade.exitScreenshot ? `
                    <div style="
                        display: grid;
                        grid-template-columns: ${trade.entryScreenshot && trade.exitScreenshot ? '1fr 1fr' : '1fr'};
                        gap: 6px;
                        margin-bottom: 8px;
                        pointer-events: auto;
                    ">
                        ${trade.entryScreenshot ? `
                            <div style="position: relative; cursor: pointer;" 
                                 onclick="event.stopPropagation(); window.chart.orderManager.showScreenshotPreview('${trade.entryScreenshot}', 'Entry Screenshot')">
                                <div style="color: #787b86; font-size: 8px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.3px;">Entry</div>
                                <img src="${trade.entryScreenshot}" style="
                                    width: 100%;
                                    height: 60px;
                                    object-fit: cover;
                                    border-radius: 4px;
                                    border: 1px solid rgba(124,58,237,0.3);
                                    display: block;
                                    transition: all 0.2s;
                                " alt="Entry"
                                   onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='rgba(124,58,237,0.6)'"
                                   onmouseout="this.style.transform='scale(1)'; this.style.borderColor='rgba(124,58,237,0.3)'">
                            </div>
                        ` : ''}
                        ${trade.exitScreenshot ? `
                            <div style="position: relative; cursor: pointer;"
                                 onclick="event.stopPropagation(); window.chart.orderManager.showScreenshotPreview('${trade.exitScreenshot}', 'Exit Screenshot')">
                                <div style="color: #787b86; font-size: 8px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.3px;">Exit</div>
                                <img src="${trade.exitScreenshot}" style="
                                    width: 100%;
                                    height: 60px;
                                    object-fit: cover;
                                    border-radius: 4px;
                                    border: 1px solid rgba(124,58,237,0.3);
                                    display: block;
                                    transition: all 0.2s;
                                " alt="Exit"
                                   onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='rgba(124,58,237,0.6)'"
                                   onmouseout="this.style.transform='scale(1)'; this.style.borderColor='rgba(124,58,237,0.3)'">
                            </div>
                        ` : ''}
                    </div>
                ` : ''}
                
                <!-- Footer Row -->
                <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: none;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        ${rMultiple ? `<span style="
                            background: ${rMultiple >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'};
                            color: ${rMultiple >= 0 ? '#22c55e' : '#ef4444'};
                            padding: 2px 6px;
                            border-radius: 3px;
                            font-size: 9px;
                            font-weight: 600;
                        ">${rMultiple > 0 ? '+' : ''}${rMultiple}R</span>` : ''}
                        ${hasNotes ? '<span style="color: #7c3aed; font-size: 11px;">📝</span>' : ''}
                        ${trade.entryScreenshot || trade.exitScreenshot ? '<span style="color: #60a5fa; font-size: 11px;">📸</span>' : ''}
                    </div>
                    <span style="color: #787b86; font-size: 9px;">Click for details →</span>
                </div>
            </div>
        `;
    }
    
    /**
     * Show detailed view of a specific trade
     */
    showTradeDetails(trade) {
        console.log('🔍 showTradeDetails called with trade:', trade);
        console.log('   📸 Checking screenshots:');
        console.log('      Entry screenshot exists:', !!trade.entryScreenshot);
        console.log('      Exit screenshot exists:', !!trade.exitScreenshot);
        
        if (trade.entryScreenshot) {
            console.log('      Entry screenshot preview:', trade.entryScreenshot.substring(0, 50) + '...');
            console.log('      Entry screenshot length:', trade.entryScreenshot.length);
        }
        if (trade.exitScreenshot) {
            console.log('      Exit screenshot preview:', trade.exitScreenshot.substring(0, 50) + '...');
            console.log('      Exit screenshot length:', trade.exitScreenshot.length);
        }
        
        if (!trade) {
            console.error('❌ No trade data provided!');
            alert('Error: No trade data available');
            return;
        }
        
        // Remove existing modal if any
        const existingModal = document.getElementById('tradeDetailsModal');
        if (existingModal) {
            console.log('Removing existing modal');
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.id = 'tradeDetailsModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            backdrop-filter: blur(4px);
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: linear-gradient(135deg, #1a1e2e 0%, #1f2937 100%);
            border-radius: 16px;
            padding: 32px;
            max-width: 900px;
            width: 95%;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6);
            border: 1px solid rgba(124,58,237,0.2);
            scroll-behavior: smooth;
        `;
        
        // Add custom scrollbar styling
        const style = document.createElement('style');
        style.textContent = `
            #tradeDetailsModal > div::-webkit-scrollbar {
                width: 10px;
            }
            #tradeDetailsModal > div::-webkit-scrollbar-track {
                background: rgba(30,41,59,0.5);
                border-radius: 10px;
            }
            #tradeDetailsModal > div::-webkit-scrollbar-thumb {
                background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
                border-radius: 10px;
            }
            #tradeDetailsModal > div::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%);
            }
        `;
        document.head.appendChild(style);
        
        // Handle field name variations
        const pnl = trade.netPnL || trade.pnl || 0;
        const tradeId = trade.tradeId || trade.id;
        const direction = trade.direction || trade.type;
        const entryPrice = trade.entryPrice || trade.openPrice;
        const exitPrice = trade.exitPrice || trade.closePrice;
        
        const openDate = this.format24Hour(trade.openTime);
        const closeDate = this.format24Hour(trade.closeTime);
        const closeTypeIcon = trade.closeType === 'TP' ? '🎯 Take Profit' : trade.closeType === 'SL' ? '🛑 Stop Loss' : '✋ Manual Close';
        
        // Calculate price move in pips using helper
        const priceDiff = Math.abs((exitPrice || 0) - (entryPrice || 0));
        const pipsMove = this.priceToPips(priceDiff);
        
        console.log('📊 Modal data:', { pnl, tradeId, direction, entryPrice, exitPrice, pipsMove });
        
        modalContent.innerHTML = `
            <!-- Modal Header -->
            <div style="
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 28px;
                padding-bottom: 20px;
                border-bottom: 1px solid rgba(148,163,184,0.2);
            ">
                <div>
                    <h2 style="color: #e5e7eb; margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">
                        Trade #${tradeId}
                    </h2>
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 14px; color: #94a3b8;">
                        <span style="font-weight: 600;">${direction}</span>
                        <span>•</span>
                        <span>${trade.symbol || 'Unknown Pair'}</span>
                        <span>•</span>
                        <span>${trade.quantity.toFixed(2)} Lots</span>
                    </div>
                </div>
                <button id="closeTradeDetails" style="
                    background: rgba(148,163,184,0.1);
                    border: 1px solid rgba(148,163,184,0.2);
                    color: #94a3b8;
                    font-size: 20px;
                    cursor: pointer;
                    padding: 6px;
                    width: 32px;
                    height: 32px;
                    border-radius: 6px;
                    transition: all 0.2s;
                    line-height: 1;
                " onmouseover="this.style.background='rgba(148,163,184,0.2)'; this.style.color='#e5e7eb';" onmouseout="this.style.background='rgba(148,163,184,0.1)'; this.style.color='#94a3b8';">×</button>
            </div>
            
            <!-- P&L Banner -->
            <div style="
                background: rgba(30,41,59,0.4);
                border: 1px solid rgba(148,163,184,0.2);
                border-radius: 8px;
                padding: 24px;
                margin-bottom: 28px;
                text-align: center;
            ">
                <div style="color: #94a3b8; font-size: 12px; font-weight: 600; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Net Profit/Loss
                </div>
                <div style="color: ${pnl >= 0 ? '#22c55e' : '#ef4444'}; font-size: 42px; font-weight: 800; margin-bottom: 12px;">
                    ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
                </div>
                <div style="color: #cbd5e1; font-size: 14px; font-weight: 500; display: flex; align-items: center; justify-content: center; gap: 16px; flex-wrap: wrap;">
                    <span>${trade.closeType || 'Manual'}</span>
                    ${trade.rMultiple !== undefined && trade.rMultiple !== null ? `
                        <span style="color: ${trade.rMultiple >= 0 ? '#22c55e' : '#ef4444'}; font-weight: 700;">${trade.rMultiple.toFixed(2)}R</span>
                    ` : ''}
                    ${trade.rewardToRiskRatio ? `
                        <span>RR: ${trade.rewardToRiskRatio}:1</span>
                    ` : ''}
                </div>
            </div>
            
            <!-- Trade Info Grid -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 16px; margin-bottom: 28px; padding: 24px; background: rgba(30,41,59,0.3); border: 1px solid rgba(148,163,184,0.15); border-radius: 8px;">
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Entry Price</div>
                    <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">$${(trade.entryPrice || trade.openPrice || 0).toFixed(5)}</div>
                </div>
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Exit Price</div>
                    <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">$${(trade.exitPrice || trade.closePrice || 0).toFixed(5)}</div>
                </div>
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Price Move</div>
                    <div style="color: ${pnl >= 0 ? '#22c55e' : '#ef4444'}; font-size: 15px; font-weight: 700;">
                        ${pipsMove.toFixed(1)} pips
                    </div>
                </div>
                
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Stop Loss</div>
                    <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">${trade.stopLoss ? '$' + trade.stopLoss.toFixed(5) : '—'}</div>
                </div>
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Take Profit</div>
                    <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">${trade.takeProfit ? '$' + trade.takeProfit.toFixed(5) : '—'}</div>
                </div>
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Risk Amount</div>
                    <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">$${(trade.riskPerTrade || trade.riskAmount || 0).toFixed(2)}</div>
                </div>
                
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Net P&L</div>
                    <div style="color: ${pnl >= 0 ? '#22c55e' : '#ef4444'}; font-size: 15px; font-weight: 700;">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</div>
                </div>
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">R-Multiple (Actual)</div>
                    <div style="color: ${(trade.rMultiple || 0) >= 0 ? '#22c55e' : '#ef4444'}; font-size: 15px; font-weight: 700;">${trade.rMultiple !== undefined && trade.rMultiple !== null ? trade.rMultiple.toFixed(2) + 'R' : '—'}</div>
                </div>
                <div>
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">RR (Planned)</div>
                    <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">${trade.rewardToRiskRatio ? trade.rewardToRiskRatio + ':1' : '—'}</div>
                </div>
            </div>

            <!-- Additional Details -->
            <div style="background: rgba(30,41,59,0.3); border: 1px solid rgba(148,163,184,0.15); border-radius: 8px; padding: 24px; margin-bottom: 28px;">
                <div style="color: #cbd5e1; font-size: 12px; font-weight: 600; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Additional Information
                </div>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px 16px; font-size: 13px;">
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Position Size</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.quantity ? trade.quantity.toFixed(2) + ' Lots' : '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Holding Time</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.holdingTimeHours ? trade.holdingTimeHours + ' hours' : '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Close Type</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.closeType || 'Manual'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Day of Week</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.dayOfWeek || '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Hour of Entry</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.hourOfEntry !== undefined && trade.hourOfEntry !== null ? String(trade.hourOfEntry).padStart(2, '0') + 'h' : '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Hour of Exit</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.hourOfExit !== undefined && trade.hourOfExit !== null ? String(trade.hourOfExit).padStart(2, '0') + 'h' : '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Month</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.month || '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Year</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${trade.year || '—'}</div>
                    </div>
                    <div></div>
                    <div style="grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid rgba(148,163,184,0.15); margin-top: 8px;">
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Entry Time (24H)</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${openDate || '—'}</div>
                    </div>
                    <div style="grid-column: 1 / -1;">
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Exit Time (24H)</div>
                        <div style="color: #e5e7eb; font-weight: 700;">${closeDate || '—'}</div>
                    </div>
                </div>
            </div>

            <!-- Excursion Analysis -->
            <div style="background: rgba(30,41,59,0.3); border: 1px solid rgba(148,163,184,0.15); border-radius: 8px; padding: 24px; margin-bottom: 28px;">
                <div style="color: #cbd5e1; font-size: 12px; font-weight: 600; margin-bottom: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
                    Excursion Analysis (MFE/MAE)
                </div>
                <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">MFE (Maximum Favorable)</div>
                        <div style="color: #22c55e; font-size: 15px; font-weight: 700;">${trade.mfe ? '$' + trade.mfe.toFixed(5) : '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">MAE (Maximum Adverse)</div>
                        <div style="color: #ef4444; font-size: 15px; font-weight: 700;">${trade.mae ? '$' + trade.mae.toFixed(5) : '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Highest Price</div>
                        <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">${trade.highestPrice ? '$' + trade.highestPrice.toFixed(5) : '—'}</div>
                    </div>
                    <div>
                        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Lowest Price</div>
                        <div style="color: #e5e7eb; font-size: 15px; font-weight: 700;">${trade.lowestPrice ? '$' + trade.lowestPrice.toFixed(5) : '—'}</div>
                    </div>
                </div>
            </div>
            
            ${trade.isScaledTrade && trade.scaledEntries ? `
                <!-- Scaled Position Breakdown -->
                <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 8px; padding: 24px; margin-bottom: 28px;">
                    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
                        <div style="background: #f59e0b; color: #000; padding: 6px 12px; border-radius: 6px; font-weight: 700; font-size: 12px;">
                            📊 SCALED POSITION
                        </div>
                        <div style="color: #cbd5e1; font-size: 14px; font-weight: 600;">
                            ${trade.numberOfEntries} Entries Combined
                        </div>
                    </div>
                    
                    <div style="color: #94a3b8; font-size: 11px; margin-bottom: 12px; font-weight: 500;">INDIVIDUAL ENTRIES</div>
                    
                    <div style="background: rgba(0,0,0,0.2); border-radius: 6px; padding: 12px;">
                        ${trade.scaledEntries.map((entry, idx) => `
                            <div style="
                                background: rgba(30,41,59,0.5);
                                border: 1px solid rgba(148,163,184,0.15);
                                border-radius: 6px;
                                padding: 12px 16px;
                                ${idx < trade.scaledEntries.length - 1 ? 'margin-bottom: 8px;' : ''}
                                display: grid;
                                grid-template-columns: auto 1fr 1fr 1fr 1fr;
                                gap: 16px;
                                align-items: center;
                                font-size: 12px;
                            ">
                                <div style="color: #94a3b8; font-weight: 600;">#${idx + 1}</div>
                                <div>
                                    <div style="color: #94a3b8; font-size: 10px; margin-bottom: 4px;">Quantity</div>
                                    <div style="color: #e5e7eb; font-weight: 700;">${entry.quantity.toFixed(2)} lots</div>
                                </div>
                                <div>
                                    <div style="color: #94a3b8; font-size: 10px; margin-bottom: 4px;">Entry</div>
                                    <div style="color: #e5e7eb; font-weight: 700;">$${entry.openPrice.toFixed(5)}</div>
                                </div>
                                <div>
                                    <div style="color: #94a3b8; font-size: 10px; margin-bottom: 4px;">Exit</div>
                                    <div style="color: #e5e7eb; font-weight: 700;">$${entry.closePrice.toFixed(5)}</div>
                                </div>
                                <div>
                                    <div style="color: #94a3b8; font-size: 10px; margin-bottom: 4px;">P&L</div>
                                    <div style="color: ${entry.pnl >= 0 ? '#22c55e' : '#ef4444'}; font-weight: 700;">
                                        ${entry.pnl >= 0 ? '+' : ''}$${entry.pnl.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid rgba(245, 158, 11, 0.2); display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; font-size: 13px;">
                        <div>
                            <div style="color: #94a3b8; font-size: 10px; margin-bottom: 6px; font-weight: 500;">Total Quantity</div>
                            <div style="color: #f59e0b; font-weight: 700;">${trade.quantity.toFixed(2)} lots</div>
                        </div>
                        <div>
                            <div style="color: #94a3b8; font-size: 10px; margin-bottom: 6px; font-weight: 500;">Avg Entry</div>
                            <div style="color: #f59e0b; font-weight: 700;">$${trade.entryPrice.toFixed(5)}</div>
                        </div>
                        <div>
                            <div style="color: #94a3b8; font-size: 10px; margin-bottom: 6px; font-weight: 500;">Total P&L</div>
                            <div style="color: ${pnl >= 0 ? '#22c55e' : '#ef4444'}; font-weight: 700;">
                                ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}
                            </div>
                        </div>
                    </div>
                </div>
            ` : ''}
            
            ${trade.preTradeNotes ? `
                <div style="margin-bottom: 24px;">
                    <div style="
                        background: rgba(30,41,59,0.3);
                        border: 1px solid rgba(148,163,184,0.2);
                        border-left: 3px solid rgba(148,163,184,0.4);
                        border-radius: 8px;
                        padding: 24px;
                    ">
                        <h4 style="color: #cbd5e1; font-size: 12px; margin: 0 0 16px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            Pre-Trade Notes
                        </h4>
                        ${trade.preTradeNotes.reason ? `
                            <div style="margin-bottom: 16px;">
                                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Why taking this trade</div>
                                <div style="color: #e5e7eb; font-size: 13px; line-height: 1.6;">${trade.preTradeNotes.reason}</div>
                            </div>
                        ` : ''}
                        ${trade.preTradeNotes.setup ? `
                            <div style="margin-bottom: 16px;">
                                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Setup/Strategy</div>
                                <div style="color: #e5e7eb; font-size: 13px; line-height: 1.6;">${trade.preTradeNotes.setup}</div>
                            </div>
                        ` : ''}
                        ${trade.preTradeNotes.tags ? `
                            <div>
                                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 8px; font-weight: 500;">Tags</div>
                                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                    ${trade.preTradeNotes.tags.split(',').map(tag => 
                                        `<span style="background: rgba(148,163,184,0.2); color: #e5e7eb; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 500; border: 1px solid rgba(148,163,184,0.3);">${tag.trim()}</span>`
                                    ).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            ${trade.postTradeNotes ? `
                <div style="margin-bottom: 24px;">
                    <div style="
                        background: rgba(30,41,59,0.3);
                        border: 1px solid rgba(148,163,184,0.2);
                        border-left: 3px solid rgba(148,163,184,0.4);
                        border-radius: 8px;
                        padding: 24px;
                    ">
                        <h4 style="color: #cbd5e1; font-size: 12px; margin: 0 0 16px 0; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                            Post-Trade Analysis
                        </h4>
                        ${trade.postTradeNotes.reason ? `
                            <div style="margin-bottom: 16px;">
                                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">Lessons learned</div>
                                <div style="color: #e5e7eb; font-size: 13px; line-height: 1.6;">${trade.postTradeNotes.reason}</div>
                            </div>
                        ` : ''}
                        ${trade.postTradeNotes.setup ? `
                            <div style="margin-bottom: 16px;">
                                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 6px; font-weight: 500;">What could be improved</div>
                                <div style="color: #e5e7eb; font-size: 13px; line-height: 1.6;">${trade.postTradeNotes.setup}</div>
                            </div>
                        ` : ''}
                        ${trade.postTradeNotes.tags ? `
                            <div>
                                <div style="color: #94a3b8; font-size: 11px; margin-bottom: 8px; font-weight: 500;">Tags</div>
                                <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                                    ${trade.postTradeNotes.tags.split(',').map(tag => 
                                        `<span style="background: rgba(148,163,184,0.2); color: #e5e7eb; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 500; border: 1px solid rgba(148,163,184,0.3);">${tag.trim()}</span>`
                                    ).join('')}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>
            ` : ''}
            
            <!-- Trade Screenshots -->
            ${trade.entryScreenshot || trade.exitScreenshot || (trade.entryScreenshots && trade.entryScreenshots.length > 0) ? `
                <div style="margin-bottom: 28px;">
                    <div style="color: #cbd5e1; font-size: 12px; font-weight: 600; margin-bottom: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
                        Chart Screenshots ${trade.isScaledTrade && trade.entryScreenshots ? `(${trade.entryScreenshots.length} entries)` : ''}
                    </div>
                    
                    ${trade.isScaledTrade && trade.entryScreenshots && trade.entryScreenshots.length > 0 ? `
                        <!-- Multiple Entry Screenshots for Scaled Trade -->
                        <div style="margin-bottom: 16px;">
                            <div style="color: #94a3b8; font-size: 11px; margin-bottom: 10px; font-weight: 500;">Entry Screenshots</div>
                            <div style="display: grid; grid-template-columns: repeat(${Math.min(trade.entryScreenshots.length, 3)}, 1fr); gap: 12px;">
                                ${trade.entryScreenshots.map((entry, idx) => `
                                    <div>
                                        <div style="color: #64748b; font-size: 10px; margin-bottom: 6px;">
                                            Entry #${idx + 1} @ ${entry.openPrice ? entry.openPrice.toFixed(5) : 'N/A'}
                                        </div>
                                        <div style="
                                            background: rgba(30,41,59,0.3);
                                            border: 1px solid rgba(148,163,184,0.2);
                                            border-radius: 8px;
                                            overflow: hidden;
                                            cursor: pointer;
                                            transition: all 0.2s;
                                        " onclick="window.chart.orderManager.showScreenshotPreview('${entry.screenshot}', 'Entry #${idx + 1}')" 
                                           onmouseover="this.style.borderColor='rgba(148,163,184,0.4)';" 
                                           onmouseout="this.style.borderColor='rgba(148,163,184,0.2)';">
                                            <img src="${entry.screenshot}" 
                                                 style="width: 100%; height: 80px; object-fit: cover; display: block;" 
                                                 alt="Entry ${idx + 1}">
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                        ${trade.exitScreenshot ? `
                        <!-- Exit Screenshot for Scaled Trade -->
                        <div>
                            <div style="color: #94a3b8; font-size: 11px; margin-bottom: 10px; font-weight: 500;">Exit Screenshot</div>
                            <div style="
                                background: rgba(30,41,59,0.3);
                                border: 1px solid rgba(148,163,184,0.2);
                                border-radius: 8px;
                                overflow: hidden;
                                cursor: pointer;
                                transition: all 0.2s;
                                max-width: 300px;
                            " onclick="window.chart.orderManager.showScreenshotPreview('${trade.exitScreenshot}', 'Exit Screenshot')" 
                               onmouseover="this.style.borderColor='rgba(148,163,184,0.4)';" 
                               onmouseout="this.style.borderColor='rgba(148,163,184,0.2)';">
                                <img src="${trade.exitScreenshot}" 
                                     style="width: 100%; display: block;" 
                                     alt="Exit Screenshot">
                            </div>
                        </div>
                        ` : ''}
                    ` : trade.entryScreenshot ? `
                        <!-- Single Entry Screenshot -->
                        <div style="display: grid; grid-template-columns: ${trade.exitScreenshot ? '1fr 1fr' : '1fr'}; gap: 16px;">
                            <div>
                                <div style="
                                    color: #94a3b8; 
                                    font-size: 11px; 
                                    margin-bottom: 10px; 
                                    font-weight: 500;
                                ">Entry (Trade Open)</div>
                                <div style="
                                    background: rgba(30,41,59,0.3);
                                    border: 1px solid rgba(148,163,184,0.2);
                                    border-radius: 8px;
                                    overflow: hidden;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                " onclick="window.chart.orderManager.showScreenshotPreview('${trade.entryScreenshot}', 'Entry Screenshot')" 
                                   onmouseover="this.style.borderColor='rgba(148,163,184,0.4)'; this.style.transform='translateY(-2px)';" 
                                   onmouseout="this.style.borderColor='rgba(148,163,184,0.2)'; this.style.transform='translateY(0)';">
                                    <img src="${trade.entryScreenshot}" 
                                         style="width: 100%; display: block;" 
                                         alt="Entry Screenshot"
                                         onerror="console.error('Entry screenshot failed to load'); this.style.display='none';">
                                    <div style="padding: 10px; background: rgba(30,41,59,0.5); text-align: center; border-top: 1px solid rgba(148,163,184,0.1);">
                                        <span style="color: #94a3b8; font-size: 11px; font-weight: 500;">Click to enlarge</span>
                                    </div>
                                </div>
                            </div>
                        ${trade.exitScreenshot ? `
                            <div>
                                <div style="
                                    color: #94a3b8; 
                                    font-size: 11px; 
                                    margin-bottom: 10px; 
                                    font-weight: 500;
                                ">Exit (Trade Close)</div>
                                <div style="
                                    background: rgba(30,41,59,0.3);
                                    border: 1px solid rgba(148,163,184,0.2);
                                    border-radius: 8px;
                                    overflow: hidden;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                " onclick="window.chart.orderManager.showScreenshotPreview('${trade.exitScreenshot}', 'Exit Screenshot')" 
                                   onmouseover="this.style.borderColor='rgba(148,163,184,0.4)'; this.style.transform='translateY(-2px)';" 
                                   onmouseout="this.style.borderColor='rgba(148,163,184,0.2)'; this.style.transform='translateY(0)';">
                                    <img src="${trade.exitScreenshot}" 
                                         style="width: 100%; display: block;" 
                                         alt="Exit Screenshot"
                                         onerror="console.error('Exit screenshot failed to load'); this.style.display='none'; this.nextElementSibling.innerHTML='<span style=color:#ef4444;padding:20px;display:block;text-align:center;>Failed to load image</span>';">
                                    <div style="padding: 10px; background: rgba(30,41,59,0.5); text-align: center; border-top: 1px solid rgba(148,163,184,0.1);">
                                        <span style="color: #94a3b8; font-size: 11px; font-weight: 500;">Click to enlarge</span>
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                        </div>
                    ` : ''}
                </div>
            ` : ''}
            
            <!-- Action Buttons -->
            <div style="display: flex; gap: 12px; margin-bottom: 0;">
                ${!trade.preTradeNotes || !trade.postTradeNotes ? `
                    <button id="addNotesBtn" style="
                        flex: 1;
                        padding: 14px;
                        background: rgba(30,41,59,0.5);
                        color: #cbd5e1;
                        border: 1px solid rgba(148,163,184,0.3);
                        border-radius: 6px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(30,41,59,0.7)'; this.style.borderColor='rgba(148,163,184,0.5)';" onmouseout="this.style.background='rgba(30,41,59,0.5)'; this.style.borderColor='rgba(148,163,184,0.3)';">
                        ${!trade.preTradeNotes && !trade.postTradeNotes ? 'Add Notes' : 'Add Missing Notes'}
                    </button>
                ` : ''}
                <button id="backToJournal" style="
                    ${!trade.preTradeNotes || !trade.postTradeNotes ? 'flex: 1;' : 'width: 100%;'}
                    padding: 14px;
                    background: rgba(148,163,184,0.15);
                    color: #e5e7eb;
                    border: 1px solid rgba(148,163,184,0.3);
                    border-radius: 6px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                " onmouseover="this.style.background='rgba(148,163,184,0.25)'; this.style.borderColor='rgba(148,163,184,0.5)';" onmouseout="this.style.background='rgba(148,163,184,0.15)'; this.style.borderColor='rgba(148,163,184,0.3)';">
                    Back to Journal
                </button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event listeners
        document.getElementById('closeTradeDetails').onclick = () => modal.remove();
        document.getElementById('backToJournal').onclick = () => {
            modal.remove();
            this.showJournalHistory();
        };
        
        // Add Notes button listener (if it exists)
        const addNotesBtn = document.getElementById('addNotesBtn');
        if (addNotesBtn) {
            addNotesBtn.onclick = () => {
                modal.remove();
                // Determine which type of note to add
                if (!trade.preTradeNotes) {
                    this.showPreTradeNoteModal(trade);
                } else if (!trade.postTradeNotes) {
                    this.showPostTradeNoteModal(trade);
                }
            };
        }
        
        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        console.log('✅ Trade details modal displayed successfully');
    }
    
    /**
     * Show screenshot in full-size preview modal
     */
    showScreenshotPreview(imageDataUrl, title = 'Screenshot') {
        // Remove existing preview if any
        const existingPreview = document.getElementById('screenshotPreviewModal');
        if (existingPreview) existingPreview.remove();
        
        const modal = document.createElement('div');
        modal.id = 'screenshotPreviewModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: zoom-out;
            animation: fadeIn 0.2s ease;
        `;
        
        modal.innerHTML = `
            <style>
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes zoomIn {
                    from { transform: scale(0.9); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
            </style>
            
            <div style="
                position: relative;
                max-width: 95vw;
                max-height: 95vh;
                display: flex;
                flex-direction: column;
                animation: zoomIn 0.3s ease;
            ">
                <!-- Header -->
                <div style="
                    background: linear-gradient(135deg, #7c3aed 0%, #2563eb 100%);
                    padding: 16px 24px;
                    border-radius: 12px 12px 0 0;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <h3 style="
                        color: white;
                        font-size: 18px;
                        font-weight: 600;
                        margin: 0;
                        display: flex;
                        align-items: center;
                        gap: 8px;
                    ">
                        <span>📸</span>
                        <span>${title}</span>
                    </h3>
                    <button onclick="this.closest('#screenshotPreviewModal').remove()" style="
                        background: rgba(255, 255, 255, 0.2);
                        border: none;
                        color: white;
                        width: 32px;
                        height: 32px;
                        border-radius: 6px;
                        cursor: pointer;
                        font-size: 20px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(255,255,255,0.3)'" 
                       onmouseout="this.style.background='rgba(255,255,255,0.2)'">
                        ✕
                    </button>
                </div>
                
                <!-- Image Container -->
                <div style="
                    background: #1a1a1a;
                    border-radius: 0 0 12px 12px;
                    overflow: auto;
                    max-width: 95vw;
                    max-height: calc(95vh - 64px);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 20px;
                ">
                    <img src="${imageDataUrl}" 
                         style="
                            max-width: 100%;
                            max-height: 100%;
                            width: auto;
                            height: auto;
                            display: block;
                            border-radius: 8px;
                            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
                         " 
                         alt="${title}"
                         onclick="event.stopPropagation()">
                </div>
                
                <!-- Instructions -->
                <div style="
                    text-align: center;
                    color: rgba(255,255,255,0.6);
                    font-size: 12px;
                    margin-top: 12px;
                ">
                    Click outside or press ESC to close
                </div>
            </div>
        `;
        
        // Close on background click
        modal.onclick = () => modal.remove();
        
        // Close on ESC key
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', handleKeyDown);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        
        // Remove keydown listener when modal is removed
        modal.addEventListener('DOMNodeRemoved', () => {
            document.removeEventListener('keydown', handleKeyDown);
        });
        
        document.body.appendChild(modal);
    }
    
    /**
     * Show all trades in a full data table (Excel-style)
     */
    showAllTradesTable() {
        // Remove existing modal if any
        const existingModal = document.getElementById('allTradesTableModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'allTradesTableModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.85);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: linear-gradient(135deg, #1a1e2e 0%, #1f2937 100%);
            border-radius: 12px;
            padding: 28px;
            max-width: 95%;
            width: 1400px;
            max-height: 90vh;
            overflow: hidden;
            box-shadow: 0 20px 60px rgba(0,0,0,0.6);
            border: 1px solid rgba(148,163,184,0.2);
            display: flex;
            flex-direction: column;
        `;
        
        // Build table HTML
        const columns = [
            { key: 'tradeId', label: 'ID' },
            { key: 'direction', label: 'Direction' },
            { key: 'symbol', label: 'Symbol' },
            { key: 'quantity', label: 'Lots' },
            { key: 'entryPrice', label: 'Entry' },
            { key: 'exitPrice', label: 'Exit' },
            { key: 'stopLoss', label: 'SL' },
            { key: 'takeProfit', label: 'TP' },
            { key: 'netPnL', label: 'P&L' },
            { key: 'rMultiple', label: 'R-Multiple' },
            { key: 'rewardToRiskRatio', label: 'RR Ratio' },
            { key: 'riskAmount', label: 'Risk $' },
            { key: 'holdingTimeHours', label: 'Duration (h)' },
            { key: 'dayOfWeek', label: 'Day' },
            { key: 'hourOfEntry', label: 'Entry Hour' },
            { key: 'hourOfExit', label: 'Exit Hour' },
            { key: 'month', label: 'Month' },
            { key: 'year', label: 'Year' },
            { key: 'closeType', label: 'Close Type' },
            { key: 'mfe', label: 'MFE' },
            { key: 'mae', label: 'MAE' },
            { key: 'highestPrice', label: 'High' },
            { key: 'lowestPrice', label: 'Low' }
        ];
        
        let tableRows = '';
        this.tradeJournal.forEach(trade => {
            tableRows += '<tr style="border-bottom: 1px solid rgba(148,163,184,0.1);">';
            columns.forEach(col => {
                let value = trade[col.key];
                
                // Format value
                if (value === null || value === undefined) {
                    value = '—';
                } else if (col.key.includes('Price') || col.key === 'mfe' || col.key === 'mae' || col.key === 'stopLoss' || col.key === 'takeProfit') {
                    value = typeof value === 'number' ? value.toFixed(5) : value;
                } else if (col.key === 'netPnL' || col.key === 'riskAmount') {
                    value = typeof value === 'number' ? (value >= 0 ? '+$' : '-$') + Math.abs(value).toFixed(2) : value;
                } else if (col.key === 'quantity' || col.key === 'holdingTimeHours') {
                    value = typeof value === 'number' ? value.toFixed(2) : value;
                } else if (col.key === 'rewardToRiskRatio') {
                    value = value ? value + ':1' : '—';
                } else if (col.key === 'hourOfEntry' || col.key === 'hourOfExit') {
                    value = value !== null && value !== undefined ? String(value).padStart(2, '0') + 'h' : '—';
                }
                
                // Color coding for P&L
                let color = '#e5e7eb';
                if (col.key === 'netPnL' && typeof trade.netPnL === 'number') {
                    color = trade.netPnL >= 0 ? '#22c55e' : '#ef4444';
                } else if (col.key === 'rMultiple' && typeof trade.rMultiple === 'number') {
                    color = trade.rMultiple >= 0 ? '#22c55e' : '#ef4444';
                }
                
                tableRows += `<td style="padding: 10px 12px; color: ${color}; font-size: 12px; white-space: nowrap;">${value}</td>`;
            });
            tableRows += '</tr>';
        });
        
        modalContent.innerHTML = `
            <!-- Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                <h2 style="color: #e5e7eb; margin: 0; font-size: 22px; font-weight: 700;">
                    All Trades (${this.tradeJournal.length})
                </h2>
                <div style="display: flex; gap: 12px; align-items: center;">
                    <button id="exportCSVBtn" style="
                        padding: 10px 16px;
                        background: rgba(34,197,94,0.15);
                        color: #22c55e;
                        border: 1px solid rgba(34,197,94,0.3);
                        border-radius: 6px;
                        font-size: 13px;
                        font-weight: 600;
                        cursor: pointer;
                        transition: all 0.2s;
                    " onmouseover="this.style.background='rgba(34,197,94,0.25)'; this.style.borderColor='rgba(34,197,94,0.5)';" onmouseout="this.style.background='rgba(34,197,94,0.15)'; this.style.borderColor='rgba(34,197,94,0.3)';">
                        Export to CSV
                    </button>
                    <button id="closeTableModal" style="
                        background: rgba(148,163,184,0.1);
                        border: 1px solid rgba(148,163,184,0.2);
                        color: #94a3b8;
                        font-size: 20px;
                        cursor: pointer;
                        padding: 6px;
                        width: 32px;
                        height: 32px;
                        border-radius: 6px;
                        transition: all 0.2s;
                        line-height: 1;
                    " onmouseover="this.style.background='rgba(148,163,184,0.2)'; this.style.color='#e5e7eb';" onmouseout="this.style.background='rgba(148,163,184,0.1)'; this.style.color='#94a3b8';">×</button>
                </div>
            </div>
            
            <!-- Table Container -->
            <div style="flex: 1; overflow: auto; background: rgba(30,41,59,0.3); border: 1px solid rgba(148,163,184,0.15); border-radius: 8px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead style="position: sticky; top: 0; background: rgba(30,41,59,0.95); backdrop-filter: blur(8px); z-index: 10;">
                        <tr style="border-bottom: 2px solid rgba(148,163,184,0.3);">
                            ${columns.map(col => `
                                <th style="padding: 12px; text-align: left; color: #cbd5e1; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap;">
                                    ${col.label}
                                </th>
                            `).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event listeners
        document.getElementById('closeTableModal').onclick = () => modal.remove();
        document.getElementById('exportCSVBtn').onclick = () => this.exportTradesToCSV();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
        
        console.log('✅ All trades table displayed');
    }
    
    /**
     * Export trades to CSV file
     */
    exportTradesToCSV() {
        const columns = [
            'Trade ID', 'Direction', 'Symbol', 'Lots', 'Entry Price', 'Exit Price',
            'Stop Loss', 'Take Profit', 'Net P&L', 'R-Multiple', 'RR Ratio', 'Risk Amount',
            'Holding Time (hours)', 'Day of Week', 'Entry Hour', 'Exit Hour', 'Month', 'Year',
            'Close Type', 'MFE', 'MAE', 'Highest Price', 'Lowest Price',
            'Entry Time', 'Exit Time'
        ];
        
        // Build CSV content
        let csv = columns.join(',') + '\n';
        
        this.tradeJournal.forEach(trade => {
            const row = [
                trade.tradeId || '',
                trade.direction || '',
                trade.symbol || '',
                trade.quantity ? trade.quantity.toFixed(2) : '',
                trade.entryPrice ? trade.entryPrice.toFixed(5) : '',
                trade.exitPrice ? trade.exitPrice.toFixed(5) : '',
                trade.stopLoss ? trade.stopLoss.toFixed(5) : '',
                trade.takeProfit ? trade.takeProfit.toFixed(5) : '',
                trade.netPnL ? trade.netPnL.toFixed(2) : '',
                trade.rMultiple || '',
                trade.rewardToRiskRatio || '',
                trade.riskAmount ? trade.riskAmount.toFixed(2) : '',
                trade.holdingTimeHours || '',
                trade.dayOfWeek || '',
                trade.hourOfEntry !== null && trade.hourOfEntry !== undefined ? trade.hourOfEntry : '',
                trade.hourOfExit !== null && trade.hourOfExit !== undefined ? trade.hourOfExit : '',
                trade.month || '',
                trade.year || '',
                trade.closeType || '',
                trade.mfe ? trade.mfe.toFixed(5) : '',
                trade.mae ? trade.mae.toFixed(5) : '',
                trade.highestPrice ? trade.highestPrice.toFixed(5) : '',
                trade.lowestPrice ? trade.lowestPrice.toFixed(5) : '',
                trade.openTime ? this.format24Hour(trade.openTime) : '',
                trade.closeTime ? this.format24Hour(trade.closeTime) : ''
            ];
            
            // Escape values that might contain commas
            const escapedRow = row.map(val => {
                if (typeof val === 'string' && val.includes(',')) {
                    return `"${val}"`;
                }
                return val;
            });
            
            csv += escapedRow.join(',') + '\n';
        });
        
        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `trade_journal_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`✅ Exported ${this.tradeJournal.length} trades to CSV`);
        this.showNotification(`✅ Exported ${this.tradeJournal.length} trades to CSV`, 'success');
    }
    
    /**
     * Create and show trade journal modal
     */
    showTradeJournalModal(order, isClosing = false, closeData = null) {
        // Remove existing modal if any
        const existingModal = document.getElementById('tradeJournalModal');
        if (existingModal) existingModal.remove();
        
        const modal = document.createElement('div');
        modal.id = 'tradeJournalModal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
        `;
        
        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: #1a1e2e;
            border-radius: 12px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
            border: 1px solid #2a2e39;
        `;
        
        // Calculate trade metadata
        const entryDate = new Date(order.openTime);
        const symbol = this.chart.symbol || 'UNKNOWN';
        const dayOfWeek = entryDate.toLocaleDateString('en-US', { weekday: 'long' });
        const month = entryDate.toLocaleDateString('en-US', { month: 'long' });
        const year = entryDate.getFullYear();
        const hourOfEntry = entryDate.getHours();
        const entryTimeStr = entryDate.toLocaleString();
        
        // Calculate R:R if closing (use originalRiskAmount for trailing SL accuracy)
        let rewardToRisk = '';
        let rMultiple = '';
        if (closeData) {
            const riskForCalc = order.originalRiskAmount || order.riskAmount;
            if (riskForCalc) {
                const rr = Math.abs(closeData.pnl) / riskForCalc;
                const rm = closeData.pnl / riskForCalc;
                rewardToRisk = rr.toFixed(2);
                rMultiple = (rm >= 0 ? '+' : '') + rm.toFixed(2) + 'R';
            }
        }
        
        const title = isClosing ? '📝 Trade Closed - Add Notes' : '📝 Trade Journal Entry';
        
        // Check for multi-trade (scaled or split)
        const isMultiTrade = closeData && (closeData.isScaledTrade || closeData.isSplitTrade);
        const multiTradeLabel = closeData?.isScaledTrade ? 'Scaled Trade' : closeData?.isSplitTrade ? 'Split Entry' : '';
        const numEntries = closeData?.numberOfEntries || 1;
        
        const resultInfo = closeData ? `
            <div style="background: ${closeData.pnl >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; 
                        border: 1px solid ${closeData.pnl >= 0 ? '#22c55e' : '#ef4444'}; 
                        border-radius: 6px; padding: 12px; margin-bottom: 16px; text-align: center;">
                ${isMultiTrade ? `<div style="font-size: 10px; color: #f59e0b; margin-bottom: 4px; font-weight: 600;">📊 ${multiTradeLabel} (${numEntries} entries)</div>` : ''}
                <div style="font-size: 24px; font-weight: 700; color: ${closeData.pnl >= 0 ? '#22c55e' : '#ef4444'}; margin-bottom: 4px;">
                    ${closeData.pnl >= 0 ? '+' : ''}$${closeData.pnl.toFixed(2)} ${rMultiple}
                </div>
                <div style="font-size: 12px; color: #787b86;">
                    ${closeData.type === 'TP' ? '🎯 Take Profit' : closeData.type === 'SL' ? '🛑 Stop Loss' : '✋ Manual Close'}
                    ${isMultiTrade ? ' (Combined)' : ''}
                </div>
            </div>
        ` : '';
        
        const exitInfo = closeData ? `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                <div>
                    <div style="color: #787b86;">Exit Price</div>
                    <div style="color: #fff; font-weight: 600;">$${closeData.closePrice.toFixed(5)}</div>
                </div>
                <div>
                    <div style="color: #787b86;">Exit Time</div>
                    <div style="color: #fff; font-weight: 600;">${this.formatTimeOnly(closeData.closeTime)}</div>
                </div>
                <div>
                    <div style="color: #787b86;">Hour of Exit</div>
                    <div style="color: #fff; font-weight: 600;">${new Date(closeData.closeTime).getHours()}:00</div>
                </div>
                <div>
                    <div style="color: #787b86;">R:R Ratio</div>
                    <div style="color: #fff; font-weight: 600;">${rewardToRisk}:1</div>
                </div>
            </div>
        ` : '';
        
        modalContent.innerHTML = `
            <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 18px;">${title}</h3>
            
            ${resultInfo}
            
            <!-- Collected Data -->
            <div style="background: rgba(255,255,255,0.05); border-radius: 6px; padding: 12px; margin-bottom: 16px;">
                <div style="font-size: 11px; color: #787b86; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px;">Trade Data</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 11px;">
                    <div>
                        <div style="color: #787b86;">Trade ID</div>
                        <div style="color: #e5e7eb; font-weight: 600;">#${order.id}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Symbol/Pair</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${symbol}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Direction</div>
                        <div style="color: ${order.type === 'BUY' ? '#22c55e' : '#ef4444'}; font-weight: 600;">${order.type}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Position Size</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${order.quantity.toFixed(2)} Lots</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Entry Price</div>
                        <div style="color: #e5e7eb; font-weight: 600;">$${order.openPrice.toFixed(5)}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Risk Amount</div>
                        <div style="color: #e5e7eb; font-weight: 600;">$${(order.riskAmount || 0).toFixed(2)}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Stop Loss</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${order.stopLoss ? '$' + order.stopLoss.toFixed(5) : 'None'}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Take Profit</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${order.takeProfit ? '$' + order.takeProfit.toFixed(5) : 'None'}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Entry Time</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${entryTimeStr}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Hour of Entry</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${hourOfEntry}:00</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Day of Week</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${dayOfWeek}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Month</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${month}</div>
                    </div>
                    <div>
                        <div style="color: #787b86;">Year</div>
                        <div style="color: #e5e7eb; font-weight: 600;">${year}</div>
                    </div>
                    ${exitInfo}
                    ${closeData ? `
                        <div style="grid-column: 1 / -1; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); margin-top: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                                <div style="font-size: 10px; color: #787b86; text-transform: uppercase;">Excursion Metrics</div>
                                <div style="font-size: 9px; color: #787b86;">(${this.mfeMaeTrackingHours}h window)</div>
                            </div>
                        </div>
                        <div>
                            <div style="color: #787b86;">MFE (Best Price)</div>
                            <div style="color: #22c55e; font-weight: 600;">${(order.mfe || order.openPrice).toFixed(5)}</div>
                        </div>
                        <div>
                            <div style="color: #787b86;">MAE (Worst Price)</div>
                            <div style="color: #ef4444; font-weight: 600;">${(order.mae || order.openPrice).toFixed(5)}</div>
                        </div>
                    ` : ''}
                </div>
            </div>
            
            <!-- Journal Fields -->
            <div style="margin-bottom: 16px;">
                <label style="display: block; color: #787b86; font-size: 12px; margin-bottom: 6px;">
                    ${isClosing ? 'What did you learn?' : 'Why are you taking this trade?'}
                </label>
                <textarea id="tradeReason" style="width: 100%; min-height: 80px; background: rgba(255,255,255,0.05); border: 1px solid #2a2e39; border-radius: 6px; color: #fff; padding: 12px; font-size: 13px; font-family: inherit; resize: vertical;"
                    placeholder="${isClosing ? 'Lessons learned, what went right/wrong...' : 'Setup, strategy, confluence factors...'}"></textarea>
            </div>
            
            <div style="margin-bottom: 16px;">
                <label style="display: block; color: #787b86; font-size: 12px; margin-bottom: 6px;">
                    ${isClosing ? 'Post-trade analysis' : 'Trade setup / Strategy'}
                </label>
                <input type="text" id="tradeSetup" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #2a2e39; border-radius: 6px; color: #fff; padding: 12px; font-size: 13px;"
                    placeholder="${isClosing ? 'What could be improved?' : 'e.g., Breakout, Support/Resistance, Trend Following...'}">
            </div>
            
            <div style="margin-bottom: 20px;">
                <label style="display: block; color: #787b86; font-size: 12px; margin-bottom: 6px;">Tags (comma separated)</label>
                <input type="text" id="tradeTags" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid #2a2e39; border-radius: 6px; color: #fff; padding: 12px; font-size: 13px;"
                    placeholder="e.g., London Session, EURUSD, Reversal">
            </div>
            
            <!-- Buttons -->
            <div style="display: flex; gap: 12px;">
                <button id="saveTradeNote" style="flex: 1; padding: 12px; background: #7c3aed; color: #fff; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    ${isClosing ? 'Save & Complete' : 'Done'}
                </button>
                <button id="skipTradeNote" style="flex: 1; padding: 12px; background: transparent; color: #787b86; border: 1px solid #2a2e39; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    Skip
                </button>
            </div>
        `;
        
        modal.appendChild(modalContent);
        document.body.appendChild(modal);
        
        // Event listeners
        document.getElementById('saveTradeNote').onclick = async () => {
            const reason = document.getElementById('tradeReason').value;
            const setup = document.getElementById('tradeSetup').value;
            const tags = document.getElementById('tradeTags').value;
            
            if (isClosing) {
                // Save post-trade notes
                await this.saveTradeToJournal(order, closeData, { reason, setup, tags });
            } else {
                // Save pre-trade notes to order
                order.journalEntry = {
                    preTradeNotes: { reason, setup, tags },
                    timestamp: Date.now()
                };
            }
            
            modal.remove();
            
            // Force update history tab after modal is closed
            if (isClosing) {
                setTimeout(() => {
                    console.log('🔄 Force refreshing history tab after modal close...');
                    this.updateJournalTab();
                }, 150);
            }
            
            // Check prop firm rules after closing trade (only for closed trades)
            if (isClosing && window.propFirmTracker && window.propFirmTracker.sessionData) {
                console.log('✅ Checking prop firm rules after trade close...');
                const tracker = window.propFirmTracker;
                
                // Small delay to ensure modal is removed and UI updated
                setTimeout(() => {
                    console.log('🔍 Current violations:', tracker.violations);
                    console.log('🔍 Profit target reached:', tracker.isProfitTargetReached());
                    console.log('🔍 Failed modal shown:', tracker.failedModalShown);
                    console.log('🔍 Profit modal shown:', tracker.profitTargetReachedShown);
                    
                    // Priority: Check failures first
                    if (tracker.violations.dailyLoss && !tracker.failedModalShown) {
                        console.log('🚨 Daily loss violation detected, showing modal...');
                        tracker.showChallengeFailedModal('Daily Loss Limit');
                    } else if (tracker.violations.totalLoss && !tracker.failedModalShown) {
                        console.log('🚨 Total loss violation detected, showing modal...');
                        tracker.showChallengeFailedModal('Total Loss Limit');
                    } else if (tracker.isProfitTargetReached() && !tracker.profitTargetReachedShown) {
                        console.log('🎉 Profit target reached, showing modal...');
                        tracker.profitTargetReachedShown = true;
                        tracker.showChallengePassedModal();
                    } else {
                        console.log('ℹ️ No challenge modal needed');
                    }
                }, 300);
            }
        };
        
        document.getElementById('skipTradeNote').onclick = async () => {
            if (isClosing) {
                await this.saveTradeToJournal(order, closeData, null);
            }
            modal.remove();
            
            // Force update history tab after modal is closed
            if (isClosing) {
                setTimeout(() => {
                    console.log('🔄 Force refreshing history tab after modal close (skip)...');
                    this.updateJournalTab();
                }, 150);
            }
            
            // Check prop firm rules after closing trade (only for closed trades)
            if (isClosing && window.propFirmTracker && window.propFirmTracker.sessionData) {
                console.log('✅ Checking prop firm rules after trade close (skip)...');
                const tracker = window.propFirmTracker;
                
                // Small delay to ensure modal is removed and UI updated
                setTimeout(() => {
                    console.log('🔍 Current violations:', tracker.violations);
                    console.log('🔍 Profit target reached:', tracker.isProfitTargetReached());
                    console.log('🔍 Failed modal shown:', tracker.failedModalShown);
                    console.log('🔍 Profit modal shown:', tracker.profitTargetReachedShown);
                    
                    // Priority: Check failures first
                    if (tracker.violations.dailyLoss && !tracker.failedModalShown) {
                        console.log('🚨 Daily loss violation detected, showing modal...');
                        tracker.showChallengeFailedModal('Daily Loss Limit');
                    } else if (tracker.violations.totalLoss && !tracker.failedModalShown) {
                        console.log('🚨 Total loss violation detected, showing modal...');
                        tracker.showChallengeFailedModal('Total Loss Limit');
                    } else if (tracker.isProfitTargetReached() && !tracker.profitTargetReachedShown) {
                        console.log('🎉 Profit target reached, showing modal...');
                        tracker.profitTargetReachedShown = true;
                        tracker.showChallengePassedModal();
                    } else {
                        console.log('ℹ️ No challenge modal needed');
                    }
                }, 300);
            }
        };
        
        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                document.getElementById('skipTradeNote').click();
            }
        };
    }
    
    /**
     * Save completed trade to journal
     */
    async saveTradeToJournal(order, closeData, postTradeNotes) {
        console.log('💾 saveTradeToJournal called for order #' + order.id);
        console.log('   Entry screenshot exists:', !!order.entryScreenshot);
        
        // Check if we have a pre-built journal entry (for scaled trades)
        if (order.pendingJournalEntry) {
            console.log('📋 Using pre-built journal entry for order #' + order.id);
            const journalEntry = order.pendingJournalEntry;
            
            // Wait for any pending entry screenshot promises (for scaled trades)
            if (journalEntry.isScaledTrade && journalEntry.scaledEntries) {
                const pendingPromises = [];
                
                // Get scaled info to access original entries with promises
                const scaledInfo = this.scaledTrades.get(journalEntry.scaledGroupId);
                if (scaledInfo && scaledInfo.entries) {
                    for (const entry of scaledInfo.entries) {
                        if (entry.screenshotPromise) {
                            pendingPromises.push(entry.screenshotPromise);
                        }
                    }
                }
                
                if (pendingPromises.length > 0) {
                    console.log(`📸 Waiting for ${pendingPromises.length} pending entry screenshot(s)...`);
                    await Promise.all(pendingPromises);
                    console.log('📸 All entry screenshots ready');
                    
                    // Re-collect screenshots after promises resolved
                    const updatedScreenshots = scaledInfo.entries
                        .filter(e => e.entryScreenshot)
                        .map(e => ({
                            orderId: e.id,
                            screenshot: e.entryScreenshot,
                            openPrice: e.openPrice,
                            openTime: e.openTime
                        }));
                    
                    journalEntry.entryScreenshots = updatedScreenshots;
                    journalEntry.entryScreenshot = scaledInfo.entries[0]?.entryScreenshot || null;
                    
                    // Update scaledEntries with screenshots
                    journalEntry.scaledEntries = scaledInfo.entries.map(e => ({
                        id: e.id,
                        quantity: e.quantity,
                        openPrice: e.openPrice,
                        closePrice: e.closePrice,
                        pnl: e.pnl,
                        openTime: e.openTime,
                        closeTime: e.closeTime,
                        entryScreenshot: e.entryScreenshot || null
                    }));
                    
                    console.log(`📸 Updated journal entry with ${updatedScreenshots.length} entry screenshots`);
                }
            } else if (journalEntry.isSplitEntry && journalEntry.splitEntries) {
                // Handle SPLIT ENTRIES - collect screenshots from all entries
                const splitInfo = this.splitTrades.get(journalEntry.splitGroupId);
                if (splitInfo && splitInfo.entries) {
                    const pendingPromises = [];
                    for (const entry of splitInfo.entries) {
                        if (entry.screenshotPromise) {
                            pendingPromises.push(entry.screenshotPromise);
                        }
                    }
                    
                    if (pendingPromises.length > 0) {
                        console.log(`📸 Waiting for ${pendingPromises.length} pending split entry screenshot(s)...`);
                        await Promise.all(pendingPromises);
                        console.log('📸 All split entry screenshots ready');
                    }
                    
                    // Re-collect screenshots after promises resolved
                    const updatedScreenshots = splitInfo.entries
                        .filter(e => e.entryScreenshot)
                        .map(e => ({
                            orderId: e.id,
                            screenshot: e.entryScreenshot,
                            openPrice: e.openPrice,
                            openTime: e.openTime
                        }));
                    
                    journalEntry.entryScreenshots = updatedScreenshots;
                    journalEntry.entryScreenshot = splitInfo.entries[0]?.entryScreenshot || null;
                    
                    // Update splitEntries with screenshots
                    journalEntry.splitEntries = splitInfo.entries.map(e => ({
                        id: e.id,
                        quantity: e.originalQuantity || e.quantity,
                        openPrice: e.openPrice,
                        closePrice: e.closePrice,
                        pnl: e.pnl,
                        partialClosePnL: e.partialClosePnL || 0,
                        openTime: e.openTime,
                        closeTime: e.closeTime,
                        entryScreenshot: e.entryScreenshot || null,
                        partialCloses: e.partialCloses || []
                    }));
                    
                    console.log(`📸 Updated split journal entry with ${updatedScreenshots.length} entry screenshots`);
                }
            } else if (order.screenshotPromise && !order.entryScreenshot) {
                // Single trade - wait for screenshot promise
                console.log('📸 Waiting for entry screenshot promise...');
                await order.screenshotPromise;
                journalEntry.entryScreenshot = order.entryScreenshot;
                console.log('📸 Entry screenshot ready:', !!order.entryScreenshot);
            }
            
            // Capture exit screenshot NOW (it wasn't captured when journal entry was pre-built)
            if (window.screenshotManager && !journalEntry.exitScreenshot) {
                console.log('📸 Capturing exit screenshot for pre-built entry...');
                try {
                    journalEntry.exitScreenshot = await window.screenshotManager.captureChartSnapshot();
                    console.log('   Exit screenshot captured:', !!journalEntry.exitScreenshot);
                } catch (err) {
                    console.error('❌ Failed to capture exit screenshot:', err);
                }
            }
            
            // Add post-trade notes if provided
            if (postTradeNotes) {
                journalEntry.postTradeNotes = postTradeNotes;
                journalEntry.tags = postTradeNotes.tags || [];
                journalEntry.rulesFollowed = postTradeNotes.reason === 'rules-followed';
            }
            
            // Add to journal (with duplicate check)
            const tradeId = journalEntry.tradeId || journalEntry.id;
            const existingIndex = this.tradeJournal.findIndex(t => (t.tradeId || t.id) === tradeId);
            if (existingIndex !== -1) {
                console.warn(`⚠️ Trade #${tradeId} already exists in journal at index ${existingIndex} - updating existing entry`);
                // Update the existing entry with any new data (like post-trade notes)
                const existingEntry = this.tradeJournal[existingIndex];
                if (journalEntry.postTradeNotes) {
                    existingEntry.postTradeNotes = journalEntry.postTradeNotes;
                }
                if (journalEntry.exitScreenshot && !existingEntry.exitScreenshot) {
                    existingEntry.exitScreenshot = journalEntry.exitScreenshot;
                }
                if (journalEntry.tags && journalEntry.tags.length > 0) {
                    existingEntry.tags = journalEntry.tags;
                }
                if (journalEntry.rulesFollowed !== null && journalEntry.rulesFollowed !== undefined) {
                    existingEntry.rulesFollowed = journalEntry.rulesFollowed;
                }
                
                // Save updated journal
                this.persistJournal();
                console.log('💾 Updated existing trade');
                
                // IMPORTANT: Still update the UI even for duplicates
                this.updateJournalTab();
                
                delete order.pendingJournalEntry;
                return;
            }
            
            this.tradeJournal.push(journalEntry);
            console.log(`📔 Trade #${order.id} saved to journal from pre-built entry`);
            console.log(`📊 Trade Journal now has ${this.tradeJournal.length} trades in memory`);
            console.log(`   Entry screenshots: ${journalEntry.entryScreenshots?.length || (journalEntry.entryScreenshot ? 1 : 0)}`);
            console.log(`   Exit screenshot: ${!!journalEntry.exitScreenshot}`);
            
            // Save journal
            this.persistJournal();
            
            // Update the Journal tab in sidebar
            this.updateJournalTab();
            
            // Clean up
            delete order.pendingJournalEntry;
            return;
        }
        
        // Otherwise, create journal entry normally (for non-scaled or old flow)
        // Capture exit screenshot
        let exitScreenshot = null;
        
        // If screenshot manager not initialized, try to initialize it now
        if (!window.screenshotManager && typeof ScreenshotManager !== 'undefined' && window.chart) {
            console.log('🔧 Screenshot manager missing for exit, initializing now...');
            window.screenshotManager = new ScreenshotManager(window.chart);
        }
        
        if (window.screenshotManager) {
            console.log('📸 Capturing exit screenshot...');
            exitScreenshot = await window.screenshotManager.captureChartSnapshot();
            console.log('   Exit screenshot captured:', !!exitScreenshot);
        } else {
            console.warn('⚠️ Screenshot manager not available for exit screenshot');
        }
        
        // Calculate additional metrics
        const entryDate = new Date(order.openTime);
        const exitDate = new Date(closeData.closeTime);
        const holdingTime = closeData.closeTime - order.openTime; // milliseconds
        const holdingTimeHours = (holdingTime / (1000 * 60 * 60)).toFixed(2);
        const holdingTimeDays = (holdingTime / (1000 * 60 * 60 * 24)).toFixed(2);
        
        // Calculate reward-to-risk ratio
        let rewardToRisk = 0;
        if (order.riskAmount && order.riskAmount > 0) {
            rewardToRisk = Math.abs(closeData.pnl) / order.riskAmount;
        }
        
        // Calculate R-Multiple (actual P&L / ORIGINAL risk amount)
        // Use originalRiskAmount to ensure trailing SL doesn't affect R calculation
        let rMultiple = 0;
        const riskForCalculation = order.originalRiskAmount || order.riskAmount;
        if (riskForCalculation && riskForCalculation > 0) {
            rMultiple = closeData.pnl / riskForCalculation;
        }
        
        // Get symbol from chart or default to current pair
        const symbol = this.chart.symbol || 'UNKNOWN';
        
        let journalEntry = {
            // Basic Trade Info
            tradeId: order.id,
            symbol: symbol,
            direction: order.type, // BUY or SELL
            
            // Timing
            entryTime: order.openTime,
            exitTime: closeData.closeTime,
            entryDate: entryDate.toISOString(),
            exitDate: exitDate.toISOString(),
            dayOfWeek: entryDate.toLocaleDateString('en-US', { weekday: 'long' }),
            hourOfEntry: entryDate.getHours(),
            hourOfExit: exitDate.getHours(),
            month: entryDate.toLocaleDateString('en-US', { month: 'long' }),
            year: entryDate.getFullYear(),
            
            // Prices
            entryPrice: order.openPrice,
            exitPrice: closeData.closePrice,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
            
            // Financial Metrics
            netPnL: closeData.pnl,
            riskPerTrade: order.riskAmount || 0,
            rewardToRiskRatio: rewardToRisk.toFixed(2),
            rMultiple: rMultiple.toFixed(2),
            
            // MFE/MAE Metrics
            mfe: order.mfe || order.openPrice, // Max Favorable Excursion (price level)
            mae: order.mae || order.openPrice, // Max Adverse Excursion (price level)
            mfeTime: order.mfeTime || order.openTime, // Timestamp when MFE occurred
            maeTime: order.maeTime || order.openTime, // Timestamp when MAE occurred
            highestPrice: order.highestPrice || order.openPrice,
            lowestPrice: order.lowestPrice || order.openPrice,
            
            // Position Details
            quantity: order.quantity,
            closeType: closeData.type, // SL, TP, or MANUAL
            
            // Holding Time
            holdingTimeMs: holdingTime,
            holdingTimeHours: parseFloat(holdingTimeHours),
            holdingTimeDays: parseFloat(holdingTimeDays),
            
            // Notes
            preTradeNotes: order.journalEntry?.preTradeNotes || null,
            postTradeNotes: postTradeNotes,
            
            // Screenshots
            entryScreenshot: order.entryScreenshot || null, // Captured on order placement
            exitScreenshot: exitScreenshot || null, // Captured on trade close
            
            // Metadata
            savedAt: Date.now(),
            
            // Legacy fields for backward compatibility
            id: order.id,
            type: order.type,
            openPrice: order.openPrice,
            closePrice: closeData.closePrice,
            openTime: order.openTime,
            closeTime: closeData.closeTime,
            riskAmount: order.riskAmount,
            pnl: closeData.pnl
        };
        
        // CHECK FOR SCALED TRADES - Don't save individual entries
        if (order.tradeGroupId) {
            const scaledInfo = this.scaledTrades.get(order.tradeGroupId);
            
            if (scaledInfo && scaledInfo.status !== 'CLOSED') {
                // Group still has open positions - skip individual journal entry
                console.log(`📊 SKIPPED: Trade #${order.id} is part of scaled group #${order.tradeGroupId} - waiting for all entries to close`);
                return; // Don't add to journal yet
            }
            
            // If we reach here, all entries in group are closed - create AGGREGATE entry
            if (scaledInfo && scaledInfo.status === 'CLOSED') {
                console.log(`📊 All entries in scaled group #${order.tradeGroupId} closed - creating aggregate journal entry`);
                
                // Replace individual entry with aggregate
                journalEntry = this.createAggregateJournalEntry(scaledInfo, exitScreenshot);
            }
        }
        
        // Add to journal (with duplicate check)
        const tradeId = journalEntry.tradeId || journalEntry.id;
        const existingIndex = this.tradeJournal.findIndex(t => (t.tradeId || t.id) === tradeId);
        if (existingIndex !== -1) {
            console.warn(`⚠️ Trade #${tradeId} already exists in journal at index ${existingIndex} - skipping duplicate`);
            return;
        }
        
        this.tradeJournal.push(journalEntry);
        console.log(`📔 Trade #${order.id} saved to journal`);
        console.log('   📸 Entry screenshot:', !!journalEntry.entryScreenshot ? 'YES' : 'NO');
        console.log('   📸 Exit screenshot:', !!journalEntry.exitScreenshot ? 'YES' : 'NO');
        if (journalEntry.entryScreenshot) {
            console.log('   Entry screenshot size:', (journalEntry.entryScreenshot.length / 1024).toFixed(2) + ' KB');
        }
        if (journalEntry.exitScreenshot) {
            console.log('   Exit screenshot size:', (journalEntry.exitScreenshot.length / 1024).toFixed(2) + ' KB');
        }
        
        // Link tracking position to journal entry if it exists
        const trackingPosition = this.mfeMaeTrackingPositions.find(p => p.id === order.id);
        if (trackingPosition) {
            trackingPosition.journalIndex = this.tradeJournal.length - 1;
            console.log(`🔗 Linked tracking position #${order.id} to journal index ${trackingPosition.journalIndex}`);
        }
        
        // Save journal
        this.persistJournal();
        
        // Update the Journal tab in sidebar
        this.updateJournalTab();
    }
    
    /**
     * Export trade journal to CSV
     */
    exportJournalToCSV() {
        if (this.tradeJournal.length === 0) {
            alert('No trades to export');
            return;
        }
        
        // Define CSV headers
        const headers = [
            'Trade ID',
            'Symbol / Pair',
            'Direction',
            'Entry Time',
            'Exit Time',
            'Entry Price',
            'Exit Price',
            'Stop Loss',
            'Take Profit',
            'Net P&L',
            'Risk per Trade',
            'Reward-to-Risk Ratio',
            'R-Multiple',
            'MFE (Best Price Level)',
            'MAE (Worst Price Level)',
            'Highest Price',
            'Lowest Price',
            'Holding Time (Hours)',
            'Holding Time (Days)',
            'Day of Week',
            'Hour of Entry',
            'Hour of Exit',
            'Month',
            'Year',
            'Close Type',
            'Position Size (Lots)',
            'Pre-Trade Reason',
            'Pre-Trade Setup',
            'Pre-Trade Tags',
            'Post-Trade Lessons',
            'Post-Trade Improvements',
            'Post-Trade Tags'
        ];
        
        // Build CSV rows
        const rows = this.tradeJournal.map(trade => [
            trade.tradeId || trade.id,
            trade.symbol || '',
            trade.direction || trade.type,
            this.format24Hour(trade.entryTime || trade.openTime),
            this.format24Hour(trade.exitTime || trade.closeTime),
            (trade.entryPrice || trade.openPrice).toFixed(5),
            (trade.exitPrice || trade.closePrice).toFixed(5),
            trade.stopLoss ? trade.stopLoss.toFixed(5) : 'None',
            trade.takeProfit ? trade.takeProfit.toFixed(5) : 'None',
            (trade.netPnL || trade.pnl).toFixed(2),
            (trade.riskPerTrade || trade.riskAmount || 0).toFixed(2),
            trade.rewardToRiskRatio || 'N/A',
            trade.rMultiple || 'N/A',
            (trade.mfe || trade.openPrice || 0).toFixed(5),
            (trade.mae || trade.openPrice || 0).toFixed(5),
            (trade.highestPrice || trade.openPrice || 0).toFixed(5),
            (trade.lowestPrice || trade.openPrice || 0).toFixed(5),
            trade.holdingTimeHours || 'N/A',
            trade.holdingTimeDays || 'N/A',
            trade.dayOfWeek || '',
            trade.hourOfEntry !== undefined ? trade.hourOfEntry : '',
            trade.hourOfExit !== undefined ? trade.hourOfExit : '',
            trade.month || '',
            trade.year || '',
            trade.closeType || '',
            trade.quantity.toFixed(2),
            trade.preTradeNotes?.reason || '',
            trade.preTradeNotes?.setup || '',
            trade.preTradeNotes?.tags || '',
            trade.postTradeNotes?.reason || '',
            trade.postTradeNotes?.setup || '',
            trade.postTradeNotes?.tags || ''
        ]);
        
        // Combine headers and rows
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `trade_journal_${Date.now()}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        console.log(`📊 Exported ${this.tradeJournal.length} trades to CSV`);
    }
    
    /**
     * Create Buy/Sell order buttons (now opens panel)
     */
    createOrderButtons() {
        const toolbar = document.querySelector('.toolbar-right');
        if (!toolbar) return;
        
        const orderContainer = document.createElement('div');
        orderContainer.id = 'orderButtons';
        orderContainer.style.cssText = `
            display: flex;
            gap: 8px;
            margin-left: 8px;
            align-items: center;
        `;
        
        // Place Order Button (styled as "New order")
        const placeOrderBtn = document.createElement('button');
        placeOrderBtn.id = 'placeOrderBtn';
        placeOrderBtn.className = 'new-order-btn';
        placeOrderBtn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 8px;
            background: #2962FF;
            color: white;
            font-weight: 600;
            font-size: 13px;
            min-width: 120px;
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.15s ease;
        `;
        placeOrderBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 5v14M5 12h14"/></svg> New order';
        placeOrderBtn.onmouseenter = () => placeOrderBtn.style.background = '#1e4fd9';
        placeOrderBtn.onmouseleave = () => placeOrderBtn.style.background = '#2962FF';
        placeOrderBtn.onclick = () => this.toggleOrderPanel();
        
        orderContainer.appendChild(placeOrderBtn);
        toolbar.insertBefore(orderContainer, toolbar.firstChild);
        
        // Create the order panel
        this.createOrderPanel();
        
        console.log('✅ Order buttons created');
    }
    
    /**
     * Create TradingView-style order panel
     */
    createOrderPanel() {
        const panelWidth = 320;
        const panel = document.createElement('div');
        panel.id = 'orderPanel';
        panel.classList.add('order-panel');
        panel.style.setProperty('--order-panel-width', `${panelWidth}px`);
        this.orderPanelWidth = panelWidth;

        if (!document.getElementById('orderPanelStyles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'orderPanelStyles';
            styleEl.textContent = `
                .order-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) scale(0.95);
                    width: var(--order-panel-width, 320px);
                    max-height: calc(100vh - 80px);
                    background: #1a1d26;
                    border: 1px solid #2a2e39;
                    border-radius: 8px;
                    z-index: 9999;
                    overflow-y: auto;
                    overflow-x: hidden;
                    transition: opacity 0.2s ease, transform 0.2s ease;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                    opacity: 0;
                    pointer-events: none;
                }
                
                .order-panel.visible {
                    opacity: 1;
                    transform: translate(-50%, -50%) scale(1);
                    pointer-events: auto;
                }

                .order-panel::-webkit-scrollbar {
                    width: 4px;
                }

                .order-panel::-webkit-scrollbar-track {
                    background: transparent;
                }

                .order-panel::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.15);
                    border-radius: 2px;
                }

                .order-panel::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.25);
                }

                .order-panel-backdrop {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.4);
                    z-index: 9998;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.2s ease;
                }

                .order-panel-backdrop.visible {
                    opacity: 1;
                    pointer-events: none;
                }

                .order-panel__content {
                    padding: 12px;
                }

                .order-panel__header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 10px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid #2a2e39;
                    cursor: move;
                    user-select: none;
                }

                .order-panel__title {
                    margin: 0;
                    color: #fff;
                    font-size: 13px;
                    font-weight: 600;
                }

                .order-panel__close {
                    background: transparent;
                    border: none;
                    color: #787b86;
                    cursor: pointer;
                    font-size: 24px;
                    padding: 0;
                    width: 30px;
                    height: 30px;
                    border-radius: 6px;
                    transition: background 0.2s ease, color 0.2s ease;
                }

                .order-panel__close:hover {
                    background: rgba(120, 123, 134, 0.15);
                    color: #ffffff;
                }

                .order-panel__tab-group {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 6px;
                    margin-bottom: 8px;
                }

                .order-tab {
                    padding: 7px;
                    border: none;
                    border-radius: 4px;
                    font-weight: 600;
                    font-size: 12px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }

                .order-tab:hover {
                    filter: brightness(1.08);
                }

                .order-tab:focus-visible {
                    outline: 2px solid rgba(124, 58, 237, 0.6);
                    outline-offset: 2px;
                }

                .order-tab--buy {
                    background: rgba(34, 197, 94, 0.15);
                    color: #22c55e;
                }

                .order-tab--sell {
                    background: rgba(239, 68, 68, 0.15);
                    color: #ef4444;
                }

                .order-tab.active.order-tab--buy {
                    background: #22c55e;
                    color: #ffffff;
                }

                .order-tab.active.order-tab--sell {
                    background: #ef4444;
                    color: #ffffff;
                }

                .order-section {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                    margin-bottom: 8px;
                }

                .order-section--compact {
                    margin-bottom: 0;
                    gap: 4px;
                }

                .order-button-group {
                    display: flex;
                    gap: 4px;
                    background: #2a2e39;
                    border-radius: 4px;
                    padding: 3px;
                }

                .order-collapse {
                    border: 1px solid #2a2e39;
                    border-radius: 4px;
                    overflow: hidden;
                    background: rgba(255, 255, 255, 0.02);
                    margin-bottom: 6px;
                }

                .order-collapse__header {
                    padding: 7px 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                    color: #9ca3af;
                    font-size: 11px;
                    font-weight: 600;
                    background: transparent;
                    border-bottom: 1px solid #2a2e39;
                    transition: all 0.15s ease;
                }

                .order-collapse__header:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: #fff;
                }

                .order-collapse__header span {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .order-collapse__chevron {
                    transition: transform 0.2s ease;
                }

                .order-collapse--open .order-collapse__chevron {
                    transform: rotate(180deg);
                }

                .order-collapse__content {
                    padding: 8px;
                    display: none;
                    flex-direction: column;
                    gap: 6px;
                }

                .order-collapse--open .order-collapse__content {
                    display: flex;
                }

                .order-button-group--inline {
                    background: transparent;
                    padding: 0;
                }

                .order-type-btn,
                .position-mode-tab,
                .risk-btn,
                .breakeven-mode-tab {
                    flex: 1;
                    border: none;
                    border-radius: 3px;
                    padding: 5px 6px;
                    font-size: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    color: #787b86;
                    background: transparent;
                    transition: all 0.15s ease;
                }

                .order-type-btn:hover,
                .position-mode-tab:hover,
                .breakeven-mode-tab:hover {
                    background: rgba(255, 255, 255, 0.1);
                    color: #ffffff;
                }

                .order-type-btn.active,
                .position-mode-tab.active,
                .breakeven-mode-tab.active {
                    background: #2962ff;
                    color: #ffffff;
                }

                .risk-btn {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid #2a2e39;
                }

                .risk-btn:hover {
                    background: rgba(41, 98, 255, 0.1);
                    color: #2962ff;
                    border-color: #2962ff;
                }

                .risk-btn.active {
                    background: rgba(41, 98, 255, 0.2);
                    border-color: #2962ff;
                    color: #2962ff;
                }

                .order-toggle-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .toggle-switch {
                    position: relative;
                    display: inline-block;
                    width: 36px;
                    height: 20px;
                }

                .toggle-switch input {
                    opacity: 0;
                    width: 0;
                    height: 0;
                }

                .toggle-switch__track {
                    position: absolute;
                    cursor: pointer;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background-color: #4b5563;
                    border-radius: 999px;
                    transition: background-color 0.3s;
                }

                .toggle-switch__thumb {
                    position: absolute;
                    height: 14px;
                    width: 14px;
                    left: 3px;
                    bottom: 3px;
                    background-color: #ffffff;
                    border-radius: 50%;
                    transition: transform 0.2s;
                }

                .toggle-switch input:checked + .toggle-switch__track {
                    background-color: #2962ff;
                }

                .toggle-switch input:checked + .toggle-switch__track + .toggle-switch__thumb {
                    transform: translateX(16px);
                }

                .order-toggle-label {
                    color: #9ca3af;
                    font-size: 11px;
                    cursor: pointer;
                    user-select: none;
                }

                .order-toggle-label:hover,
                .order-radio-label:hover {
                    color: #fff;
                }

                .order-radio-group {
                    display: flex;
                    gap: 16px;
                }

                .order-radio-label {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 11px;
                    color: #9ca3af;
                    cursor: pointer;
                    transition: color 0.2s ease;
                }

                .order-radio-label input {
                    accent-color: #2962ff;
                }

                .order-grid-two {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                }

                .order-field {
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                }

                .order-label {
                    font-size: 10px;
                    color: #787b86;
                    font-weight: 500;
                }

                .order-input-wrapper {
                    display: flex;
                    align-items: center;
                    background: #2a2e39;
                    border: 1px solid #2a2e39;
                    border-radius: 3px;
                    padding: 0 6px;
                    transition: all 0.15s ease;
                }

                .order-input {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: #ffffff;
                    font-size: 12px;
                    padding: 6px 0;
                    outline: none;
                }

                .order-input:hover {
                    color: #f9fafb;
                }

                .order-input--compact {
                    padding: 5px 0;
                    font-size: 11px;
                }

                .order-input-prefix,
                .order-input-suffix {
                    font-size: 12px;
                    color: #787b86;
                }

                .order-hint {
                    font-size: 10px;
                    color: #6b7280;
                    line-height: 1.3;
                    margin-top: -2px;
                }

                .order-input-wrapper:focus-within {
                    border-color: #2962ff;
                    background: #2a2e39;
                }

                .order-calculation {
                    background: #2a2e39;
                    border-radius: 3px;
                    padding: 5px 8px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 4px;
                }

                .order-calculation-label {
                    color: #787b86;
                    font-size: 9px;
                    font-weight: 500;
                }

                .order-calculation-value {
                    color: #2962ff;
                    font-size: 10px;
                    font-weight: 600;
                }

                .order-summary {
                    background: #2a2e39;
                    border-radius: 3px;
                    padding: 8px;
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }

                .order-summary-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 10px;
                }

                .order-summary-label {
                    font-size: 10px;
                    font-weight: 500;
                    color: #787b86;
                }

                .order-summary-label--positive {
                    color: #22c55e;
                }

                .order-summary-label--negative {
                    color: #ef4444;
                }

                .order-summary-value {
                    font-size: 10px;
                    font-weight: 600;
                    color: #ffffff;
                }

                .order-summary-value--positive {
                    color: #22c55e;
                }

                .order-summary-value--negative {
                    color: #ef4444;
                }

                .order-summary-value--muted {
                    color: #ffffff;
                }

                .order-validation {
                    display: none;
                    margin-bottom: 6px;
                    padding: 6px 8px;
                    border-radius: 3px;
                    font-size: 10px;
                    line-height: 1.3;
                }

                .order-validation--error {
                    display: block;
                    background: rgba(239, 68, 68, 0.12);
                    border: 1px solid rgba(239, 68, 68, 0.35);
                    color: #fca5a5;
                }

                .order-validation__item {
                    display: flex;
                    gap: 8px;
                    align-items: flex-start;
                }

                .order-validation__icon {
                    line-height: 1;
                }

                .order-summary-row span:last-child {
                    font-weight: 600;
                }

                .order-summary-divider {
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    margin-top: 8px;
                    padding-top: 8px;
                }

                .order-submit-btn {
                    width: 100%;
                    padding: 8px;
                    background: #22c55e;
                    color: white;
                    border: none;
                    border-radius: 3px;
                    font-size: 11px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.15s ease;
                }

                .order-submit-btn:hover {
                    background: #16a34a;
                }

                .order-submit-btn:active {
                    background: #15803d;
                }

                .order-submit-btn:focus-visible {
                    outline: 2px solid rgba(34, 197, 94, 0.7);
                    outline-offset: 2px;
                }

                .is-hidden {
                    display: none !important;
                }
            `;
            document.head.appendChild(styleEl);
        }

        panel.innerHTML = `
            <div class="order-panel__content">
                <div id="orderPanelHeader" class="order-panel__header">
                    <h3 class="order-panel__title">Place order</h3>
                    <button id="closeOrderPanel" class="order-panel__close" type="button">&times;</button>
                </div>

                <!-- Market Type Selector -->
                <div class="order-section" style="padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06);">
                    <div id="marketTypeSelectorPanel" class="market-type-selector" style="position: relative;">
                        <button id="marketTypeBtnPanel" type="button" style="
                            width: 100%;
                            display: flex;
                            align-items: center;
                            gap: 8px;
                            padding: 10px 12px;
                            background: rgba(42, 46, 57, 0.6);
                            border: 1px solid #363a45;
                            border-radius: 6px;
                            color: #d1d4dc;
                            font-size: 13px;
                            font-weight: 600;
                            cursor: pointer;
                            transition: all 0.15s ease;
                        ">
                            <span id="marketTypeIcon" style="font-size: 18px;">💱</span>
                            <span id="marketTypeName">Forex</span>
                            <span style="margin-left: auto; font-size: 10px; opacity: 0.7;">▼</span>
                        </button>
                        <div id="marketTypeDropdownPanel" style="
                            position: absolute;
                            top: 100%;
                            left: 0;
                            right: 0;
                            margin-top: 4px;
                            background: #1a1d26;
                            border: 1px solid #363a45;
                            border-radius: 8px;
                            padding: 6px;
                            z-index: 10001;
                            display: none;
                            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
                        "></div>
                    </div>
                </div>

                <div class="order-panel__tab-group">
                    <button id="buyTab" type="button" class="order-tab order-tab--buy active">BUY</button>
                    <button id="sellTab" type="button" class="order-tab order-tab--sell">SELL</button>
                </div>

                <div class="order-section">
                    <div class="order-button-group">
                        <button class="order-type-btn active" type="button" data-type="market">Market</button>
                        <button class="order-type-btn" type="button" data-type="limit">Limit</button>
                        <button class="order-type-btn" type="button" data-type="stop">Stop</button>
                    </div>
                </div>

                <div class="order-section">
                    <div class="order-toggle-wrapper">
                        <label class="toggle-switch">
                            <input type="checkbox" id="advancedOrderToggle">
                            <span class="toggle-switch__track"></span>
                            <span class="toggle-switch__thumb"></span>
                        </label>
                        <label for="advancedOrderToggle" class="order-toggle-label">Advanced order</label>
                    </div>
                </div>

                <div id="advancedOptions" class="order-section is-hidden">
                    <div class="order-collapse order-collapse--open" data-collapse="risk-controls">
                        <button type="button" class="order-collapse__header">
                            <span>Risk controls</span>
                            <span class="order-collapse__chevron">⌄</span>
                        </button>
                        <div class="order-collapse__content">
                            <div class="order-radio-group">
                                <label class="order-radio-label">
                                    <input type="radio" name="balanceType" value="current" checked>
                                    <span>Current balance</span>
                                </label>
                                <label class="order-radio-label">
                                    <input type="radio" name="balanceType" value="initial">
                                    <span>Initial balance</span>
                                </label>
                            </div>

                            <div class="order-button-group order-button-group--inline">
                                <button class="risk-btn" type="button" data-risk="0.5">0.5%</button>
                                <button class="risk-btn" type="button" data-risk="1">1%</button>
                                <button class="risk-btn" type="button" data-risk="2">2%</button>
                                <button class="risk-btn" type="button" data-risk="3">3%</button>
                                <button class="risk-btn" type="button" data-risk="5">5%</button>
                            </div>

                            <div class="order-grid-two">
                                <div class="order-field">
                                    <label class="order-label" for="maxRiskPercent">Max risk percent</label>
                                    <div class="order-input-wrapper">
                                        <input type="number" id="maxRiskPercent" value="0" step="0.1" class="order-input order-input--compact">
                                        <span class="order-input-suffix">%</span>
                                    </div>
                                </div>
                                <div class="order-field">
                                    <label class="order-label" for="maxRiskAmount">Max risk amount</label>
                                    <div class="order-input-wrapper">
                                        <input type="number" id="maxRiskAmount" value="0" step="1" class="order-input order-input--compact">
                                        <span class="order-input-suffix">USD</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div class="order-section">
                    <label class="order-label" id="positionSizingLabel" for="riskAmountUSD">Position sizing</label>
                    <div class="order-button-group order-button-group--inline">
                        <button class="position-mode-tab active" type="button" data-mode="risk-usd">Risk $</button>
                        <button class="position-mode-tab" type="button" data-mode="risk-percent">Risk %</button>
                        <button class="position-mode-tab" type="button" data-mode="lot-size">Lot Size</button>
                    </div>

                    <div id="riskUSDInput" class="order-input-wrapper" style="display: flex; gap: 4px; align-items: center;">
                        <span class="order-input-prefix" style="position: static; margin-right: -4px;">$</span>
                        <input type="number" id="riskAmountUSD" value="100" min="1" step="1" class="order-input order-input--compact" style="flex: 1; padding-left: 24px;">
                        <button type="button" class="input-stepper" data-target="riskAmountUSD" data-step="-10" style="width: 28px; height: 28px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #ef4444; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">−</button>
                        <button type="button" class="input-stepper" data-target="riskAmountUSD" data-step="+10" style="width: 28px; height: 28px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; color: #22c55e; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">+</button>
                    </div>
                    <div id="riskPercentInput" class="order-input-wrapper is-hidden" style="display: flex; gap: 4px; align-items: center;">
                        <input type="number" id="riskAmountPercent" value="1" min="0.1" step="0.1" class="order-input order-input--compact" style="flex: 1; padding-right: 32px;">
                        <span class="order-input-suffix" style="position: absolute; right: 92px;">%</span>
                        <button type="button" class="input-stepper" data-target="riskAmountPercent" data-step="-0.5" style="width: 28px; height: 28px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #ef4444; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">−</button>
                        <button type="button" class="input-stepper" data-target="riskAmountPercent" data-step="+0.5" style="width: 28px; height: 28px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; color: #22c55e; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">+</button>
                    </div>
                    <div id="lotSizeInput" class="order-input-wrapper is-hidden" style="display: flex; gap: 4px; align-items: center;">
                        <input type="number" id="lotSizeAmount" value="1" min="0.01" step="0.01" class="order-input order-input--compact" style="flex: 1; padding-right: 44px;">
                        <span class="order-input-suffix" style="position: absolute; right: 92px;">Lots</span>
                        <button type="button" class="input-stepper" data-target="lotSizeAmount" data-step="-0.1" style="width: 28px; height: 28px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 6px; color: #ef4444; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">−</button>
                        <button type="button" class="input-stepper" data-target="lotSizeAmount" data-step="+0.1" style="width: 28px; height: 28px; background: rgba(34, 197, 94, 0.15); border: 1px solid rgba(34, 197, 94, 0.3); border-radius: 6px; color: #22c55e; font-size: 16px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;">+</button>
                    </div>
                    <input type="hidden" id="orderQuantity" value="1">
                    <div id="calculatedPosition" class="order-calculation">
                        <span class="order-calculation-label" id="calculatedLabel">Position Size:</span>
                        <span id="calculatedLots" class="order-calculation-value">0.00 Lots</span>
                    </div>
                </div>

                <div class="order-section">
                    <label class="order-label" for="orderEntryPrice">Entry price</label>
                    <div class="order-input-wrapper">
                        <input type="number" id="orderEntryPrice" value="0" step="0.00001" class="order-input order-input--compact">
                        <span class="order-input-suffix">USD</span>
                    </div>
                </div>

                <div class="order-section" id="tpSection">
                    <div class="order-toggle-wrapper">
                        <input type="checkbox" id="enableTP" class="order-checkbox" checked>
                        <label for="enableTP" class="order-toggle-label">Profit target</label>
                    </div>
                    <div id="tpInputs" class="order-grid-two">
                        <div class="order-field">
                            <label class="order-label" for="tpPrice">Price</label>
                            <div class="order-input-wrapper">
                                <input type="number" id="tpPrice" value="0" step="0.00001" class="order-input order-input--compact">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="order-section" id="slSection">
                    <div class="order-toggle-wrapper">
                        <input type="checkbox" id="enableSL" class="order-checkbox" checked>
                        <label for="enableSL" class="order-toggle-label">Stop loss</label>
                    </div>
                    <div id="slInputs" class="order-grid-two">
                        <div class="order-field">
                            <label class="order-label" for="slPrice">Price</label>
                            <div class="order-input-wrapper">
                                <input type="number" id="slPrice" value="0" step="0.00001" class="order-input order-input--compact">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="order-collapse" data-collapse="protection-system" id="protectionSystemSection">
                    <button type="button" class="order-collapse__header">
                        <span>🛡️ Protection System</span>
                        <span class="order-collapse__chevron">⌄</span>
                    </button>
                    <div class="order-collapse__content">
                        <!-- Info Box -->
                        <div style="background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px; padding: 10px; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                                <span style="font-size: 16px;">ℹ️</span>
                                <span style="font-size: 11px; font-weight: 600; color: #3b82f6;">Two-Stage Protection</span>
                            </div>
                            <div style="font-size: 10px; color: #9ca3af; line-height: 1.4;">
                                <div style="margin-bottom: 4px;">1️⃣ <strong>Breakeven</strong>: Moves SL to entry (risk-free)</div>
                                <div>2️⃣ <strong>Trailing</strong>: Locks in profit as price moves</div>
                            </div>
                        </div>

                        <!-- Custom Protection Settings -->
                        <label class="order-label" style="font-size: 11px; margin-bottom: 8px;">My Protection Settings</label>
                        <div style="display: flex; gap: 6px; margin-bottom: 16px;">
                            <button id="createNewProtectionSetting" type="button" style="padding: 6px 12px; font-size: 16px; background: rgba(124, 58, 237, 0.2); border: 1px solid rgba(124, 58, 237, 0.4); color: #a78bfa; border-radius: 4px; cursor: pointer; line-height: 1; font-weight: 700;">
                                +
                            </button>
                            <select id="savedProtectionSettings" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px 8px; font-size: 10px; color: #fff; cursor: pointer;">
                                <option value="">-- Select Saved Setting --</option>
                            </select>
                            <button id="loadProtectionSetting" type="button" style="padding: 6px 12px; font-size: 10px; background: rgba(59, 130, 246, 0.1); border: 1px solid rgba(59, 130, 246, 0.3); color: #3b82f6; border-radius: 4px; cursor: pointer; white-space: nowrap;">
                                📥
                            </button>
                            <button id="deleteProtectionSetting" type="button" style="padding: 6px 12px; font-size: 10px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); color: #ef4444; border-radius: 4px; cursor: pointer; white-space: nowrap;">
                                🗑️
                            </button>
                        </div>

                        <!-- Stage 1: Breakeven -->
                        <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 12px; margin-bottom: 12px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="background: #22c55e; color: #000; font-weight: 700; font-size: 9px; padding: 2px 6px; border-radius: 3px;">STAGE 1</span>
                                    <span style="font-size: 11px; font-weight: 600; color: #fff;">Breakeven</span>
                                </div>
                                <label class="toggle-switch" style="transform: scale(0.8);">
                                    <input type="checkbox" id="autoBreakevenToggle">
                                    <span class="toggle-switch__track"></span>
                                    <span class="toggle-switch__thumb"></span>
                                </label>
                            </div>

                            <div id="breakevenSettings" class="is-hidden">
                                <label class="order-label" style="font-size: 10px; margin-bottom: 6px; color: #9ca3af;">Trigger at</label>
                                <div class="order-button-group order-button-group--inline" style="margin-bottom: 8px;">
                                    <button class="breakeven-mode-tab active" type="button" data-mode="pips" style="font-size: 10px;">Pips</button>
                                    <button class="breakeven-mode-tab" type="button" data-mode="amount" style="font-size: 10px;">Amount $</button>
                                </div>

                                <div id="breakevenPipsInput" class="order-input-wrapper">
                                    <input type="number" id="breakevenPips" value="10" min="1" step="1" class="order-input order-input--compact">
                                    <span class="order-input-suffix">Pips</span>
                                </div>

                                <div id="breakevenAmountInput" class="order-input-wrapper is-hidden">
                                    <span class="order-input-prefix">$</span>
                                    <input type="number" id="breakevenAmount" value="50" min="1" step="1" class="order-input order-input--compact">
                                </div>

                                <label class="order-label" style="font-size: 10px; margin-top: 12px; margin-bottom: 6px; color: #9ca3af;">Move SL to Entry +</label>
                                <div class="order-input-wrapper">
                                    <input type="number" id="breakevenPipOffset" value="0" min="-50" max="50" step="0.1" class="order-input order-input--compact">
                                    <span class="order-input-suffix">Pips</span>
                                </div>
                                <div style="font-size: 9px; color: #6b7280; margin-top: 4px; line-height: 1.3;">
                                    Tip: Use +2 for buffer above entry, 0 for exact entry, -2 for below entry
                                </div>
                            </div>
                        </div>

                        <!-- Stage 2: Trailing SL -->
                        <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 12px;">
                            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px;">
                                <div style="display: flex; align-items: center; gap: 6px;">
                                    <span style="background: #3b82f6; color: #fff; font-weight: 700; font-size: 9px; padding: 2px 6px; border-radius: 3px;">STAGE 2</span>
                                    <span style="font-size: 11px; font-weight: 600; color: #fff;">Trailing Stop</span>
                                </div>
                                <label class="toggle-switch" style="transform: scale(0.8);">
                                    <input type="checkbox" id="trailingSLToggle">
                                    <span class="toggle-switch__track"></span>
                                    <span class="toggle-switch__thumb"></span>
                                </label>
                            </div>

                            <div id="trailingSLSettings" class="is-hidden">
                            <label class="order-label" style="font-size: 11px; margin-bottom: 8px;">Activate after</label>
                            <div class="order-button-group order-button-group--inline" style="margin-bottom: 12px;">
                                <button class="breakeven-mode-tab active" type="button" data-mode="trail-rr" id="trailActivateRRTab">R:R</button>
                                <button class="breakeven-mode-tab" type="button" data-mode="trail-pips" id="trailActivatePipsTab">Pips</button>
                            </div>

                            <div id="trailingActivateRRInput" class="order-input-wrapper" style="margin-bottom: 12px;">
                                <input type="number" id="trailingActivateRR" value="1" min="0.1" step="0.1" class="order-input order-input--compact">
                                <span class="order-input-suffix">R:R</span>
                            </div>

                            <div id="trailingActivatePipsInput" class="order-input-wrapper is-hidden" style="margin-bottom: 12px;">
                                <input type="number" id="trailingActivatePips" value="10" min="1" step="1" class="order-input order-input--compact">
                                <span class="order-input-suffix">Pips</span>
                            </div>
                            
                            <label class="order-label" style="font-size: 11px; margin-bottom: 8px;">Step size (pips)</label>
                            <div class="order-input-wrapper" style="margin-bottom: 12px;">
                                <input type="number" id="trailingStepSize" value="4" min="1" step="1" class="order-input order-input--compact">
                                <span class="order-input-suffix">Pips</span>
                            </div>
                            
                            <div id="trailingStatus" style="margin-top: 8px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; border-left: 3px solid #787b86; display: none;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 16px;">⏳</span>
                                    <div style="flex: 1;">
                                        <div style="font-size: 11px; font-weight: 600; color: #fff;">Waiting for Activation</div>
                                        <div id="trailingStatusDetails" style="font-size: 10px; color: #787b86; margin-top: 2px;">Reach +10 pips to activate</div>
                                    </div>
                                </div>
                            </div>
                            
                            <p class="order-hint" style="font-size: 10px; margin-top: 8px;">Waits for activation, then SL moves in 4-pip steps</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="order-collapse" data-collapse="multiple-tp" id="multipleTPSection">
                    <button type="button" class="order-collapse__header">
                        <span>Multiple Take Profits</span>
                        <span class="order-collapse__chevron">⌄</span>
                    </button>
                    <div class="order-collapse__content">
                        <div class="order-toggle-wrapper">
                            <label class="toggle-switch">
                                <input type="checkbox" id="multipleTPToggle">
                                <span class="toggle-switch__track"></span>
                                <span class="toggle-switch__thumb"></span>
                            </label>
                            <label for="multipleTPToggle" class="order-toggle-label">Enable multiple TPs</label>
                        </div>

                        <div id="multipleTPSettings" class="order-section order-section--compact is-hidden">
                            <label class="order-label" style="font-size: 11px; margin-bottom: 6px;">Number of TP targets</label>
                            <div class="order-input-wrapper" style="margin-bottom: 12px;">
                                <input type="number" id="numTPTargets" value="2" min="2" max="10" step="1" class="order-input order-input--compact" style="text-align: center;">
                                <button type="button" id="recalculateTPTargets" style="padding: 5px 12px; margin-left: 8px; background: rgba(124, 58, 237, 0.2); border: 1px solid rgba(124, 58, 237, 0.4); border-radius: 4px; color: #a78bfa; font-size: 11px; cursor: pointer; font-weight: 500;">
                                    Auto-Calculate
                                </button>
                            </div>
                            <div id="multipleTPList"></div>
                            <p id="tpDistributionHint" class="order-hint" style="font-size: 10px; margin-top: 8px;">TPs will be evenly distributed. Each will close an equal $ amount.</p>
                        </div>
                    </div>
                </div>

                <!-- Position Scaling Control -->
                <div class="order-section" id="scalePositionSection" style="margin-top: 8px; margin-bottom: 8px;">
                    <div class="order-toggle-wrapper">
                        <input type="checkbox" id="scalePositionCheckbox" class="order-checkbox">
                        <label for="scalePositionCheckbox" class="order-toggle-label" style="display: flex; align-items: center; gap: 6px;">
                            <span>📊 Scale with existing position</span>
                        </label>
                    </div>
                    <div style="font-size: 9px; color: #6b7280; margin-top: 4px; line-height: 1.3; padding-left: 20px;">
                        Add to open position of same direction (groups entries together with weighted avg)
                    </div>
                </div>

                <div id="orderValidation" class="order-validation"></div>

                <div class="order-summary">
                    <div class="order-summary-row">
                        <span class="order-summary-label order-summary-label--positive">Reward</span>
                        <span id="rewardAmount" class="order-summary-value order-summary-value--positive">$0</span>
                    </div>
                    <div class="order-summary-row">
                        <span class="order-summary-label order-summary-label--negative">Risk</span>
                        <span id="riskAmount" class="order-summary-value order-summary-value--negative">$0</span>
                    </div>
                    <div class="order-summary-divider">
                        <div class="order-summary-row">
                            <span class="order-summary-label">Total</span>
                            <span id="totalAmount" class="order-summary-value order-summary-value--muted">-$0</span>
                        </div>
                    </div>
                </div>

                <button id="placeOrderButton" type="button" class="order-submit-btn">
                    Buy 0.00 Lots
                </button>
            </div>
        `;
        
        document.body.appendChild(panel);
        
        // Create backdrop for centered panel
        if (!document.getElementById('orderPanelBackdrop')) {
            const backdrop = document.createElement('div');
            backdrop.id = 'orderPanelBackdrop';
            backdrop.className = 'order-panel-backdrop';
            backdrop.onclick = () => this.toggleOrderPanel();
            document.body.appendChild(backdrop);
        }
        
        // Make panel draggable
        this.makePanelDraggable(panel);
        
        // Attach event listeners
        this.attachOrderPanelEvents();
        
        // Update panel based on current market type
        setTimeout(() => {
            this.updateOrderPanel();
        }, 50);
    }
    
    getPricePrecision() {
        return this.symbolPrecision || 5;
    }

    formatPrice(value, precision) {
        // Ensure precision is a valid number
        if (precision === undefined || precision === null) {
            precision = this.getPricePrecision();
        }
        // Ensure precision is a number
        precision = Number(precision);
        if (!Number.isFinite(precision) || precision < 0) {
            precision = 5; // fallback to default
        }
        
        const numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric)) {
            return (0).toFixed(precision);
        }
        return numeric.toFixed(precision);
    }

    formatQuantity(value) {
        // Handle null/undefined
        if (value === null || value === undefined || value === '') {
            return '0.00';
        }
        
        const numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric) || isNaN(numeric)) {
            console.warn(`⚠️ Invalid quantity value:`, value);
            return '0.00';
        }
        
        const absValue = Math.abs(numeric);
        if (absValue >= 100) return numeric.toFixed(0);
        if (absValue >= 10) return numeric.toFixed(1);
        return Math.round(numeric * 100) % 100 === 0 ? numeric.toFixed(0) : numeric.toFixed(2);
    }

    composePreviewLabelSegments(label, price, color, direction) {
        // Ensure price is valid
        if (price === undefined || price === null || !Number.isFinite(price)) {
            console.warn(`⚠️ Invalid price for label ${label}:`, price);
            price = 0;
        }
        
        const priceText = this.formatPrice(price);
        
        if (label === 'Entry') {
            const quantity = document.getElementById('orderQuantity')?.value || '0';
            const orderTypeRaw = this.orderType || 'market';
            const sideUpper = (this.orderSide || 'BUY').toUpperCase();
            const arrow = direction === 'BUY' ? '↑' : direction === 'SELL' ? '↓' : '↕';
            
            console.log(`📝 Creating Entry label: quantity from input = "${quantity}"`);
            
            // Combine everything in one label: "LIMIT BUY 100"
            const fullLabel = `${orderTypeRaw.toUpperCase()} ${sideUpper} ${this.formatQuantity(quantity)}`;
            console.log(`📝 Entry label text will be: "${fullLabel}"`);
            
            return [
                {
                    text: fullLabel,
                    fill: 'rgba(255,255,255,0.08)',
                    stroke: color,
                    textColor: color,
                    fontWeight: '700',
                    minWidth: 110
                },
                {
                    text: arrow,
                    fill: color,
                    stroke: color,
                    textColor: '#0b0f1a',
                    fontWeight: '700',
                    minWidth: 28
                }
            ];
        }

        if (label === 'TP') {
            return [
                {
                    text: 'TP',
                    fill: 'rgba(34,197,94,0.15)',
                    stroke: '#22c55e',
                    textColor: '#22c55e',
                    fontWeight: '700',
                    minWidth: 34
                },
                {
                    text: priceText,
                    fill: '#0f172a',
                    stroke: '#22c55e',
                    textColor: '#ffffff',
                    fontWeight: '700',
                    minWidth: 74,
                    role: 'price'
                }
            ];
        }

        if (label === 'SL') {
            return [
                {
                    text: 'SL',
                    fill: 'rgba(239,68,68,0.15)',
                    stroke: '#ef4444',
                    textColor: '#ef4444',
                    fontWeight: '700',
                    minWidth: 34
                },
                {
                    text: priceText,
                    fill: '#0f172a',
                    stroke: '#ef4444',
                    textColor: '#ffffff',
                    fontWeight: '700',
                    minWidth: 74,
                    role: 'price'
                }
            ];
        }

        // Handle BE labels (e.g., "BE @ 1R" or "BE @ $50")
        if (label && label.startsWith('BE @')) {
            return [
                {
                    text: label,
                    fill: 'rgba(245,158,11,0.2)',
                    stroke: '#f59e0b',
                    textColor: '#f59e0b',
                    fontWeight: '700',
                    strokeWidth: 1.5,
                    minWidth: 80
                },
                {
                    text: priceText,
                    fill: '#0f172a',
                    stroke: '#f59e0b',
                    textColor: '#ffffff',
                    fontWeight: '700',
                    minWidth: 74,
                    role: 'price'
                }
            ];
        }

        return [
            {
                text: label,
                fill: 'rgba(255,255,255,0.08)',
                stroke: color,
                textColor: '#ffffff',
                fontWeight: '700',
                minWidth: 40
            },
            {
                text: priceText,
                fill: '#0f172a',
                stroke: color,
                textColor: '#ffffff',
                fontWeight: '700',
                minWidth: 74,
                role: 'price'
            }
        ];
    }

    renderPreviewLabel(lineData, overrideY = null) {
        if (!lineData || !lineData.labelGroup) return;

        lineData.labelGroup.selectAll('*').remove();

        const segments = this.composePreviewLabelSegments(lineData.label, lineData.price, lineData.color, lineData.direction);
        let offsetX = 0;
        const gap = 4;
        const height = 24;
        let priceText = null;

        // For badges, only render the first segment (label only, no price)
        const segmentsToRender = lineData.isBadge ? [segments[0]] : segments;

        segmentsToRender.forEach(segment => {
            const segmentGroup = lineData.labelGroup.append('g')
                .attr('class', 'preview-label-segment');

            const textEl = segmentGroup.append('text')
                .attr('class', 'preview-label-text')
                .attr('fill', segment.textColor)
                .attr('font-size', '11px')
                .attr('font-weight', segment.fontWeight || '600')
                .attr('text-anchor', 'middle')
                .attr('y', height / 2)
                .attr('dy', '0.35em')
                .text(segment.text);

            const textBBox = textEl.node().getBBox();
            const width = Math.max(textBBox.width + 16, segment.minWidth || 28);

            const rect = segmentGroup.insert('rect', ':first-child')
                .attr('class', 'preview-label-bg')
                .attr('width', width)
                .attr('height', height)
                .attr('rx', 6)
                .attr('stroke', segment.stroke || lineData.color)
                .attr('stroke-width', segment.strokeWidth || 1.2);

            // For badges: transparent fill + dashed stroke
            if (lineData.isBadge) {
                rect.attr('fill', 'transparent')
                    .attr('stroke-dasharray', '4,3');
            } else {
                rect.attr('fill', segment.fill);
            }

            textEl.attr('x', width / 2);
            segmentGroup.attr('transform', `translate(${offsetX}, 0)`);

            if (segment.role === 'price') {
                priceText = textEl;
            }

            offsetX += width + gap;
        });

        // Add +/- arrows for multiple TP lines (after segments)
        if (lineData.targetIndex !== undefined && this.tpTargets && this.tpTargets.length > 1) {
            const arrowSize = 18;
            const arrowGap = 2;
            
            // Decrease arrow (-)
            const decreaseGroup = lineData.labelGroup.append('g')
                .attr('class', 'tp-percentage-control')
                .attr('transform', `translate(${offsetX}, ${(height - arrowSize) / 2})`)
                .style('cursor', 'pointer')
                .on('click', (event) => {
                    event.stopPropagation();
                    this.adjustTPPercentage(lineData.targetIndex, -5);
                });
            
            decreaseGroup.append('rect')
                .attr('width', arrowSize)
                .attr('height', arrowSize)
                .attr('rx', 4)
                .attr('fill', 'rgba(239, 68, 68, 0.2)')
                .attr('stroke', '#ef4444')
                .attr('stroke-width', 1);
            
            decreaseGroup.append('text')
                .attr('x', arrowSize / 2)
                .attr('y', arrowSize / 2)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('fill', '#ef4444')
                .attr('font-size', '14px')
                .attr('font-weight', '700')
                .text('−');
            
            offsetX += arrowSize + arrowGap;
            
            // Increase arrow (+)
            const increaseGroup = lineData.labelGroup.append('g')
                .attr('class', 'tp-percentage-control')
                .attr('transform', `translate(${offsetX}, ${(height - arrowSize) / 2})`)
                .style('cursor', 'pointer')
                .on('click', (event) => {
                    event.stopPropagation();
                    this.adjustTPPercentage(lineData.targetIndex, +5);
                });
            
            increaseGroup.append('rect')
                .attr('width', arrowSize)
                .attr('height', arrowSize)
                .attr('rx', 4)
                .attr('fill', 'rgba(34, 197, 94, 0.2)')
                .attr('stroke', '#22c55e')
                .attr('stroke-width', 1);
            
            increaseGroup.append('text')
                .attr('x', arrowSize / 2)
                .attr('y', arrowSize / 2)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('fill', '#22c55e')
                .attr('font-size', '14px')
                .attr('font-weight', '700')
                .text('+');
            
            offsetX += arrowSize + arrowGap;
            
            // Add close (X) button for multiple TP lines
            const closeSize = 18;
            const closeGroup = lineData.labelGroup.append('g')
                .attr('class', 'tp-close-btn')
                .attr('transform', `translate(${offsetX}, ${(height - closeSize) / 2})`)
                .style('cursor', 'pointer');
            
            closeGroup.append('circle')
                .attr('cx', closeSize / 2)
                .attr('cy', closeSize / 2)
                .attr('r', closeSize / 2)
                .attr('fill', 'rgba(239, 68, 68, 0.3)')
                .attr('stroke', '#ef4444')
                .attr('stroke-width', 1.5);
            
            closeGroup.append('text')
                .attr('x', closeSize / 2)
                .attr('y', closeSize / 2)
                .attr('dy', '0.35em')
                .attr('text-anchor', 'middle')
                .attr('fill', '#ef4444')
                .attr('font-size', '11px')
                .attr('font-weight', '700')
                .text('✕');
            
            // Close button events
            closeGroup
                .on('mouseenter', function() {
                    d3.select(this).select('circle')
                        .attr('fill', 'rgba(239, 68, 68, 0.5)');
                })
                .on('mouseleave', function() {
                    d3.select(this).select('circle')
                        .attr('fill', 'rgba(239, 68, 68, 0.3)');
                })
                .on('click', (event) => {
                    event.stopPropagation();
                    if (lineData.targetId) {
                        this.removeTPTarget(lineData.targetId);
                    }
                });
            
            offsetX += closeSize + gap;
        }
        
        // Add split handle for Entry and TP lines (NOT for SL or BE)
        const isEntryLine = lineData.label === 'Entry';
        const isTpLine = lineData.label && (lineData.label.startsWith('TP') || lineData.label === 'TP');
        const isSlLine = lineData.label === 'SL';
        const isBeLine = lineData.isBELine || (lineData.label && lineData.label.startsWith('BE'));
        const isBadge = lineData.isBadge;
        
        // Only add split handle for non-badge Entry and TP lines (not SL or BE) when advanced order is enabled
        if (!isBadge && (isEntryLine || isTpLine) && !isSlLine && !isBeLine && this.advancedOrderEnabled) {
            this.drawSplitHandle(lineData, lineData.labelGroup);
        }

        lineData.priceText = priceText;
        this.positionPreviewLabel(lineData, overrideY);
    }

    positionPreviewLabel(lineData, overrideY = null) {
        if (!lineData || !lineData.labelGroup) return;

        const bbox = lineData.labelGroup.node().getBBox();
        lineData.labelDimensions = { width: bbox.width, height: bbox.height };

        // Calculate X position with horizontal offsets for badges
        let x;
        if (lineData.isBadge) {
            // Badges positioned horizontally to the left of entry badge
            const gap = 8; // Gap between badges
            const rightMargin = 70; // Space from price axis (avoid overlap with price label)
            
            // Get widths of all badges for proper spacing
            const slWidth = this.previewLines?.sl?.labelDimensions?.width || 40;
            const tpWidth = this.previewLines?.tp?.labelDimensions?.width || 40;
            
            if (lineData.label === 'SL') {
                // SL badge: furthest left
                x = this.chart.w - rightMargin - slWidth - gap - tpWidth - gap;
            } else if (lineData.label === 'TP') {
                // TP badge: next to SL
                x = this.chart.w - rightMargin - tpWidth - gap;
            }
        } else {
            // Entry line label - positioned left with more space from price axis
            x = this.chart.w - bbox.width - 170; // Space from price axis to avoid overlap with price label
        }
        
        let yPixel;
        if (overrideY !== null && overrideY !== undefined) {
            yPixel = overrideY;
        } else if (this.chart?.scales?.yScale) {
            yPixel = this.chart.scales.yScale(lineData.price);
        } else {
            yPixel = 0;
        }

        const translateY = yPixel - bbox.height / 2;
        lineData.labelGroup.attr('transform', `translate(${x}, ${translateY})`);
    }

    /**
     * Make order panel draggable by its header
     */
    makePanelDraggable(panel) {
        const header = document.getElementById('orderPanelHeader');
        if (!header) return;
        
        let isDragging = false;
        let offsetX = 0;
        let offsetY = 0;
        
        header.addEventListener('mousedown', (e) => {
            // Don't drag if clicking the close button or any button
            if (e.target.id === 'closeOrderPanel' || e.target.tagName === 'BUTTON') {
                return;
            }
            
            if (e.target === header || e.target.tagName === 'H3') {
                isDragging = true;
                
                // Calculate offset from mouse to panel's top-left corner
                const rect = panel.getBoundingClientRect();
                offsetX = e.clientX - rect.left;
                offsetY = e.clientY - rect.top;
                
                // Remove center transform and switch to absolute positioning
                panel.style.transform = 'none';
                panel.style.right = 'auto';
                panel.style.top = rect.top + 'px';
                panel.style.left = rect.left + 'px';
                panel.style.transition = 'none'; // Disable transition during drag
                e.preventDefault();
            }
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                
                // Calculate new position based on mouse position and offset
                const newLeft = e.clientX - offsetX;
                const newTop = e.clientY - offsetY;
                
                // Apply boundaries to keep panel on screen
                const minTop = 40; // Below toolbar
                const maxTop = window.innerHeight - 100; // Keep some visible
                const minLeft = -350; // Allow some off-screen
                const maxLeft = window.innerWidth - 50; // Keep some visible
                
                const boundedTop = Math.max(minTop, Math.min(maxTop, newTop));
                const boundedLeft = Math.max(minLeft, Math.min(maxLeft, newLeft));
                
                panel.style.top = boundedTop + 'px';
                panel.style.left = boundedLeft + 'px';
            }
        });
        
        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                // Keep left positioning after drag
            }
        });
    }

    scheduleAlignPreviewLabels() {
        if (typeof requestAnimationFrame === 'function') {
            if (this.pendingPreviewAlignFrame) {
                cancelAnimationFrame(this.pendingPreviewAlignFrame);
                this.pendingPreviewAlignFrame = null;
            }
            if (this.pendingPreviewAlignFollowupFrame) {
                cancelAnimationFrame(this.pendingPreviewAlignFollowupFrame);
                this.pendingPreviewAlignFollowupFrame = null;
            }

            this.pendingPreviewAlignFrame = requestAnimationFrame(() => {
                this.pendingPreviewAlignFrame = null;
                this.pendingPreviewAlignFollowupFrame = requestAnimationFrame(() => {
                    this.pendingPreviewAlignFollowupFrame = null;
                    this.alignPreviewLabels();
                });
            });
            return;
        }

        if (this.pendingPreviewAlignTimeout) {
            clearTimeout(this.pendingPreviewAlignTimeout);
        }
        this.pendingPreviewAlignTimeout = setTimeout(() => {
            this.pendingPreviewAlignTimeout = null;
            this.alignPreviewLabels();
        }, 0);
    }
    
    /**
     * Toggle order panel visibility
     */
    toggleOrderPanel() {
        const panel = document.getElementById('orderPanel');
        const backdrop = document.getElementById('orderPanelBackdrop');

        if (!panel) return;

        const isVisible = panel.classList.contains('visible');

        if (isVisible) {
            // Close panel
            panel.classList.remove('visible');
            if (backdrop) backdrop.classList.remove('visible');

            // Remove preview lines when panel closes
            this.removePreviewLines();
            this.clearPendingOrderEditingState();

            // Reset TP/SL positioning flags
            this.tpManuallyPositioned = false;
            this.slManuallyPositioned = false;

            if (this.chart && typeof this.chart.updateSVGPointerEvents === 'function') {
                this.chart.updateSVGPointerEvents();
            }
            return;
        }

        // Open panel
        panel.classList.add('visible');
        if (backdrop) backdrop.classList.add('visible');

        // Reset TP/SL positioning flags for new order
        this.tpManuallyPositioned = false;
        this.slManuallyPositioned = false;

        // Reset multiple TP UI to avoid stale state
        const multipleTPToggle = document.getElementById('multipleTPToggle');
        const multipleTPSettings = document.getElementById('multipleTPSettings');
        if (multipleTPToggle) multipleTPToggle.checked = false;
        if (multipleTPSettings) multipleTPSettings.classList.add('is-hidden');

        this.updateOrderPanelPrice();

        // Perform initial calculations and setup after panel is visible
        setTimeout(() => {
            this.syncDefaultTargetsToEntry();
            this.calculatePositionFromRisk();
            this.calculateAdvancedRiskReward();
            this.updatePlaceButtonText();

            requestAnimationFrame(() => {
                this.updatePreviewLines();
                if (this.chart && typeof this.chart.updateSVGPointerEvents === 'function') {
                    this.chart.updateSVGPointerEvents();
                }
            });
        }, 100);
    }

    /**
     * Ensure order panel is open (used for editing)
     */
    openOrderPanel() {
        const panel = document.getElementById('orderPanel');
        if (!panel) return;
        const isVisible = panel.classList.contains('visible');
        if (!isVisible) {
            this.toggleOrderPanel();
        }
    }
    
    /**
     * Update order panel UI based on current market type
     */
    updateOrderPanel() {
        const config = this.getMarketConfig();
        
        // Update panel header with market type indicator
        const headerTitle = document.querySelector('#orderPanelHeader .order-panel__title');
        if (headerTitle) {
            headerTitle.innerHTML = `Place order <span style="font-size: 10px; opacity: 0.7; margin-left: 6px; padding: 2px 6px; background: rgba(124, 58, 237, 0.2); border-radius: 4px;">${config.icon} ${config.name}</span>`;
        }
        
        // Update position sizing label
        const positionLabel = document.getElementById('positionSizingLabel');
        if (positionLabel) {
            positionLabel.innerHTML = `Position sizing <span style="font-size: 9px; color: #6b7280;">(${config.positionLabel})</span>`;
        }
        
        // Update calculated lots label
        const calculatedLabel = document.getElementById('calculatedLabel');
        if (calculatedLabel) {
            calculatedLabel.textContent = `Position Size:`;
        }
        
        const calculatedLots = document.getElementById('calculatedLots');
        if (calculatedLots) {
            const qty = document.getElementById('orderQuantity')?.value || '0';
            calculatedLots.textContent = `${parseFloat(qty).toFixed(2)} ${config.positionLabel}`;
        }
        
        // Update lot size input label
        const lotSizeLabel = document.querySelector('label[for="lotSizeAmount"]');
        if (lotSizeLabel) {
            lotSizeLabel.textContent = config.positionLabel;
        }
        
        // Update lot size suffix
        const lotSizeSuffix = document.querySelector('#lotSizeInput .order-input-suffix');
        if (lotSizeSuffix) {
            lotSizeSuffix.textContent = config.positionLabel;
        }
        
        // Update step size for lot size input based on market type
        const lotSizeInput = document.getElementById('lotSizeAmount');
        if (lotSizeInput) {
            lotSizeInput.step = config.sizeStep;
            lotSizeInput.min = config.minSize;
        }
        
        // Update instrument settings hint based on market type
        const instrumentHint = document.querySelector('#instrumentSettingsModal .order-hint');
        if (instrumentHint) {
            instrumentHint.textContent = `${config.name}: ${config.examples}`;
        }
        
        // Update pips/ticks labels based on market type
        const showPips = config.showPips;
        const showTicks = config.showTicks;
        
        // Update breakeven pips label
        const breakevenPipsLabel = document.querySelector('label[for="breakevenPips"]');
        if (breakevenPipsLabel) {
            breakevenPipsLabel.textContent = showTicks ? 'Ticks' : 'Pips';
        }
        
        const breakevenPipsSuffix = document.querySelector('#breakevenPipsInput .order-input-suffix');
        if (breakevenPipsSuffix) {
            breakevenPipsSuffix.textContent = showTicks ? 'Ticks' : 'Pips';
        }
        
        // Update trailing pips labels
        document.querySelectorAll('.order-input-suffix').forEach(suffix => {
            if (suffix.textContent === 'Pips' && showTicks) {
                suffix.textContent = 'Ticks';
            } else if (suffix.textContent === 'Ticks' && showPips) {
                suffix.textContent = 'Pips';
            }
        });
        
        // Update the place button text
        this.updatePlaceButtonText();
        
        // Recalculate position size with new settings
        this.calculatePositionFromRisk();
        this.calculateAdvancedRiskReward();
        
        console.log(`📊 Order panel updated for ${config.name}`);
    }

    /**
     * Reset editing state and restore default panel title/button
     */
    clearPendingOrderEditingState() {
        this.editingPendingOrderId = null;
        const headerTitle = document.querySelector('#orderPanelHeader h3');
        if (headerTitle) {
            headerTitle.textContent = 'Place order';
        }
        this.updatePlaceButtonText();
    }

    /**
     * Start editing an existing pending order from sidebar
     */
    editPendingOrder(orderId) {
        const pendingOrder = this.pendingOrders.find(o => o.id === orderId);
        if (!pendingOrder) {
            console.warn(`⚠️ Attempted to edit non-existent pending order #${orderId}`);
            return;
        }

        this.editingPendingOrderId = orderId;
        this.orderSide = pendingOrder.direction || 'BUY';
        this.orderType = pendingOrder.orderType || 'limit';

        this.openOrderPanel();
        this.populateOrderPanelForPendingOrder(pendingOrder);
        
        // Ensure preview lines are updated with correct calculated values
        requestAnimationFrame(() => {
            this.updatePreviewLines();
        });
    }

    /**
     * Prefill order panel fields with pending order values for editing
     */
    populateOrderPanelForPendingOrder(order) {
        this.isPopulatingOrderPanel = true;

        const headerTitle = document.querySelector('#orderPanelHeader h3');
        if (headerTitle) {
            const typeLabel = order.orderType ? order.orderType.toUpperCase() : 'PENDING';
            headerTitle.textContent = `Edit ${typeLabel} ${order.direction}`;
        }

        const buyTab = document.getElementById('buyTab');
        const sellTab = document.getElementById('sellTab');
        const placeBtn = document.getElementById('placeOrderButton');

        if (buyTab && sellTab && placeBtn) {
            if ((order.direction || 'BUY') === 'BUY') {
                buyTab.style.background = '#22c55e';
                buyTab.style.color = 'white';
                sellTab.style.background = 'rgba(239, 68, 68, 0.2)';
                sellTab.style.color = '#ef4444';
                placeBtn.style.background = '#22c55e';
            } else {
                sellTab.style.background = '#ef4444';
                sellTab.style.color = 'white';
                buyTab.style.background = 'rgba(34, 197, 94, 0.2)';
                buyTab.style.color = '#22c55e';
                placeBtn.style.background = '#ef4444';
            }
        }

        const orderTypeButtons = document.querySelectorAll('.order-type-btn');
        orderTypeButtons.forEach(btn => {
            if (btn.dataset.type === (order.orderType || 'limit')) {
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.border = '1px solid transparent';
                btn.style.color = '#fff';
                btn.classList.add('active');
            } else {
                btn.style.background = 'transparent';
                btn.style.border = '1px solid transparent';
                btn.style.color = '#787b86';
                btn.classList.remove('active');
            }
        });

        const entryInput = document.getElementById('orderEntryPrice');
        if (entryInput && typeof order.entryPrice === 'number') {
            entryInput.value = order.entryPrice.toFixed(5);
        }

        const quantityInput = document.getElementById('orderQuantity');
        if (quantityInput && typeof order.quantity === 'number') {
            quantityInput.value = order.quantity.toFixed(2);
        }
        const calculatedLots = document.getElementById('calculatedLots');
        if (calculatedLots && typeof order.quantity === 'number') {
            calculatedLots.textContent = `${order.quantity.toFixed(2)} Lots`;
        }

        const riskUsdInput = document.getElementById('riskAmountUSD');
        if (riskUsdInput) {
            const riskValue = typeof order.riskAmount === 'number' ? order.riskAmount.toFixed(2) : '0';
            riskUsdInput.value = riskValue;
        }

        const enableTP = document.getElementById('enableTP');
        const tpInputs = document.getElementById('tpInputs');
        if (enableTP && tpInputs) {
            enableTP.checked = !!order.takeProfit;
            if (typeof enableTP.onchange === 'function') {
                enableTP.onchange();
            } else {
                tpInputs.style.display = enableTP.checked ? 'grid' : 'none';
            }
        }

        const tpPriceInput = document.getElementById('tpPrice');
        if (tpPriceInput) {
            tpPriceInput.value = typeof order.takeProfit === 'number' ? order.takeProfit.toFixed(5) : '';
        }

        const enableSL = document.getElementById('enableSL');
        const slInputs = document.getElementById('slInputs');
        if (enableSL && slInputs) {
            enableSL.checked = !!order.stopLoss;
            if (typeof enableSL.onchange === 'function') {
                enableSL.onchange();
            } else {
                slInputs.style.display = enableSL.checked ? 'grid' : 'none';
            }
        }

        const slPriceInput = document.getElementById('slPrice');
        if (slPriceInput) {
            slPriceInput.value = typeof order.stopLoss === 'number' ? order.stopLoss.toFixed(5) : '';
        }

        const autoBreakevenToggle = document.getElementById('autoBreakevenToggle');
        if (autoBreakevenToggle) {
            autoBreakevenToggle.checked = !!order.autoBreakeven;
            if (typeof autoBreakevenToggle.onchange === 'function') {
                autoBreakevenToggle.onchange();
            }
        }

        if (order.breakevenSettings) {
            this.breakevenMode = order.breakevenSettings.mode || 'pips';
            const pipsInput = document.getElementById('breakevenPips');
            if (pipsInput && this.breakevenMode === 'pips') {
                pipsInput.value = order.breakevenSettings.value ?? 10;
            }
            const amountInput = document.getElementById('breakevenAmount');
            if (amountInput && this.breakevenMode === 'amount') {
                amountInput.value = order.breakevenSettings.value ?? 50;
            }
            
            // Restore pip offset
            const pipOffsetInput = document.getElementById('breakevenPipOffset');
            if (pipOffsetInput) {
                pipOffsetInput.value = order.breakevenSettings.pipOffset ?? 0;
            }

            document.querySelectorAll('.breakeven-mode-tab').forEach(tab => {
                const mode = tab.getAttribute('data-mode');
                if (mode === this.breakevenMode) {
                    tab.style.background = '#7c3aed';
                    tab.style.color = '#fff';
                    tab.style.border = 'none';
                } else {
                    tab.style.background = 'transparent';
                    tab.style.color = '#787b86';
                    tab.style.border = '1px solid #2a2e39';
                }
            });
        }

        this.isPopulatingOrderPanel = false;
        
        // Perform all calculations to update displays
        this.calculatePositionFromRisk();
        this.calculateAdvancedRiskReward();
        this.updatePlaceButtonText();
    }
    
    /**
     * Initialize market type selector inside the order panel
     */
    initMarketTypeSelectorInPanel() {
        const btn = document.getElementById('marketTypeBtnPanel');
        const dropdown = document.getElementById('marketTypeDropdownPanel');
        const iconEl = document.getElementById('marketTypeIcon');
        const nameEl = document.getElementById('marketTypeName');
        
        if (!btn || !dropdown) return;
        
        // Update button with current market type
        const config = this.getMarketConfig();
        if (iconEl) iconEl.textContent = config.icon;
        if (nameEl) nameEl.textContent = config.name;
        
        // Populate dropdown options
        dropdown.innerHTML = '';
        Object.keys(this.marketConfigs).forEach(key => {
            const mConfig = this.marketConfigs[key];
            const option = document.createElement('div');
            option.className = 'market-type-option-panel';
            option.dataset.market = key;
            option.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 10px 12px;
                border-radius: 6px;
                cursor: pointer;
                transition: all 0.15s ease;
                color: ${key === this.marketType ? '#fff' : '#9ca3af'};
                background: ${key === this.marketType ? 'rgba(124, 58, 237, 0.2)' : 'transparent'};
                border-left: 3px solid ${key === this.marketType ? '#7c3aed' : 'transparent'};
            `;
            option.innerHTML = `
                <span style="font-size: 18px;">${mConfig.icon}</span>
                <div style="flex: 1;">
                    <div style="font-weight: 600; font-size: 12px;">${mConfig.name}</div>
                    <div style="font-size: 10px; color: #6b7280;">${mConfig.examples}</div>
                </div>
                ${key === this.marketType ? '<span style="color: #7c3aed;">✓</span>' : ''}
            `;
            
            option.onmouseenter = () => {
                if (key !== this.marketType) {
                    option.style.background = 'rgba(255, 255, 255, 0.05)';
                    option.style.color = '#fff';
                }
            };
            option.onmouseleave = () => {
                if (key !== this.marketType) {
                    option.style.background = 'transparent';
                    option.style.color = '#9ca3af';
                }
            };
            option.onclick = (e) => {
                e.stopPropagation();
                this.switchMarketType(key);
                dropdown.style.display = 'none';
                
                // Update button
                const newConfig = this.getMarketConfig();
                if (iconEl) iconEl.textContent = newConfig.icon;
                if (nameEl) nameEl.textContent = newConfig.name;
                
                // Update all options
                document.querySelectorAll('.market-type-option-panel').forEach(opt => {
                    const isActive = opt.dataset.market === key;
                    opt.style.color = isActive ? '#fff' : '#9ca3af';
                    opt.style.background = isActive ? 'rgba(124, 58, 237, 0.2)' : 'transparent';
                    opt.style.borderLeftColor = isActive ? '#7c3aed' : 'transparent';
                    // Update checkmark
                    const existingCheck = opt.querySelector('span[style*="color: #7c3aed"]');
                    if (existingCheck && existingCheck.textContent === '✓') {
                        existingCheck.remove();
                    }
                    if (isActive && !opt.querySelector('span[style*="color: #7c3aed"]')) {
                        opt.innerHTML += '<span style="color: #7c3aed;">✓</span>';
                    }
                });
            };
            
            dropdown.appendChild(option);
        });
        
        // Toggle dropdown
        btn.onclick = (e) => {
            e.stopPropagation();
            const isVisible = dropdown.style.display === 'block';
            dropdown.style.display = isVisible ? 'none' : 'block';
        };
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!btn.contains(e.target) && !dropdown.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });
    }
    
    /**
     * Attach event listeners to order panel
     */
    attachOrderPanelEvents() {
        // Close button
        document.getElementById('closeOrderPanel').onclick = () => {
            this.toggleOrderPanel();
        };
        
        // Initialize Market Type Selector in panel
        this.initMarketTypeSelectorInPanel();
        
        // Advanced Order Toggle - controls visibility of advanced features
        const advancedOrderToggle = document.getElementById('advancedOrderToggle');
        const advancedOptions = document.getElementById('advancedOptions');
        const protectionSystemSection = document.getElementById('protectionSystemSection');
        const multipleTPSection = document.getElementById('multipleTPSection');
        const scalePositionSection = document.getElementById('scalePositionSection');
        
        // Store initial state flag
        this.advancedOrderEnabled = advancedOrderToggle?.checked || false;
        
        const updateAdvancedVisibility = () => {
            const isEnabled = advancedOrderToggle.checked;
            this.advancedOrderEnabled = isEnabled;
            
            // Toggle visibility of advanced sections (TP and SL stay visible always)
            if (advancedOptions) advancedOptions.style.display = isEnabled ? 'block' : 'none';
            if (protectionSystemSection) protectionSystemSection.style.display = isEnabled ? 'block' : 'none';
            if (multipleTPSection) multipleTPSection.style.display = isEnabled ? 'block' : 'none';
            if (scalePositionSection) scalePositionSection.style.display = isEnabled ? 'block' : 'none';
            
            // When disabled, reset/disable the advanced features (keep TP/SL enabled)
            if (!isEnabled) {
                // Disable multiple TPs
                const multipleTPToggle = document.getElementById('multipleTPToggle');
                if (multipleTPToggle) multipleTPToggle.checked = false;
                
                // Disable scaling
                const scalePositionCheckbox = document.getElementById('scalePositionCheckbox');
                if (scalePositionCheckbox) scalePositionCheckbox.checked = false;
                
                // Disable breakeven and trailing
                const autoBreakevenToggle = document.getElementById('autoBreakevenToggle');
                if (autoBreakevenToggle) autoBreakevenToggle.checked = false;
                
                const trailingSLToggle = document.getElementById('trailingSLToggle');
                if (trailingSLToggle) trailingSLToggle.checked = false;
                
                // Clear split entries
                this.splitEntries = [];
                this.splitEntriesEnabled = false;
            }
            
            // Update preview lines
            this.updatePreviewLines();
            this.calculateAdvancedRiskReward();
            
            console.log(`🔧 Advanced Order: ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
        };
        
        if (advancedOrderToggle) {
            advancedOrderToggle.onchange = updateAdvancedVisibility;
            // Initialize visibility on load
            updateAdvancedVisibility();
        }
        
        // BUY/SELL tabs
        const buyTab = document.getElementById('buyTab');
        const sellTab = document.getElementById('sellTab');
        const placeBtn = document.getElementById('placeOrderButton');
        
        buyTab.onclick = () => {
            buyTab.style.background = '#22c55e';
            buyTab.style.color = 'white';
            sellTab.style.background = 'rgba(239, 68, 68, 0.2)';
            sellTab.style.color = '#ef4444';
            placeBtn.style.background = '#22c55e';
            this.orderSide = 'BUY';
            // Reset TP/SL positioning flags when switching sides
            this.tpManuallyPositioned = false;
            this.slManuallyPositioned = false;
            this.updatePlaceButtonText();
            this.calculateAdvancedRiskReward();
            this.updatePreviewLines(); // Update preview when switching sides
            this.updateScalingCheckboxAvailability(); // Update scaling checkbox
        };
        
        sellTab.onclick = () => {
            sellTab.style.background = '#ef4444';
            sellTab.style.color = 'white';
            buyTab.style.background = 'rgba(34, 197, 94, 0.2)';
            buyTab.style.color = '#22c55e';
            placeBtn.style.background = '#ef4444';
            this.orderSide = 'SELL';
            // Reset TP/SL positioning flags when switching sides
            this.tpManuallyPositioned = false;
            this.slManuallyPositioned = false;
            this.updatePlaceButtonText();
            this.calculateAdvancedRiskReward();
            this.updatePreviewLines(); // Update preview when switching sides
            this.updateScalingCheckboxAvailability(); // Update scaling checkbox
        };
        
        // Order type buttons
        document.querySelectorAll('.order-type-btn').forEach(btn => {
            btn.onclick = () => {
                // Update order type
                this.orderType = btn.dataset.type;
                console.log(`📝 Order type changed to: ${this.orderType.toUpperCase()}`);
                
                // Update button styling
                document.querySelectorAll('.order-type-btn').forEach(b => {
                    b.style.background = 'transparent';
                    b.style.border = '1px solid transparent';
                    b.style.color = '#787b86';
                    b.classList.remove('active');
                });
                btn.style.background = 'rgba(255,255,255,0.1)';
                btn.style.border = '1px solid transparent';
                btn.style.color = '#fff';
                btn.classList.add('active');
                
                // Show entry price warning for market orders
                if (this.orderType === 'market') {
                    this.updateOrderPanelPrice();
                }
                
                // Update preview lines when order type changes
                this.updatePreviewLines();
            };
        });
        
        // Position sizing mode tabs
        document.querySelectorAll('.position-mode-tab').forEach(tab => {
            tab.onclick = () => {
                const mode = tab.dataset.mode;
                this.positionSizeMode = mode;
                
                // Update tab styling
                document.querySelectorAll('.position-mode-tab').forEach(t => {
                    if (t === tab) {
                        t.style.background = '#7c3aed';
                        t.style.color = '#fff';
                        t.style.border = 'none';
                    } else {
                        t.style.background = 'transparent';
                        t.style.color = '#787b86';
                        t.style.border = '1px solid #2a2e39';
                    }
                });
                
                // Show/hide appropriate input by toggling is-hidden class
                const riskUSDInput = document.getElementById('riskUSDInput');
                const riskPercentInput = document.getElementById('riskPercentInput');
                const lotSizeInput = document.getElementById('lotSizeInput');
                
                if (mode === 'risk-usd') {
                    riskUSDInput.classList.remove('is-hidden');
                    riskPercentInput.classList.add('is-hidden');
                    lotSizeInput.classList.add('is-hidden');
                } else if (mode === 'risk-percent') {
                    riskUSDInput.classList.add('is-hidden');
                    riskPercentInput.classList.remove('is-hidden');
                    lotSizeInput.classList.add('is-hidden');
                } else if (mode === 'lot-size') {
                    riskUSDInput.classList.add('is-hidden');
                    riskPercentInput.classList.add('is-hidden');
                    lotSizeInput.classList.remove('is-hidden');
                }
                
                // Update labels based on mode
                const calculatedLabel = document.getElementById('calculatedLabel');
                if (calculatedLabel) {
                    if (mode === 'lot-size') {
                        calculatedLabel.textContent = 'Calculated Risk:';
                    } else {
                        calculatedLabel.textContent = 'Position Size:';
                    }
                }
                
                // Auto-switch TP distribution mode to match position sizing mode
                let newTPMode;
                if (mode === 'risk-usd') {
                    newTPMode = 'amount';
                } else if (mode === 'risk-percent') {
                    newTPMode = 'percent';
                } else if (mode === 'lot-size') {
                    newTPMode = 'lots';
                }
                
                // Update TP distribution mode (auto-synced with position sizing mode)
                if (newTPMode && this.tpDistributionMode !== newTPMode) {
                    this.tpDistributionMode = newTPMode;
                    
                    // Update hint text to show current mode
                    const hint = document.getElementById('tpDistributionHint');
                    if (hint) {
                        if (newTPMode === 'percent') {
                            hint.textContent = 'TPs will be evenly distributed. Each will close an equal % of position.';
                        } else if (newTPMode === 'amount') {
                            hint.textContent = 'TPs will be evenly distributed. Each will close an equal $ amount.';
                        } else if (newTPMode === 'lots') {
                            hint.textContent = 'TPs will be evenly distributed. Each will close an equal lot size.';
                        }
                    }
                }
                
                // Recalculate position size
                this.calculatePositionFromRisk();
                
                // Recalculate TP targets if multiple TPs are enabled
                // (position size change affects amount/lots distribution)
                const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked;
                if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
                    const numTargets = this.tpTargets.length;
                    this.calculateTPTargetsFromNumber(numTargets);
                }
                
                // Update preview lines
                this.updatePreviewLines();
            };
        });
        
        // Risk input changes
        const riskUSDInput = document.getElementById('riskAmountUSD');
        const riskPercentInput = document.getElementById('riskAmountPercent');
        const lotSizeInput = document.getElementById('lotSizeAmount');
        
        if (riskUSDInput) {
            riskUSDInput.oninput = () => {
                this.calculatePositionFromRisk();
                
                // Recalculate TP targets if multiple TPs enabled
                const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked;
                if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
                    this.calculateTPTargetsFromNumber(this.tpTargets.length);
                }
                
                this.updatePreviewLines();
            };
        }
        
        if (riskPercentInput) {
            riskPercentInput.oninput = () => {
                this.calculatePositionFromRisk();
                
                // Recalculate TP targets if multiple TPs enabled
                const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked;
                if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
                    this.calculateTPTargetsFromNumber(this.tpTargets.length);
                }
                
                this.updatePreviewLines();
            };
        }
        
        if (lotSizeInput) {
            lotSizeInput.oninput = () => {
                this.calculatePositionFromRisk();
                
                // Recalculate TP targets if multiple TPs enabled
                const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked;
                if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
                    this.calculateTPTargetsFromNumber(this.tpTargets.length);
                }
                
                this.updatePreviewLines();
            };
        }
        
        // Input stepper buttons (+/- controls)
        document.querySelectorAll('.input-stepper').forEach(btn => {
            btn.onclick = () => {
                const targetId = btn.dataset.target;
                const step = parseFloat(btn.dataset.step);
                const input = document.getElementById(targetId);
                
                if (input) {
                    let currentValue = parseFloat(input.value) || 0;
                    let newValue = currentValue + step;
                    
                    // Apply min constraints
                    if (targetId === 'riskAmountUSD') {
                        newValue = Math.max(1, newValue);
                    } else if (targetId === 'riskAmountPercent') {
                        newValue = Math.max(0.1, newValue);
                    } else if (targetId === 'lotSizeAmount') {
                        newValue = Math.max(0.01, newValue);
                    }
                    
                    // Round to appropriate decimal places
                    if (targetId === 'riskAmountUSD') {
                        newValue = Math.round(newValue);
                    } else if (targetId === 'riskAmountPercent') {
                        newValue = parseFloat(newValue.toFixed(1));
                    } else if (targetId === 'lotSizeAmount') {
                        newValue = parseFloat(newValue.toFixed(2));
                    }
                    
                    input.value = newValue;
                    
                    // Trigger recalculation
                    this.calculatePositionFromRisk();
                    
                    // Recalculate TP targets if multiple TPs enabled
                    const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked;
                    if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
                        this.calculateTPTargetsFromNumber(this.tpTargets.length);
                    }
                    
                    this.calculateAdvancedRiskReward();
                    this.updatePreviewLines();
                    this.updatePlaceButtonText();
                    
                    console.log(`📊 Adjusted ${targetId}: ${currentValue} → ${newValue}`);
                }
            };
        });

        // Risk percentage buttons
        document.querySelectorAll('.risk-btn').forEach(btn => {
            btn.onclick = () => {
                const riskPercent = parseFloat(btn.dataset.risk);
                this.applyRiskPercentage(riskPercent);
                
                // Highlight selected button
                document.querySelectorAll('.risk-btn').forEach(b => {
                    b.style.background = 'rgba(255,255,255,0.05)';
                    b.style.color = '#787b86';
                });
                btn.style.background = 'rgba(124, 58, 237, 0.2)';
                btn.style.color = '#7c3aed';
                
                // Update preview lines
                this.updatePreviewLines();
            };
        });
        
        // Balance type radio buttons (Current / Initial)
        document.querySelectorAll('input[name="balanceType"]').forEach(radio => {
            radio.onchange = () => {
                // Recalculate position size when balance type changes (only affects Risk % mode)
                if (this.positionSizeMode === 'risk-percent') {
                    this.calculatePositionFromRisk();
                    this.calculateAdvancedRiskReward();
                    this.updatePreviewLines();
                }
            };
        });
        
        // Collapse/Expand sections
        document.querySelectorAll('.order-collapse__header').forEach(header => {
            header.onclick = () => {
                const collapse = header.closest('.order-collapse');
                const content = collapse.querySelector('.order-collapse__content');
                const chevron = header.querySelector('.order-collapse__chevron');
                
                if (content) {
                    // Toggle visibility
                    const isOpen = collapse.classList.contains('order-collapse--open');
                    
                    if (isOpen) {
                        collapse.classList.remove('order-collapse--open');
                        content.style.display = 'none';
                        if (chevron) chevron.style.transform = 'rotate(0deg)';
                    } else {
                        collapse.classList.add('order-collapse--open');
                        content.style.display = 'block';
                        if (chevron) chevron.style.transform = 'rotate(180deg)';
                    }
                }
            };
        });
        
        // Enable/Disable TP/SL
        const enableTP = document.getElementById('enableTP');
        const tpInputs = document.getElementById('tpInputs');
        if (enableTP && tpInputs) {
            enableTP.onchange = () => {
                tpInputs.style.display = enableTP.checked ? 'grid' : 'none';
                if (enableTP.checked) {
                    this.syncDefaultTargetsToEntry();
                }
                this.calculateAdvancedRiskReward();
                this.updatePreviewLines(); // Update preview when TP is toggled
            };
        }
        
        const enableSL = document.getElementById('enableSL');
        const slInputs = document.getElementById('slInputs');
        if (enableSL && slInputs) {
            enableSL.onchange = () => {
                slInputs.style.display = enableSL.checked ? 'grid' : 'none';
                if (enableSL.checked) {
                    this.syncDefaultTargetsToEntry();
                }
                // Recalculate position size
                this.calculatePositionFromRisk();
                this.calculateAdvancedRiskReward();
                this.updatePreviewLines(); // Update preview when SL is toggled
            };
        }
        
        // Auto breakeven toggle
        const autoBreakevenToggle = document.getElementById('autoBreakevenToggle');
        const breakevenSettings = document.getElementById('breakevenSettings');
        if (autoBreakevenToggle && breakevenSettings) {
            const updateBreakevenVisibility = () => {
                breakevenSettings.classList.toggle('is-hidden', !autoBreakevenToggle.checked);
                
                // Reset BE manual position flag when toggled on (to auto-position between Entry and TP)
                if (autoBreakevenToggle.checked) {
                    this.beManuallyPositioned = false;
                }
                
                // Update preview lines to show/hide the breakeven line immediately
                this.updatePreviewLines();
            };
            autoBreakevenToggle.onchange = updateBreakevenVisibility;
            updateBreakevenVisibility();
        }
        
        // Custom Protection Settings System
        this.loadSavedProtectionSettings();
        
        // Create New Protection Setting (+ button)
        const createBtn = document.getElementById('createNewProtectionSetting');
        if (createBtn) {
            createBtn.onclick = () => {
                this.openProtectionSettingsModal();
            };
        }
        
        // Load Protection Setting
        const loadBtn = document.getElementById('loadProtectionSetting');
        if (loadBtn) {
            loadBtn.onclick = () => {
                const select = document.getElementById('savedProtectionSettings');
                const settingName = select?.value;
                if (!settingName) {
                    this.showNotification('⚠️ Please select a setting to load', 'warning');
                    return;
                }
                
                const saved = JSON.parse(localStorage.getItem('protectionSettings') || '[]');
                const setting = saved.find(s => s.name === settingName);
                if (setting) {
                    this.applyProtectionSettings(setting);
                    this.showNotification(`📥 Protection setting "${settingName}" loaded!`, 'success');
                }
            };
        }
        
        // Delete Protection Setting
        const deleteBtn = document.getElementById('deleteProtectionSetting');
        if (deleteBtn) {
            deleteBtn.onclick = () => {
                const select = document.getElementById('savedProtectionSettings');
                const settingName = select?.value;
                if (!settingName) {
                    this.showNotification('⚠️ Please select a setting to delete', 'warning');
                    return;
                }
                
                if (!confirm(`Delete protection setting "${settingName}"?`)) return;
                
                let saved = JSON.parse(localStorage.getItem('protectionSettings') || '[]');
                saved = saved.filter(s => s.name !== settingName);
                localStorage.setItem('protectionSettings', JSON.stringify(saved));
                this.loadSavedProtectionSettings();
                this.showNotification(`🗑️ Protection setting "${settingName}" deleted!`, 'success');
            };
        }
        
        // Breakeven mode tabs
        document.querySelectorAll('.breakeven-mode-tab').forEach(tab => {
            tab.onclick = () => {
                const mode = tab.getAttribute('data-mode');
                
                // Handle breakeven tabs (pips or amount)
                if (mode === 'pips' || mode === 'amount') {
                    this.breakevenMode = mode;
                    
                    // Update tab styles
                    document.querySelectorAll('.breakeven-mode-tab').forEach(t => {
                        if (t.getAttribute('data-mode') === 'pips' || t.getAttribute('data-mode') === 'amount') {
                            t.style.background = 'transparent';
                            t.style.color = '#787b86';
                            t.style.border = '1px solid #2a2e39';
                        }
                    });
                    tab.style.background = '#7c3aed';
                    tab.style.color = '#fff';
                    tab.style.border = 'none';
                    
                    // Toggle inputs
                    const pipsInput = document.getElementById('breakevenPipsInput');
                    const amountInput = document.getElementById('breakevenAmountInput');
                    if (mode === 'pips') {
                        if (pipsInput) pipsInput.style.display = 'flex';
                        if (amountInput) amountInput.style.display = 'none';
                    } else {
                        if (pipsInput) pipsInput.style.display = 'none';
                        if (amountInput) amountInput.style.display = 'flex';
                    }
                    
                    // Update breakeven line when mode changes
                    this.updatePreviewLines();
                }
                
                // Handle trailing stop activation mode tabs
                if (mode === 'trail-rr' || mode === 'trail-pips') {
                    this.trailingActivateMode = mode;
                    
                    // Update tab styles
                    const trailRRTab = document.getElementById('trailActivateRRTab');
                    const trailPipsTab = document.getElementById('trailActivatePipsTab');
                    if (trailRRTab && trailPipsTab) {
                        trailRRTab.style.background = mode === 'trail-rr' ? '#7c3aed' : 'transparent';
                        trailRRTab.style.color = mode === 'trail-rr' ? '#fff' : '#787b86';
                        trailRRTab.style.border = mode === 'trail-rr' ? 'none' : '1px solid #2a2e39';
                        
                        trailPipsTab.style.background = mode === 'trail-pips' ? '#7c3aed' : 'transparent';
                        trailPipsTab.style.color = mode === 'trail-pips' ? '#fff' : '#787b86';
                        trailPipsTab.style.border = mode === 'trail-pips' ? 'none' : '1px solid #2a2e39';
                    }
                    
                    // Toggle inputs
                    const rrInput = document.getElementById('trailingActivateRRInput');
                    const pipsInput = document.getElementById('trailingActivatePipsInput');
                    if (mode === 'trail-rr') {
                        if (rrInput) rrInput.style.display = 'flex';
                        if (pipsInput) pipsInput.style.display = 'none';
                    } else {
                        if (rrInput) rrInput.style.display = 'none';
                        if (pipsInput) pipsInput.style.display = 'flex';
                    }
                }
            };
        });
        
        // Trailing SL toggle
        const trailingSLToggle = document.getElementById('trailingSLToggle');
        const trailingSLSettings = document.getElementById('trailingSLSettings');
        if (trailingSLToggle && trailingSLSettings) {
            this.trailingActivateMode = 'trail-rr'; // Default mode
            trailingSLToggle.onchange = () => {
                trailingSLSettings.classList.toggle('is-hidden', !trailingSLToggle.checked);
                
                // Initialize or stop trailing system
                if (trailingSLToggle.checked) {
                    this.initializeTrailingSL();
                } else {
                    this.stopTrailingSL();
                }
            };
        }
        
        // Multiple TP toggle
        const multipleTPToggle = document.getElementById('multipleTPToggle');
        const multipleTPSettings = document.getElementById('multipleTPSettings');
        if (multipleTPToggle && multipleTPSettings) {
            multipleTPToggle.onchange = () => {
                multipleTPSettings.classList.toggle('is-hidden', !multipleTPToggle.checked);
                // If enabling, initialize with number from input
                if (multipleTPToggle.checked) {
                    this.initializeTPTargets();
                }
                // Update preview lines to show/hide multiple TP badges
                this.updatePreviewLines();
            };
        }
        
        // Number of TP targets input
        const numTPInput = document.getElementById('numTPTargets');
        if (numTPInput) {
            numTPInput.oninput = () => {
                const num = parseInt(numTPInput.value || 2);
                if (num >= 2 && num <= 10 && this.tpTargets) {
                    // Auto-recalculate when number changes
                    this.calculateTPTargetsFromNumber(num);
                }
            };
        }
        
        // Auto-calculate button
        const recalcButton = document.getElementById('recalculateTPTargets');
        if (recalcButton) {
            recalcButton.onclick = () => {
                const num = parseInt(document.getElementById('numTPTargets')?.value || 2);
                this.calculateTPTargetsFromNumber(num);
                this.showNotification(`✅ Recalculated ${num} TP targets`, 'success');
            };
        }
        
        // Add TP Target button (deprecated but kept for compatibility)
        const addTPButton = document.getElementById('addTPTarget');
        if (addTPButton) {
            addTPButton.onclick = () => {
                this.addTPTarget();
            };
        }
        
        // Breakeven inputs - update BE line when values change
        const breakevenPipsInput = document.getElementById('breakevenPips');
        const breakevenAmountInput = document.getElementById('breakevenAmount');
        const breakevenPipOffsetInput = document.getElementById('breakevenPipOffset');
        
        if (breakevenPipsInput) {
            breakevenPipsInput.oninput = () => {
                this.updatePreviewLines();
            };
        }
        if (breakevenAmountInput) {
            breakevenAmountInput.oninput = () => {
                this.updatePreviewLines();
            };
        }
        if (breakevenPipOffsetInput) {
            breakevenPipOffsetInput.oninput = () => {
                this.updatePreviewLines();
            };
        }
        
        // Input changes for all fields
        ['orderQuantity', 'orderEntryPrice', 'tpPrice', 'slPrice', 'maxRiskPercent', 'maxRiskAmount'].forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.oninput = () => {
                    if (id === 'orderEntryPrice') {
                        this.syncDefaultTargetsToEntry();
                    }
                    if (id === 'tpPrice') {
                        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || '0');
                        const tpValue = parseFloat(input.value || '0');
                        const precision = this.getPricePrecision(entryPrice || tpValue || 0);
                        const epsilon = Math.pow(10, -(precision + 1));
                        if (!entryPrice || Math.abs(tpValue - entryPrice) > epsilon) {
                            this.tpLastSyncedEntryPrice = null;
                        }
                    }
                    if (id === 'slPrice') {
                        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || '0');
                        const slValue = parseFloat(input.value || '0');
                        const precision = this.getPricePrecision(entryPrice || slValue || 0);
                        const epsilon = Math.pow(10, -(precision + 1));
                        if (!entryPrice || Math.abs(slValue - entryPrice) > epsilon) {
                            this.slLastSyncedEntryPrice = null;
                        }
                    }
                    // If entry/SL changes, recalculate position size
                    if (id === 'orderEntryPrice' || id === 'slPrice') {
                        this.calculatePositionFromRisk();
                        // Reset and reinitialize trailing if active
                        this.resetTrailingOnPriceChange();
                    }
                    this.calculateAdvancedRiskReward();
                    this.updatePlaceButtonText();
                    
                    // Update preview lines when TP/SL/Entry/Quantity values change
                    if (id.includes('tp') || id.includes('sl') || id === 'orderEntryPrice' || id === 'orderQuantity') {
                        this.updatePreviewLines();
                    }
                };
            }
        });
        
        // Position scaling checkbox
        const scaleCheckbox = document.getElementById('scalePositionCheckbox');
        if (scaleCheckbox) {
            scaleCheckbox.addEventListener('change', (e) => {
                this.scaleNextOrder = e.target.checked;
                console.log(`📊 Position Scaling: ${this.scaleNextOrder ? 'WILL scale next order' : 'Normal order (no scaling)'}`);
            });
        }
        
        // Update scaling checkbox availability initially
        this.updateScalingCheckboxAvailability();
        
        // Place order button
        placeBtn.onclick = () => {
            // Set scaling flag based on checkbox before placing order
            const scaleCheckbox = document.getElementById('scalePositionCheckbox');
            if (scaleCheckbox) {
                this.scaleNextOrder = scaleCheckbox.checked;
                console.log(`🎯 Place Order clicked - Scaling checkbox: ${scaleCheckbox.checked ? 'CHECKED ✅' : 'UNCHECKED ❌'}`);
                console.log(`   this.scaleNextOrder set to: ${this.scaleNextOrder}`);
                console.log(`   this.enablePositionScaling: ${this.enablePositionScaling}`);
                console.log(`   Order side: ${this.orderSide}`);
                console.log(`   Open positions: ${this.openPositions.length}`);
                if (this.openPositions.length > 0) {
                    console.log(`   Open positions detail:`, this.openPositions.map(p => `#${p.id} ${p.type} ${p.status}`));
                }
            } else {
                console.error('❌ scalePositionCheckbox element NOT FOUND!');
            }
            this.placeAdvancedOrder();
        };
        
        // Initialize
        this.orderSide = 'BUY';
        this.updatePlaceButtonText();
    }
    
    /**
     * Update place button text with dynamic symbol
     */
    updatePlaceButtonText() {
        const placeBtn = document.getElementById('placeOrderButton');
        const config = this.getMarketConfig();
        const positionLabel = config.positionLabel;
        
        const editingId = this.editingPendingOrderId;
        if (placeBtn && editingId && (this.orderType === 'limit' || this.orderType === 'stop')) {
            const typeLabel = this.orderType ? this.orderType.toUpperCase() : 'PENDING';
            const directionLabel = this.orderSide ? this.orderSide.toUpperCase() : '';
            placeBtn.textContent = `Update ${typeLabel} ${directionLabel} #${editingId}`;
            return;
        }

        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 0);
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        const enableSL = document.getElementById('enableSL')?.checked;
        const slPrice = parseFloat(document.getElementById('slPrice')?.value || 0);
        
        // Get current symbol from chart
        const symbol = this.chart?.currentSymbol || '';
        
        if (placeBtn) {
            const action = this.orderSide === 'BUY' ? 'Buy' : 'Sell';
            
            // Check if order can be placed
            let canPlace = true;
            let reason = '';
            
            // Check entry price
            if (!entryPrice || entryPrice <= 0) {
                canPlace = false;
                reason = 'Set Entry Price';
            }
            // Check quantity
            else if (!quantity || quantity <= 0) {
                canPlace = false;
                
                // Provide specific reason based on mode
                if (this.positionSizeMode === 'lot-size') {
                    reason = `Enter ${positionLabel}`;
                } else if ((this.positionSizeMode === 'risk-usd' || this.positionSizeMode === 'risk-percent')) {
                    if (!enableSL || !slPrice || slPrice <= 0) {
                        reason = 'Set Stop Loss';
                    } else {
                        reason = 'Set Position Size';
                    }
                } else {
                    reason = 'Set Position Size';
                }
            }
            
            // Update button state
            if (!canPlace) {
                placeBtn.disabled = true;
                placeBtn.style.opacity = '0.5';
                placeBtn.style.cursor = 'not-allowed';
                placeBtn.textContent = `${action} 0.00 ${positionLabel} - ${reason}`;
            } else {
                placeBtn.disabled = false;
                placeBtn.style.opacity = '1';
                placeBtn.style.cursor = 'pointer';
                
                if (symbol) {
                    placeBtn.textContent = `${action} ${quantity.toFixed(2)} ${symbol}`;
                } else {
                    placeBtn.textContent = `${action} ${quantity.toFixed(2)} ${positionLabel}`;
                }
            }
        }
        
        // Also update calculated lots display with correct label
        const calculatedLots = document.getElementById('calculatedLots');
        if (calculatedLots) {
            calculatedLots.textContent = `${quantity.toFixed(2)} ${positionLabel}`;
        }
    }
    
    /**
     * Update scaling checkbox availability based on open positions
     */
    updateScalingCheckboxAvailability() {
        const scaleCheckbox = document.getElementById('scalePositionCheckbox');
        const scaleLabel = scaleCheckbox?.closest('label');
        
        if (!scaleCheckbox) return;
        
        // Get the current order side from the panel
        const orderSide = this.orderSide || 'BUY';
        
        // Check if there are any open positions with the same direction
        const hasMatchingOpenPosition = this.openPositions.some(pos => 
            pos.status === 'OPEN' && pos.type === orderSide
        );
        
        if (hasMatchingOpenPosition) {
            // Enable checkbox - there are positions to scale with
            scaleCheckbox.disabled = false;
            if (scaleLabel) {
                scaleLabel.style.opacity = '1';
                scaleLabel.style.cursor = 'pointer';
                scaleLabel.title = `Scale with existing ${orderSide} position`;
            }
        } else {
            // Disable checkbox - no positions to scale with
            scaleCheckbox.disabled = true;
            scaleCheckbox.checked = false; // Uncheck it
            this.scaleNextOrder = false; // Reset flag
            if (scaleLabel) {
                scaleLabel.style.opacity = '0.5';
                scaleLabel.style.cursor = 'not-allowed';
                scaleLabel.title = `No open ${orderSide} positions to scale with`;
            }
        }
    }
    
    /**
     * Calculate position size from risk amount or percentage, or calculate risk from lot size
     */
    calculatePositionFromRisk() {
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        const slPrice = parseFloat(document.getElementById('slPrice')?.value || 0);
        const enableSL = document.getElementById('enableSL')?.checked;
        
        // For lot-size mode, we don't need SL to set position size
        if (this.positionSizeMode === 'lot-size') {
            const lotSize = parseFloat(document.getElementById('lotSizeAmount')?.value || 0);
            
            if (lotSize <= 0) {
                document.getElementById('calculatedLots').textContent = '$0.00';
                document.getElementById('orderQuantity').value = '0';
                return;
            }
            
            // Update orderQuantity
            const qtyInput = document.getElementById('orderQuantity');
            if (qtyInput) {
                qtyInput.value = lotSize.toFixed(2);
                console.log(`📊 Lot Size Mode: Setting orderQuantity to ${lotSize.toFixed(2)}`);
            }
            
            // Update preview lines to show new lot size on Entry label
            // Use requestAnimationFrame to ensure DOM has updated
            requestAnimationFrame(() => {
                this.updatePreviewLines();
            });
            
            // Calculate risk if SL is enabled
            if (entryPrice && slPrice && enableSL) {
                const slDistance = Math.abs(entryPrice - slPrice);
                const slDistanceInPips = slDistance / this.pipSize;
                const calculatedRisk = slDistanceInPips * lotSize * this.pipValuePerLot;
                
                document.getElementById('calculatedLots').textContent = `$${calculatedRisk.toFixed(2)}`;
                
                console.log(`📊 Risk Calculation (Lot Size Mode):`);
                console.log(`   Lot Size: ${lotSize.toFixed(2)} lots`);
                console.log(`   SL Distance: ${slDistance.toFixed(5)} (${slDistanceInPips.toFixed(2)} pips)`);
                console.log(`   Calculated Risk: $${calculatedRisk.toFixed(2)}`);
            } else {
                document.getElementById('calculatedLots').textContent = `${lotSize.toFixed(2)} Lots (Set SL for risk)`;
            }
            
            this.updatePlaceButtonText();
            this.calculateAdvancedRiskReward();
            return;
        }
        
        // For risk-based modes, need entry price and stop loss to calculate position size
        if (!entryPrice || !slPrice || !enableSL) {
            document.getElementById('calculatedLots').textContent = '0.00 Lots (Set SL)';
            document.getElementById('orderQuantity').value = '0';
            return;
        }
        
        // Calculate stop loss distance in price
        const slDistance = Math.abs(entryPrice - slPrice);
        if (slDistance === 0) {
            document.getElementById('calculatedLots').textContent = '0.00 Lots';
            document.getElementById('orderQuantity').value = '0';
            return;
        }
        
        // Get risk amount based on mode
        let riskAmount = 0;
        if (this.positionSizeMode === 'risk-usd') {
            riskAmount = parseFloat(document.getElementById('riskAmountUSD')?.value || 0);
        } else if (this.positionSizeMode === 'risk-percent') {
            const riskPercent = parseFloat(document.getElementById('riskAmountPercent')?.value || 0);
            const balanceType = document.querySelector('input[name="balanceType"]:checked')?.value || 'current';
            const balance = balanceType === 'current' ? this.balance : this.initialBalance;
            riskAmount = (balance * riskPercent) / 100;
        }
        
        if (riskAmount <= 0) {
            document.getElementById('calculatedLots').textContent = '0.00 Lots';
            document.getElementById('orderQuantity').value = '0';
            return;
        }
        
        // Calculate position size using pip value
        // Position Size (lots) = Risk $ / (SL Distance in Pips × Pip Value per Lot)
        
        // Convert price distance to pips
        const slDistanceInPips = slDistance / this.pipSize;
        
        // Calculate position size in lots
        const positionSize = riskAmount / (slDistanceInPips * this.pipValuePerLot);
        
        console.log(`📊 Position Size Calculation (${this.positionSizeMode}):`);
        console.log(`   Order Side: ${this.orderSide}`);
        console.log(`   Entry: ${entryPrice.toFixed(5)} | SL: ${slPrice.toFixed(5)}`);
        console.log(`   Risk: $${riskAmount.toFixed(2)}`);
        console.log(`   SL Distance: ${slDistance.toFixed(5)} (${slDistanceInPips.toFixed(2)} pips)`);
        console.log(`   Pip Size: ${this.pipSize}`);
        console.log(`   Pip Value/Lot: $${this.pipValuePerLot}`);
        console.log(`   Position Size: ${positionSize.toFixed(2)} lots`);
        console.log(`   Verification: ${slDistanceInPips.toFixed(2)} pips × ${positionSize.toFixed(2)} lots × $${this.pipValuePerLot} = $${(slDistanceInPips * positionSize * this.pipValuePerLot).toFixed(2)} risk`);
        
        // Update display
        document.getElementById('calculatedLots').textContent = `${positionSize.toFixed(2)} Lots`;
        
        // Update orderQuantity value for order placement
        const qtyInput = document.getElementById('orderQuantity');
        if (qtyInput) {
            qtyInput.value = positionSize.toFixed(2);
            console.log(`📊 Risk Mode: Setting orderQuantity to ${positionSize.toFixed(2)}`);
        }
        
        // Update preview lines to show new lot size on Entry label
        // Use requestAnimationFrame to ensure DOM has updated
        requestAnimationFrame(() => {
            this.updatePreviewLines();
        });
        
        // Update button text
        this.updatePlaceButtonText();
        
        // Recalculate risk/reward with new position size
        this.calculateAdvancedRiskReward();
    }
    
    /**
     * Apply risk percentage to calculate position size
     */
    applyRiskPercentage(riskPercent) {
        const balanceType = document.querySelector('input[name="balanceType"]:checked')?.value || 'current';
        const balance = balanceType === 'current' ? this.balance : this.initialBalance;
        
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        const slPrice = parseFloat(document.getElementById('slPrice')?.value || 0);
        
        if (!entryPrice || !slPrice || slPrice === 0) {
            console.warn('⚠️ Entry price and SL price required for risk calculation');
            return;
        }
        
        // Calculate risk amount
        const riskAmount = balance * (riskPercent / 100);
        
        // Calculate price difference (risk per contract)
        const priceDiff = Math.abs(entryPrice - slPrice);
        
        // Calculate position size
        const positionSize = riskAmount / priceDiff;
        
        // Update quantity field
        const quantityInput = document.getElementById('orderQuantity');
        if (quantityInput) {
            quantityInput.value = positionSize.toFixed(2);
        }
        
        // Update max risk fields
        document.getElementById('maxRiskPercent').value = riskPercent;
        document.getElementById('maxRiskAmount').value = riskAmount.toFixed(2);
        
        // Recalculate TP targets if multiple TPs enabled
        const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked;
        if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
            this.calculateTPTargetsFromNumber(this.tpTargets.length);
        }
        
        this.calculateAdvancedRiskReward();
    }
    
    /**
     * Calculate advanced risk/reward with multiple input types
     */
    calculateAdvancedRiskReward() {
        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        
        if (!entryPrice) return;
        
        // Get TP/SL enabled status
        const tpEnabled = document.getElementById('enableTP')?.checked;
        const slEnabled = document.getElementById('enableSL')?.checked;
        
        let tpPrice = 0;
        let slPrice = 0;
        
        // Calculate TP price (use the first non-zero value)
        if (tpEnabled) {
            const tpPriceInput = parseFloat(document.getElementById('tpPrice')?.value || 0);
            
            if (tpPriceInput > 0) {
                tpPrice = tpPriceInput;
            }
        }
        
        // Check if TP is actually set (different from entry price)
        // Use a small epsilon for floating point comparison
        const tpDistance = Math.abs(entryPrice - tpPrice);
        const minDistance = this.pipSize * 0.5; // At least half a pip difference
        const hasValidTP = tpEnabled && tpPrice > 0 && tpDistance > minDistance;
        
        // Calculate SL price (use the first non-zero value)
        if (slEnabled) {
            const slPriceInput = parseFloat(document.getElementById('slPrice')?.value || 0);
            
            if (slPriceInput > 0) {
                slPrice = slPriceInput;
            }
        }
        
        // Check if SL is actually set (different from entry price)
        // Use a small epsilon for floating point comparison
        const slDistance = Math.abs(entryPrice - slPrice);
        const hasValidSL = slEnabled && slPrice > 0 && slDistance > minDistance;
        
        // Get risk amount based on mode (ONLY if SL is actually set and different from entry)
        let risk = 0;
        if (hasValidSL) {
            if (this.positionSizeMode === 'risk-usd') {
                risk = parseFloat(document.getElementById('riskAmountUSD')?.value || 0);
            } else if (this.positionSizeMode === 'risk-percent') {
                const riskPercent = parseFloat(document.getElementById('riskAmountPercent')?.value || 0);
                const balanceType = document.querySelector('input[name="balanceType"]:checked')?.value || 'current';
                const balance = balanceType === 'current' ? this.balance : this.initialBalance;
                risk = (balance * riskPercent) / 100;
            } else if (this.positionSizeMode === 'lot-size') {
                // Calculate risk from lot size and SL distance
                const slDistanceInPips = slDistance / this.pipSize;
                risk = slDistanceInPips * quantity * this.pipValuePerLot;
            }
        }
        
        // Calculate reward using pip values (ONLY if TP is enabled)
        // For multiple TPs: calculate reward based on distribution mode
        let reward = 0;
        const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked || false;
        
        if (tpEnabled) {
            if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
                // Calculate reward for multiple TPs based on distribution mode
                console.log(`📊 Calculating reward for ${this.tpTargets.length} TP targets, mode: ${this.tpDistributionMode}`);
                this.tpTargets.forEach((target, index) => {
                    console.log(`   Target ${index + 1}: price=${target.price?.toFixed(5)}, percentage=${target.percentage}`);
                    if (target.price > 0 && target.percentage > 0) {
                        let priceDiff;
                        if (this.orderSide === 'BUY') {
                            priceDiff = target.price - entryPrice;
                        } else {
                            priceDiff = entryPrice - target.price;
                        }
                        
                        // Only add if TP is in correct direction (positive profit)
                        if (priceDiff > 0) {
                            const pipsMove = priceDiff / this.pipSize;
                            
                            let partialReward = 0;
                            if (this.tpDistributionMode === 'percent') {
                                // Percent mode: target.percentage is % of position (0-100)
                                const partialQuantity = quantity * (target.percentage / 100);
                                partialReward = pipsMove * partialQuantity * this.pipValuePerLot;
                            } else if (this.tpDistributionMode === 'amount') {
                                // Amount mode: target.percentage is already the dollar amount
                                partialReward = target.percentage;
                                console.log(`      Amount mode: partialReward = ${partialReward}`);
                            } else if (this.tpDistributionMode === 'lots') {
                                // Lots mode: target.percentage is the lot size to close
                                partialReward = pipsMove * target.percentage * this.pipValuePerLot;
                            }
                            
                            reward += partialReward;
                            console.log(`      Added ${partialReward.toFixed(2)}, total reward now: ${reward.toFixed(2)}`);
                        }
                    }
                });
                console.log(`   Final calculated reward: $${reward.toFixed(2)}`);
            } else if (tpPrice > 0) {
                // Single TP reward calculation
                let priceDiff;
                if (this.orderSide === 'BUY') {
                    priceDiff = tpPrice - entryPrice;
                } else {
                    priceDiff = entryPrice - tpPrice;
                }
                
                // Only calculate if TP is in correct direction
                if (priceDiff > 0) {
                    const pipsMove = priceDiff / this.pipSize;
                    reward = pipsMove * quantity * this.pipValuePerLot;
                }
            }
        }
        
        // Update UI
        const rewardEl = document.getElementById('rewardAmount');
        const riskEl = document.getElementById('riskAmount');
        const totalEl = document.getElementById('totalAmount');
        
        // Show reward only if TP is actually set (enabled AND different from entry)
        if (rewardEl) {
            if (!hasValidTP) {
                // No valid TP = unlimited potential gain
                rewardEl.textContent = '∞';
                rewardEl.style.color = '#22c55e'; // Green for unlimited potential
            } else if (reward <= 0) {
                // TP in wrong direction
                rewardEl.textContent = '$0.00';
                rewardEl.style.color = '#9ca3af'; // Gray
            } else {
                rewardEl.textContent = `$${reward.toFixed(2)}`;
                rewardEl.style.color = '#22c55e'; // Green for positive
            }
        }
        
        // Show risk only if SL is actually set (enabled AND different from entry)
        if (riskEl) {
            if (!hasValidSL) {
                // No valid SL = unlimited risk (either disabled or same as entry)
                riskEl.textContent = '∞';
                riskEl.style.color = '#ef4444'; // Red for unlimited risk warning
            } else if (risk <= 0) {
                // SL set but calculated risk is 0
                riskEl.textContent = '$0.00';
                riskEl.style.color = '#9ca3af'; // Gray
            } else {
                riskEl.textContent = `$${risk.toFixed(2)}`;
                riskEl.style.color = '#ef4444'; // Red for risk
            }
        }
        
        // Show total (reward - risk)
        if (totalEl) {
            if (!hasValidSL && !hasValidTP) {
                // Neither set = undefined
                totalEl.textContent = '--';
                totalEl.style.color = '#9ca3af'; // Gray
            } else if (!hasValidSL) {
                // No valid SL = can't calculate net (unlimited risk)
                totalEl.textContent = '-∞';
                totalEl.style.color = '#ef4444'; // Red for unlimited risk
            } else if (!hasValidTP) {
                // No valid TP = unlimited potential gain minus known risk
                totalEl.textContent = '∞';
                totalEl.style.color = '#22c55e'; // Green for unlimited potential
            } else {
                const total = reward - risk;
                totalEl.textContent = `${total >= 0 ? '' : '-'}$${Math.abs(total).toFixed(2)}`;
                totalEl.style.color = total >= 0 ? '#22c55e' : '#ef4444';
            }
        }
    }
    
    /**
     * Initialize TP targets based on number input
     */
    initializeTPTargets() {
        const numTargets = parseInt(document.getElementById('numTPTargets')?.value || 2);
        this.calculateTPTargetsFromNumber(numTargets);
    }
    
    /**
     * Calculate TP targets automatically based on number and distribution mode
     */
    calculateTPTargetsFromNumber(numTargets) {
        this.tpTargets = [];
        
        // Get entry and original TP price
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        const originalTP = parseFloat(document.getElementById('tpPrice')?.value || 0);
        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
        
        if (entryPrice > 0 && originalTP > 0) {
            const distance = Math.abs(originalTP - entryPrice);
            
            // Calculate distribution based on mode
            let distributionValue;
            if (this.tpDistributionMode === 'percent') {
                distributionValue = 100 / numTargets;
            } else if (this.tpDistributionMode === 'amount') {
                // Calculate total reward and divide by number of targets
                const priceDiff = this.orderSide === 'BUY' ? (originalTP - entryPrice) : (entryPrice - originalTP);
                const pipsMove = priceDiff / this.pipSize;
                const totalReward = pipsMove * quantity * this.pipValuePerLot;
                distributionValue = totalReward / numTargets;
            } else if (this.tpDistributionMode === 'lots') {
                distributionValue = quantity / numTargets;
            }
            
            for (let i = 1; i <= numTargets; i++) {
                // Distribute evenly from entry to original TP
                const ratio = i / numTargets;
                let price;
                if (this.orderSide === 'BUY') {
                    price = entryPrice + (distance * ratio);
                } else {
                    price = entryPrice - (distance * ratio);
                }
                
                // Store distribution value with appropriate precision
                let value;
                if (this.tpDistributionMode === 'percent') {
                    value = parseFloat(distributionValue.toFixed(1));
                } else if (this.tpDistributionMode === 'amount') {
                    value = parseFloat(distributionValue.toFixed(2));
                } else if (this.tpDistributionMode === 'lots') {
                    value = parseFloat(distributionValue.toFixed(2));
                }
                
                this.tpTargets.push({ 
                    id: i, 
                    price: parseFloat(price.toFixed(5)), 
                    percentage: value  // Renamed from percentage but stores the distribution value
                });
            }
        } else {
            // Fallback if no prices set - create empty targets
            let distributionValue;
            if (this.tpDistributionMode === 'percent') {
                distributionValue = 100 / numTargets;
            } else if (this.tpDistributionMode === 'amount') {
                distributionValue = 0;
            } else if (this.tpDistributionMode === 'lots') {
                distributionValue = quantity / numTargets;
            }
            
            for (let i = 1; i <= numTargets; i++) {
                this.tpTargets.push({ 
                    id: i, 
                    price: 0, 
                    percentage: parseFloat(distributionValue.toFixed(this.tpDistributionMode === 'percent' ? 1 : 2))
                });
            }
        }
        
        this.renderTPTargets();
        this.updatePreviewLines();
    }
    
    /**
     * Add a new TP target (deprecated - now using auto-calculate)
     */
    addTPTarget() {
        // Increment number of targets and recalculate
        const numInput = document.getElementById('numTPTargets');
        if (numInput) {
            const currentNum = parseInt(numInput.value || 2);
            if (currentNum < 10) {
                numInput.value = currentNum + 1;
                this.calculateTPTargetsFromNumber(currentNum + 1);
            }
        }
    }
    
    /**
     * Remove a TP target (deprecated - now using auto-calculate)
     */
    removeTPTarget(id) {
        // Decrement number of targets and recalculate
        const numInput = document.getElementById('numTPTargets');
        if (numInput && this.tpTargets && this.tpTargets.length > 2) {
            numInput.value = this.tpTargets.length - 1;
            this.calculateTPTargetsFromNumber(this.tpTargets.length - 1);
        }
    }
    
    /**
     * Adjust TP distribution value with +/- buttons (works for percent, amount, and lots modes)
     */
    adjustTPPercentage(targetIndex, change) {
        if (!this.tpTargets || targetIndex < 0 || targetIndex >= this.tpTargets.length) return;
        
        const numTargets = this.tpTargets.length;
        if (numTargets <= 1) return; // Need at least 2 TPs to adjust
        
        // Get current value
        let currentValue = this.tpTargets[targetIndex].percentage;
        let newValue = currentValue + change;
        
        // Apply mode-specific limits
        if (this.tpDistributionMode === 'percent') {
            newValue = Math.max(5, Math.min(90, newValue));
        } else if (this.tpDistributionMode === 'amount') {
            newValue = Math.max(1, newValue); // Min $1
        } else if (this.tpDistributionMode === 'lots') {
            newValue = Math.max(0.01, newValue); // Min 0.01 lots
        }
        
        // Calculate the actual change
        const actualChange = newValue - currentValue;
        if (Math.abs(actualChange) < 0.01) return; // No significant change
        
        // Update this TP's value
        const precision = this.tpDistributionMode === 'percent' ? 1 : 2;
        this.tpTargets[targetIndex].percentage = parseFloat(newValue.toFixed(precision));
        
        // Redistribute the change among other TPs
        const otherTargets = this.tpTargets.filter((_, idx) => idx !== targetIndex);
        
        if (this.tpDistributionMode === 'percent') {
            // For percent mode: ensure total = 100%
            const remainingValue = 100 - newValue;
            const currentOtherTotal = otherTargets.reduce((sum, t) => sum + t.percentage, 0);
            
            if (currentOtherTotal > 0) {
                otherTargets.forEach((target) => {
                    const proportion = target.percentage / currentOtherTotal;
                    target.percentage = parseFloat((remainingValue * proportion).toFixed(1));
                });
                
                // Fix rounding errors
                const currentTotal = this.tpTargets.reduce((sum, t) => sum + t.percentage, 0);
                const diff = 100 - currentTotal;
                if (Math.abs(diff) > 0.01) {
                    const lastOtherIdx = this.tpTargets.findIndex((t, idx) => idx !== targetIndex && idx === this.tpTargets.length - 1);
                    if (lastOtherIdx >= 0) {
                        this.tpTargets[lastOtherIdx].percentage += diff;
                        this.tpTargets[lastOtherIdx].percentage = parseFloat(this.tpTargets[lastOtherIdx].percentage.toFixed(1));
                    }
                }
            }
        } else {
            // For amount/lots mode: redistribute evenly among others
            const currentOtherTotal = otherTargets.reduce((sum, t) => sum + t.percentage, 0);
            const changePerOther = -actualChange / otherTargets.length;
            
            otherTargets.forEach((target) => {
                target.percentage = Math.max(
                    this.tpDistributionMode === 'amount' ? 1 : 0.01,
                    parseFloat((target.percentage + changePerOther).toFixed(precision))
                );
            });
        }
        
        // Update all input fields in the order panel
        this.tpTargets.forEach(target => {
            const pctInput = document.getElementById(`tpTarget${target.id}Pct`);
            if (pctInput) {
                pctInput.value = target.percentage.toFixed(precision);
            }
        });
        
        // Recalculate profit with new values
        this.calculateAdvancedRiskReward();
        
        // Update preview lines on chart to show new values
        this.updatePreviewLines();
        
        // Re-render the order panel to update validation and totals
        this.renderTPTargets();
        
        const unit = this.tpDistributionMode === 'percent' ? '%' : this.tpDistributionMode === 'amount' ? '$' : ' lots';
        console.log(`📊 Adjusted TP${targetIndex + 1}: ${currentValue.toFixed(precision)}${unit} → ${newValue.toFixed(precision)}${unit}`);
    }
    
    /**
     * Validate multiple TP targets
     */
    validateTPTargets() {
        if (!this.tpTargets || this.tpTargets.length === 0) return [];
        
        const errors = [];
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        
        if (!entryPrice || entryPrice <= 0) {
            return ['⚠️ Set entry price first'];
        }
        
        // Check total based on distribution mode
        const totalValue = this.tpTargets.reduce((sum, t) => sum + (t.percentage || 0), 0);
        
        if (this.tpDistributionMode === 'percent') {
            if (Math.abs(totalValue - 100) > 0.1) {
                errors.push(`⚠️ TP percentages must sum to 100% (currently ${totalValue.toFixed(1)}%)`);
            }
        } else if (this.tpDistributionMode === 'amount') {
            // Validate that total amount is reasonable (positive)
            if (totalValue <= 0) {
                errors.push(`⚠️ Total TP amount must be positive (currently $${totalValue.toFixed(2)})`);
            }
        } else if (this.tpDistributionMode === 'lots') {
            const totalQuantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
            if (Math.abs(totalValue - totalQuantity) > 0.01) {
                errors.push(`⚠️ TP lots must sum to position size (${totalQuantity.toFixed(2)} lots, currently ${totalValue.toFixed(2)} lots)`);
            }
        }
        
        // Validate each target
        this.tpTargets.forEach((target, index) => {
            // Check if price is set
            if (!target.price || target.price <= 0) {
                errors.push(`⚠️ TP #${index + 1}: Price must be set`);
                return;
            }
            
            // Check direction (BUY: TP > Entry, SELL: TP < Entry)
            if (this.orderSide === 'BUY') {
                if (target.price <= entryPrice) {
                    errors.push(`⚠️ TP #${index + 1}: Must be ABOVE entry (${entryPrice.toFixed(5)})`);
                }
            } else {
                if (target.price >= entryPrice) {
                    errors.push(`⚠️ TP #${index + 1}: Must be BELOW entry (${entryPrice.toFixed(5)})`);
                }
            }
            
            // Check distribution value is valid based on mode
            if (this.tpDistributionMode === 'percent') {
                if (!target.percentage || target.percentage <= 0 || target.percentage > 100) {
                    errors.push(`⚠️ TP #${index + 1}: Percentage must be between 1-100%`);
                }
            } else if (this.tpDistributionMode === 'amount') {
                if (!target.percentage || target.percentage <= 0) {
                    errors.push(`⚠️ TP #${index + 1}: Amount must be positive`);
                }
            } else if (this.tpDistributionMode === 'lots') {
                if (!target.percentage || target.percentage <= 0) {
                    errors.push(`⚠️ TP #${index + 1}: Lot size must be positive`);
                }
            }
        });
        
        // Check TP ordering (should be progressive)
        const sortedTargets = [...this.tpTargets].sort((a, b) => {
            if (this.orderSide === 'BUY') {
                return a.price - b.price; // Ascending for BUY
            } else {
                return b.price - a.price; // Descending for SELL
            }
        });
        
        // Warn if TPs are not in progressive order
        let isOrdered = true;
        for (let i = 0; i < this.tpTargets.length; i++) {
            if (this.tpTargets[i].price !== sortedTargets[i].price) {
                isOrdered = false;
                break;
            }
        }
        
        if (!isOrdered) {
            errors.push('⚠️ TP targets should be in progressive order from entry');
        }
        
        return errors;
    }
    
    /**
     * Render TP targets in UI
     */
    renderTPTargets() {
        const list = document.getElementById('multipleTPList');
        if (!list || !this.tpTargets) return;
        
        // Validate and show errors
        const errors = this.validateTPTargets();
        const hasErrors = errors.length > 0;
        
        // Determine suffix based on distribution mode
        let suffix, unitLabel;
        if (this.tpDistributionMode === 'percent') {
            suffix = '%';
            unitLabel = 'Percent';
        } else if (this.tpDistributionMode === 'amount') {
            suffix = '$';
            unitLabel = 'Amount';
        } else if (this.tpDistributionMode === 'lots') {
            suffix = 'Lots';
            unitLabel = 'Lots';
        }
        
        list.innerHTML = this.tpTargets.map(target => `
            <div class="tp-target-row" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
                <div style="flex: 1;">
                    <input type="number" 
                           id="tpTarget${target.id}Price" 
                           value="${target.price}" 
                           step="0.00001" 
                           placeholder="Price"
                           class="order-input order-input--compact" 
                           style="padding: 6px 8px; font-size: 11px;">
                </div>
                <div style="width: 90px; position: relative;">
                    <input type="number" 
                           id="tpTarget${target.id}Pct" 
                           value="${target.percentage}" 
                           min="0.01" 
                           step="${this.tpDistributionMode === 'percent' ? '1' : '0.01'}"
                           class="order-input order-input--compact" 
                           style="padding: 6px 24px 6px 8px; font-size: 11px; text-align: left;">
                    <span style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); font-size: 10px; color: #787b86; pointer-events: none;">${suffix}</span>
                </div>
                <button onclick="chart.orderManager.removeTPTarget(${target.id})" 
                        style="padding: 4px 8px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; color: #ef4444; font-size: 12px; cursor: pointer;">
                    ×
                </button>
            </div>
        `).join('');
        
        // Show validation errors if any
        if (hasErrors) {
            const errorHTML = `
                <div style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 4px; padding: 8px; margin-top: 8px;">
                    ${errors.map(err => `
                        <div style="color: #ef4444; font-size: 11px; margin-bottom: 4px;">
                            ${err}
                        </div>
                    `).join('')}
                </div>
            `;
            list.innerHTML += errorHTML;
        }
        
        // Show total based on distribution mode
        const totalValue = this.tpTargets.reduce((sum, t) => sum + (t.percentage || 0), 0);
        
        let totalText, totalColor, isValid, targetValue;
        if (this.tpDistributionMode === 'percent') {
            targetValue = 100;
            isValid = Math.abs(totalValue - 100) < 0.1;
            totalColor = isValid ? '#22c55e' : '#ef4444';
            totalText = `${totalValue.toFixed(1)}%`;
        } else if (this.tpDistributionMode === 'amount') {
            // Get expected total reward
            const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
            const originalTP = parseFloat(document.getElementById('tpPrice')?.value || 0);
            const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
            const priceDiff = this.orderSide === 'BUY' ? (originalTP - entryPrice) : (entryPrice - originalTP);
            const pipsMove = priceDiff / this.pipSize;
            targetValue = pipsMove * quantity * this.pipValuePerLot;
            isValid = Math.abs(totalValue - targetValue) < 1;
            totalColor = isValid ? '#22c55e' : '#ef4444';
            totalText = `$${totalValue.toFixed(2)}`;
        } else if (this.tpDistributionMode === 'lots') {
            targetValue = parseFloat(document.getElementById('orderQuantity')?.value || 1);
            isValid = Math.abs(totalValue - targetValue) < 0.01;
            totalColor = isValid ? '#22c55e' : '#ef4444';
            totalText = `${totalValue.toFixed(2)} Lots`;
        }
        
        const totalHTML = `
            <div style="text-align: center; margin-top: 8px; padding: 4px; background: rgba(255,255,255,0.05); border-radius: 4px;">
                <span style="font-size: 10px; color: #787b86;">Total: </span>
                <span style="font-size: 11px; color: ${totalColor}; font-weight: 600;">${totalText}</span>
                ${isValid ? ' ✓' : ' ⚠️'}
            </div>
        `;
        list.innerHTML += totalHTML;
        
        // Add input listeners
        this.tpTargets.forEach(target => {
            const priceInput = document.getElementById(`tpTarget${target.id}Price`);
            const pctInput = document.getElementById(`tpTarget${target.id}Pct`);
            
            if (priceInput) {
                priceInput.oninput = () => {
                    target.price = parseFloat(priceInput.value) || 0;
                    // Re-render to update validation
                    this.renderTPTargets();
                    // Update preview lines on chart in real-time
                    this.updatePreviewLines();
                };
            }
            
            if (pctInput) {
                pctInput.oninput = () => {
                    target.percentage = parseFloat(pctInput.value) || 0;
                    // Re-render to update validation and percentage total
                    this.renderTPTargets();
                    // Update preview lines on chart in real-time
                    this.updatePreviewLines();
                };
            }
        });
    }
    
    /**
     * Update entry price in panel
     */
    updateOrderPanelPrice() {
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) return;
        
        const priceInput = document.getElementById('orderEntryPrice');
        if (priceInput) {
            priceInput.value = currentCandle.c.toFixed(5);
        }
        
        // Set default TP and SL aligned with entry
        this.syncDefaultTargetsToEntry();
        
        // Calculate position size and risk/reward
        this.calculatePositionFromRisk();
        this.calculateAdvancedRiskReward();
    }

    /**
     * Ensure TP/SL default to entry when not manually positioned
     */
    syncDefaultTargetsToEntry() {
        const entryInput = document.getElementById('orderEntryPrice');
        if (!entryInput) return;

        const entryPrice = parseFloat(entryInput.value || '0');
        if (!entryPrice || entryPrice <= 0) return;

        const tpPriceInput = document.getElementById('tpPrice');
        const slPriceInput = document.getElementById('slPrice');

        const precision = this.getPricePrecision(entryPrice);
        const entryFormatted = entryPrice.toFixed(precision);

        const side = (this.orderSide || 'BUY').toUpperCase();
        const pipSize = this.pipSize || 0.0001;
        const defaultSteps = 10;
        const offset = pipSize * defaultSteps;
        const tpDefault = side === 'SELL' ? (entryPrice - offset) : (entryPrice + offset);
        const slDefault = side === 'SELL' ? (entryPrice + offset) : (entryPrice - offset);
        const tpFormatted = tpDefault.toFixed(precision);
        const slFormatted = slDefault.toFixed(precision);

        // TP syncing: sync to sensible default if NOT manually positioned
        if (tpPriceInput && !this.tpManuallyPositioned) {
            const existing = String(tpPriceInput.value || '').trim();
            if (!existing || existing === entryFormatted) {
                tpPriceInput.value = tpFormatted;
            }
        }

        // SL syncing: sync to sensible default if NOT manually positioned
        if (slPriceInput && !this.slManuallyPositioned) {
            const existing = String(slPriceInput.value || '').trim();
            if (!existing || existing === entryFormatted) {
                slPriceInput.value = slFormatted;
            }
        }
    }
    
    /**
     * Calculate risk/reward
     * NOTE: This function appears to be UNUSED in favor of calculateAdvancedRiskReward()
     * Keeping for backwards compatibility but marking as deprecated
     * @deprecated Use calculateAdvancedRiskReward() instead
     */
    calculateRiskReward() {
        // Redirect to the main calculation function
        this.calculateAdvancedRiskReward();
    }
    
    /**
     * Update positions of existing preview lines when chart moves (pan/zoom)
     * This function efficiently updates Y-positions without full redraw
     */
    updatePreviewLinePositions() {
        if (!this.chart || !this.chart.scales || !this.previewLines) {
            return;
        }
        
        // Update entry line position
        if (this.previewLines.entry) {
            const entryY = this.chart.scales.yScale(this.previewLines.entry.price);
            
            // Update line if it exists
            if (this.previewLines.entry.line) {
                this.previewLines.entry.line
                    .attr('y1', entryY)
                    .attr('y2', entryY)
                    .attr('x2', this.chart.w);
            }
            
            // Update label position
            if (this.previewLines.entry.labelGroup) {
                const bbox = this.previewLines.entry.labelDimensions;
                const height = bbox?.height || 0;
                const currentTransform = this.previewLines.entry.labelGroup.attr('transform');
                const currentX = parseFloat(currentTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                this.previewLines.entry.labelGroup.attr('transform', `translate(${currentX}, ${entryY - height / 2})`);
            }
            
            // Update Y-axis highlight (it's a group element)
            if (this.previewLines.entry.yAxisHighlight) {
                const height = 22;
                const width = parseFloat(this.previewLines.entry.yAxisHighlight.select('rect').attr('width')) || 55;
                const x = this.chart.w - width - 2;
                const y = entryY - height / 2;
                this.previewLines.entry.yAxisHighlight.attr('transform', `translate(${x}, ${y})`);
            }
        }
        
        // Update TP line/badge position (works for both badges and full lines)
        if (this.previewLines.tp && this.previewLines.tp.price) {
            const tpY = this.chart.scales.yScale(this.previewLines.tp.price);
            
            // Update line if it exists (full line mode)
            if (this.previewLines.tp.line) {
                this.previewLines.tp.line
                    .attr('y1', tpY)
                    .attr('y2', tpY)
                    .attr('x2', this.chart.w);
            }
            
            // Update label/badge position (works for both badge and full line)
            if (this.previewLines.tp.labelGroup) {
                const bbox = this.previewLines.tp.labelDimensions;
                const height = bbox?.height || 0;
                const currentTransform = this.previewLines.tp.labelGroup.attr('transform');
                const currentX = parseFloat(currentTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                this.previewLines.tp.labelGroup.attr('transform', `translate(${currentX}, ${tpY - height / 2})`);
            }
        }
        
        // Update SL line/badge position (works for both badges and full lines)
        if (this.previewLines.sl && this.previewLines.sl.price) {
            const slY = this.chart.scales.yScale(this.previewLines.sl.price);
            
            // Update line if it exists (full line mode)
            if (this.previewLines.sl.line) {
                this.previewLines.sl.line
                    .attr('y1', slY)
                    .attr('y2', slY)
                    .attr('x2', this.chart.w);
            }
            
            // Update label/badge position (works for both badge and full line)
            if (this.previewLines.sl.labelGroup) {
                const bbox = this.previewLines.sl.labelDimensions;
                const height = bbox?.height || 0;
                const currentTransform = this.previewLines.sl.labelGroup.attr('transform');
                const currentX = parseFloat(currentTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                this.previewLines.sl.labelGroup.attr('transform', `translate(${currentX}, ${slY - height / 2})`);
            }
        }
        
        // Update multiple TP lines positions
        if (this.previewLines.multipleTPs && Array.isArray(this.previewLines.multipleTPs)) {
            this.previewLines.multipleTPs.forEach(tpLine => {
                if (tpLine && tpLine.price) {
                    const tpY = this.chart.scales.yScale(tpLine.price);
                    
                    // Update line
                    if (tpLine.line) {
                        tpLine.line
                            .attr('y1', tpY)
                            .attr('y2', tpY)
                            .attr('x2', this.chart.w);
                    }
                    
                    // Update label position
                    if (tpLine.labelGroup) {
                        const bbox = tpLine.labelDimensions;
                        const height = bbox?.height || 0;
                        const currentTransform = tpLine.labelGroup.attr('transform');
                        const currentX = parseFloat(currentTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                        tpLine.labelGroup.attr('transform', `translate(${currentX}, ${tpY - height / 2})`);
                    }
                }
            });
        }
        
        // Update BE (Breakeven) line position
        if (this.previewLines.be && this.previewLines.be.price) {
            const beY = this.chart.scales.yScale(this.previewLines.be.price);
            
            // Update line if it exists
            if (this.previewLines.be.line) {
                this.previewLines.be.line
                    .attr('y1', beY)
                    .attr('y2', beY)
                    .attr('x2', this.chart.w);
            }
            
            // Update label position
            if (this.previewLines.be.labelGroup) {
                const bbox = this.previewLines.be.labelDimensions;
                const height = bbox?.height || 0;
                const currentTransform = this.previewLines.be.labelGroup.attr('transform');
                const currentX = parseFloat(currentTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                this.previewLines.be.labelGroup.attr('transform', `translate(${currentX}, ${beY - height / 2})`);
            }
        }
    }

    updatePreviewLines() {
        if (!this.chart || !this.chart.svg || !this.chart.scales) {
            return;
        }
        
        // Don't redraw if currently dragging a preview line (prevents interruption)
        if (this.isDraggingPreviewLine) {
            console.log(`⏸️ Skipping updatePreviewLines() - currently dragging`);
            return;
        }
        
        // Log current orderQuantity value before update
        const currentQty = document.getElementById('orderQuantity')?.value;
        console.log(`🔄 updatePreviewLines() called - current orderQuantity in DOM: ${currentQty}`);
        
        // Remove existing preview lines first
        this.removePreviewLines();

        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        const tpEnabled = document.getElementById('enableTP')?.checked;
        const slEnabled = document.getElementById('enableSL')?.checked;

        if (!entryPrice || entryPrice <= 0) return;

        // Ensure TP/SL defaults are available when enabled
        this.syncDefaultTargetsToEntry();

        this.previewLines = {
            entry: null,
            tp: null,
            sl: null,
            be: null, // Breakeven trigger line
            multipleTPs: [], // Array for multiple TP lines
            splitEntries: [] // Array for split entry lines
        };
        
        // Track if TP/SL have been manually positioned (dragged away from entry)
        if (!this.tpManuallyPositioned) this.tpManuallyPositioned = false;
        if (!this.slManuallyPositioned) this.slManuallyPositioned = false;
        
        // Calculate TP/SL prices (same logic as in placeAdvancedOrder)
        let tpPrice = 0;
        let slPrice = 0;
        
        // Get quantity for USD calculations
        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
        
        if (tpEnabled) {
            const tpPriceInput = parseFloat(document.getElementById('tpPrice')?.value || 0);
            
            if (tpPriceInput > 0) {
                tpPrice = tpPriceInput;
            }
        }
        
        if (slEnabled) {
            const slPriceInput = parseFloat(document.getElementById('slPrice')?.value || 0);
            
            if (slPriceInput > 0) {
                slPrice = slPriceInput;
            }
        }
        
        // Draw entry price preview line (dashed blue/red) - now draggable!
        const entryColor = this.orderSide === 'BUY' ? '#2962ff' : '#f23645';
        const mainEntryPercent = this.getMainEntryPercentage();
        const mainEntryLabel = this.splitEntriesEnabled ? `Entry (${mainEntryPercent}%)` : 'Entry';
        this.previewLines.entry = this.drawPreviewLine(entryPrice, entryColor, mainEntryLabel, this.orderSide, true);
        
        // Draw split entry lines if any
        if (this.splitEntries && this.splitEntries.length > 0) {
            this.splitEntries.forEach((splitEntry, index) => {
                if (splitEntry.price > 0) {
                    // Use a lighter shade of the entry color for splits
                    const splitColor = this.orderSide === 'BUY' ? '#5b8def' : '#f5787f';
                    
                    // Get order type for this split entry (may differ from main entry)
                    const splitOrderType = splitEntry.orderType || this.orderType;
                    const typeLabel = splitOrderType.toUpperCase();
                    const splitLabel = `${typeLabel} ${this.orderSide}`;
                    
                    const splitLine = this.drawSplitEntryLine(splitEntry.price, splitColor, splitLabel, splitEntry.id, index);
                    if (splitLine) {
                        splitEntry.lineData = splitLine;
                        splitLine.orderType = splitOrderType; // Store order type on line data
                        this.previewLines.splitEntries.push(splitLine);
                    }
                }
            });
        }
        
        // Check if multiple TPs are enabled
        const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked || false;
        
        if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
            // Draw multiple TP lines
            this.tpTargets.forEach((target, index) => {
                if (target.price > 0) {
                    // Color gradient from light green to dark green
                    const greenIntensity = 0.6 + (index / this.tpTargets.length) * 0.4;
                    const color = `rgba(34, 197, 94, ${greenIntensity})`;
                    const label = `TP${index + 1}`;
                    
                    // Format label based on distribution mode
                    let fullLabel;
                    if (this.tpDistributionMode === 'percent') {
                        fullLabel = `TP${index + 1} (${target.percentage.toFixed(0)}%)`;
                    } else if (this.tpDistributionMode === 'amount') {
                        fullLabel = `TP${index + 1} ($${target.percentage.toFixed(0)})`;
                    } else if (this.tpDistributionMode === 'lots') {
                        fullLabel = `TP${index + 1} (${target.percentage.toFixed(2)} lots)`;
                    }
                    
                    const tpLine = this.drawPreviewLine(target.price, color, fullLabel, null, true, index, target.id);
                    if (tpLine) {
                        this.previewLines.multipleTPs.push(tpLine);
                    }
                }
            });
        } else {
            // Draw single TP preview line (green, dashed) - ONLY if manually positioned
            if (tpEnabled && this.tpManuallyPositioned && tpPrice > 0) {
                this.previewLines.tp = this.drawPreviewLine(tpPrice, '#22c55e', 'TP', null, true);
                if (this.previewLines.tp) {
                    this.previewLines.tp.targetPrice = tpPrice;
                }
            } else if (tpEnabled && !this.tpManuallyPositioned) {
                // Draw draggable badge at entry for TP
                this.previewLines.tp = this.drawPreviewBadge(entryPrice, '#22c55e', 'TP', tpPrice);
            }
        }
        
        // Draw SL preview line (red, dashed) - ONLY if manually positioned
        if (slEnabled && this.slManuallyPositioned && slPrice > 0) {
            this.previewLines.sl = this.drawPreviewLine(slPrice, '#f23645', 'SL', null, true);
            if (this.previewLines.sl) {
                this.previewLines.sl.targetPrice = slPrice;
            }
        } else if (slEnabled && !this.slManuallyPositioned) {
            // Draw draggable badge at entry for SL
            this.previewLines.sl = this.drawPreviewBadge(entryPrice, '#f23645', 'SL', slPrice);
        }
        
        // Draw Breakeven trigger line if enabled
        const beEnabled = document.getElementById('autoBreakevenToggle')?.checked;
        if (beEnabled && slEnabled && slPrice > 0) {
            const beMode = this.breakevenMode || 'pips';
            let beValue = beMode === 'pips' 
                ? parseFloat(document.getElementById('breakevenPips')?.value || 10)
                : parseFloat(document.getElementById('breakevenAmount')?.value || 50);
            
            // Calculate BE trigger price
            let beTriggerPrice = 0;
            
            // Auto-position BE between Entry and TP only on first enable (when not manually positioned)
            if (!this.beManuallyPositioned && tpEnabled && tpPrice > 0) {
                const tpDistance = Math.abs(tpPrice - entryPrice);
                const beDistance = tpDistance * 0.5; // 50% of the way to TP
                
                beTriggerPrice = this.orderSide === 'BUY' 
                    ? entryPrice + beDistance 
                    : entryPrice - beDistance;
                
                // Update the input value to match this position
                const bePips = Math.round(beDistance / this.pipSize);
                const pipsInput = document.getElementById('breakevenPips');
                if (pipsInput && beMode === 'pips') {
                    pipsInput.value = bePips;
                    beValue = bePips;
                }
                if (beMode === 'amount') {
                    const beAmount = bePips * quantity * this.pipValuePerLot;
                    const amountInput = document.getElementById('breakevenAmount');
                    if (amountInput) {
                        amountInput.value = Math.round(beAmount);
                        beValue = Math.round(beAmount);
                    }
                }
                
                // Mark as initialized so we don't keep resetting it
                this.beManuallyPositioned = true;
            } else if (beMode === 'pips') {
                // Pips mode - use current input value
                const profitPrice = beValue * this.pipSize;
                beTriggerPrice = this.orderSide === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            } else {
                // Amount mode - use current input value
                const profitPips = beValue / (quantity * this.pipValuePerLot);
                const profitPrice = profitPips * this.pipSize;
                beTriggerPrice = this.orderSide === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            }
            
            // Draw orange dashed BE line (draggable)
            const beLabel = beMode === 'pips' ? `BE @ ${beValue}p` : `BE @ $${beValue}`;
            this.previewLines.be = this.drawPreviewLine(beTriggerPrice, '#f59e0b', beLabel, null, true);
            if (this.previewLines.be) {
                this.previewLines.be.targetPrice = beTriggerPrice;
                this.previewLines.be.isBELine = true; // Mark as BE line
                
                // Make BE line more visible with distinct styling
                this.previewLines.be.line
                    .attr('stroke-width', 2.5)
                    .attr('stroke-dasharray', '6,3')
                    .attr('opacity', 0.9);
            }
        }
    }

    drawPreviewLine(price, color, label, direction = null, isDraggable = false, targetIndex = undefined, targetId = undefined) {
        const y = this.chart.scales.yScale(price);

        const line = this.chart.svg.append('line')
            .attr('class', 'preview-line')
            .attr('x1', 0)
            .attr('x2', this.chart.w)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', color)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '8,4')
            .attr('opacity', 0.7)
            .style('pointer-events', isDraggable ? 'all' : 'none')
            .style('cursor', isDraggable ? 'ns-resize' : 'default');

        const labelGroup = this.chart.svg.append('g')
            .attr('class', 'preview-label-group')
            .style('pointer-events', isDraggable ? 'all' : 'none')
            .style('cursor', isDraggable ? 'ns-resize' : 'default');

        const lineData = {
            line,
            labelGroup,
            price,
            label,
            color,
            direction,
            priceText: null,
            labelDimensions: { width: 0, height: 0 },
            yAxisHighlight: null,
            targetIndex: targetIndex,  // Add targetIndex for multiple TPs
            targetId: targetId          // Add targetId for multiple TPs
        };

        this.renderPreviewLabel(lineData, y);
        this.adjustPreviewLineForLabel(lineData);
        
        // Add Y-axis price highlight for all order lines (Entry, TP, SL, BE, etc.)
        lineData.yAxisHighlight = this.drawYAxisPriceHighlight(price, color, label, 0);

        if (isDraggable) {
            this.makePreviewLineDraggable(lineData);
        }

        this.scheduleAlignPreviewLabels();
        return lineData;
    }

    makePreviewLineDraggable(lineData) {
        const self = this;
        let isDragging = false;
        let dragStartTime = 0;
        let frameId = null;
        
        // Throttle helper for calculations - limits execution to once per frame
        const throttledCalculate = (fn) => {
            if (frameId) return;
            frameId = requestAnimationFrame(() => {
                fn();
                frameId = null;
            });
        };

        const drag = d3.drag()
            .on('start', () => {
                isDragging = true;
                dragStartTime = Date.now();
                lineData.line.attr('opacity', 1);
                
                // Set flag to prevent full redraw during drag
                self.isDraggingPreviewLine = true;
                
                // Store initial values for comparison
                lineData.dragStartPrice = lineData.price;
                
                // Create R:R indicator on Entry line for live feedback
                if (lineData.label === 'Entry' && !lineData.rrIndicator) {
                    lineData.rrIndicator = lineData.labelGroup.append('text')
                        .attr('class', 'rr-indicator')
                        .attr('fill', '#60a5fa')
                        .attr('font-size', '11px')
                        .attr('font-weight', '700')
                        .attr('text-anchor', 'start');
                }
                
                // Force immediate calculation on drag start to ensure indicators are ready
                self.calculateAdvancedRiskReward();
            })
            .on('drag', event => {
                if (!isDragging || !self.chart?.scales?.yScale) return;

                const chartHeightRaw = self.chart.h ?? self.chart.height ?? self.chart.svg?.attr('height') ?? 0;
                const chartHeight = Number(chartHeightRaw) || 0;
                const clampedY = Math.max(0, Math.min(chartHeight, event.y));
                const newPrice = self.chart.scales.yScale.invert(clampedY);

                lineData.price = newPrice;
                lineData.line.attr('y1', clampedY).attr('y2', clampedY);
                
                // Update price text without full re-render for performance
                const formattedPrice = self.formatPrice(newPrice);
                if (lineData.priceText) {
                    lineData.priceText.text(formattedPrice);
                }
                
                // Calculate and display pip distance in real-time
                const pipDistance = Math.abs(newPrice - (lineData.dragStartPrice || newPrice)) / self.pipSize;
                if (pipDistance > 0.1) {
                    // Show pip indicator on the line
                    if (!lineData.pipIndicator) {
                        lineData.pipIndicator = lineData.labelGroup.append('text')
                            .attr('class', 'pip-distance-indicator')
                            .attr('fill', '#fbbf24')
                            .attr('font-size', '10px')
                            .attr('font-weight', '600')
                            .attr('text-anchor', 'middle');
                    }
                    lineData.pipIndicator
                        .attr('y', -25)
                        .attr('x', 0)
                        .text(`${pipDistance.toFixed(1)} pips`);
                } else if (lineData.pipIndicator) {
                    lineData.pipIndicator.remove();
                    lineData.pipIndicator = null;
                }
                
                // Update label Y position without recalculating X (prevents horizontal jumping)
                const bbox = lineData.labelDimensions;
                const height = bbox?.height || 0;
                const currentTransform = lineData.labelGroup.attr('transform');
                const currentX = parseFloat(currentTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                const translateY = clampedY - height / 2;
                lineData.labelGroup.attr('transform', `translate(${currentX}, ${translateY})`);
                self.adjustPreviewLineForLabel(lineData);
                
                // Update Y-axis price highlight for ALL lines (Entry, TP, SL, BE, etc.)
                if (lineData.yAxisHighlight) {
                    const highlightHeight = 22;
                    const highlightY = clampedY - highlightHeight / 2;
                    const highlightX = parseFloat(lineData.yAxisHighlight.attr('transform').match(/translate\(([\d.]+)/)?.[1] || 0);
                    lineData.yAxisHighlight.attr('transform', `translate(${highlightX}, ${highlightY})`);
                    lineData.yAxisHighlight.select('.y-axis-price-text').text(formattedPrice);
                }
                
                if (lineData.label === 'TP') {
                    // Mark TP as manually positioned BEFORE updating input (prevents sync)
                    self.tpManuallyPositioned = true;
                    const tpInput = document.getElementById('tpPrice');
                    if (tpInput) {
                        tpInput.value = formattedPrice;
                    }
                    
                    // Calculate TP pips/amount and R:R immediately
                    const entryPrice = self.previewLines.entry?.price || parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                    const slPrice = self.previewLines.sl?.price || parseFloat(document.getElementById('slPrice')?.value || 0);
                    const enableSL = document.getElementById('enableSL')?.checked;
                    
                    if (entryPrice > 0 && newPrice !== entryPrice) {
                        const rewardDistance = Math.abs(newPrice - entryPrice);
                        const rewardPips = rewardDistance / self.pipSize;
                        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
                        const rewardAmount = rewardPips * quantity * self.pipValuePerLot;
                        
                        // Update TP display
                        const tpPipsDisplay = document.getElementById('tpPipsDisplay');
                        const tpAmountDisplay = document.getElementById('tpAmountDisplay');
                        if (tpPipsDisplay) tpPipsDisplay.textContent = `${rewardPips.toFixed(1)} pips`;
                        if (tpAmountDisplay) tpAmountDisplay.textContent = `$${rewardAmount.toFixed(2)}`;
                        
                        // Calculate R:R if SL is set
                        if (enableSL && slPrice > 0 && slPrice !== entryPrice) {
                            const riskDistance = Math.abs(slPrice - entryPrice);
                            const rr = rewardDistance / riskDistance;
                            const rrDisplay = document.getElementById('rrDisplay');
                            if (rrDisplay) rrDisplay.textContent = `${rr.toFixed(2)}R`;
                        }
                    }
                } else if (lineData.label && lineData.label.startsWith('TP') && lineData.targetIndex !== undefined) {
                    // Handle multiple TP line drag
                    if (self.tpTargets && self.tpTargets[lineData.targetIndex]) {
                        // Only update price, keep percentage unchanged
                        self.tpTargets[lineData.targetIndex].price = parseFloat(newPrice.toFixed(5));
                        
                        // Ensure percentages stay equal and sum to 100%
                        const numTargets = self.tpTargets.length;
                        const equalPercentage = 100 / numTargets;
                        self.tpTargets.forEach((target, idx) => {
                            // Use precise rounding to ensure sum equals 100%
                            if (idx === numTargets - 1) {
                                // Last one gets remainder
                                const sumSoFar = equalPercentage * (numTargets - 1);
                                target.percentage = parseFloat((100 - sumSoFar).toFixed(1));
                            } else {
                                target.percentage = parseFloat(equalPercentage.toFixed(1));
                            }
                        });
                        
                        // Update the price input field in the UI
                        const tpInput = document.getElementById(`tpTarget${self.tpTargets[lineData.targetIndex].id}Price`);
                        if (tpInput) {
                            tpInput.value = parseFloat(newPrice.toFixed(5));
                        }
                        
                        // Update the label on the chart to show new percentage
                        const targetNum = lineData.targetIndex + 1;
                        const newPercentage = self.tpTargets[lineData.targetIndex].percentage;
                        const newLabel = `TP${targetNum} (${newPercentage.toFixed(0)}%)`;
                        lineData.label = newLabel;
                        
                        // Update the label text in the badge/line
                        if (lineData.labelGroup) {
                            // Re-render the label with updated percentage
                            self.renderPreviewLabel(lineData, clampedY);
                            self.adjustPreviewLineForLabel(lineData);
                        }
                        
                        // Recalculate risk/reward to update profit display
                        self.calculateAdvancedRiskReward();
                        
                        // Re-render the targets list to update validation and show updated percentages
                        self.renderTPTargets();
                    }
                } else if (lineData.label === 'SL') {
                    // Mark SL as manually positioned BEFORE updating input (prevents sync)
                    self.slManuallyPositioned = true;
                    const slInput = document.getElementById('slPrice');
                    if (slInput) {
                        slInput.value = formattedPrice;
                    }
                    
                    // Calculate SL pips/amount and R:R immediately
                    const entryPrice = self.previewLines.entry?.price || parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                    const enableSL = document.getElementById('enableSL')?.checked;
                    
                    if (enableSL && entryPrice > 0 && newPrice !== entryPrice) {
                        const riskDistance = Math.abs(newPrice - entryPrice);
                        const riskPips = riskDistance / self.pipSize;
                        
                        // Update SL pips display
                        const slPipsDisplay = document.getElementById('slPipsDisplay');
                        if (slPipsDisplay) slPipsDisplay.textContent = `${riskPips.toFixed(1)} pips`;
                        
                        // Calculate R:R if TP is set
                        const tpPrice = self.previewLines.tp?.price || parseFloat(document.getElementById('tpPrice')?.value || 0);
                        const enableTP = document.getElementById('enableTP')?.checked;
                        if (enableTP && tpPrice > 0 && tpPrice !== entryPrice) {
                            const rewardDistance = Math.abs(tpPrice - entryPrice);
                            const rr = rewardDistance / riskDistance;
                            const rrDisplay = document.getElementById('rrDisplay');
                            if (rrDisplay) rrDisplay.textContent = `${rr.toFixed(2)}R`;
                        }
                        
                        // Calculate lot size and update displays
                        if ((self.positionSizeMode === 'risk-usd' || self.positionSizeMode === 'risk-percent') && riskPips > 0) {
                            let riskAmount;
                            if (self.positionSizeMode === 'risk-usd') {
                                riskAmount = parseFloat(document.getElementById('riskAmountUSD')?.value || 50);
                            } else {
                                const riskPercent = parseFloat(document.getElementById('riskAmountPercent')?.value || 1);
                                riskAmount = (self.accountBalance || 100000) * (riskPercent / 100);
                            }
                            
                            const lotSize = riskAmount / (riskPips * self.pipValuePerLot);
                            const roundedLotSize = Math.round(lotSize * 100) / 100;
                            
                            // Update quantity input
                            const quantityInput = document.getElementById('orderQuantity');
                            if (quantityInput) quantityInput.value = roundedLotSize.toFixed(2);
                            
                            // Update calculatedLots display
                            const calculatedLotsDisplay = document.getElementById('calculatedLots');
                            if (calculatedLotsDisplay) calculatedLotsDisplay.textContent = `${roundedLotSize.toFixed(2)} Lots`;
                            
                            // Update SL amount display
                            const slAmountDisplay = document.getElementById('slAmountDisplay');
                            if (slAmountDisplay) slAmountDisplay.textContent = `$${riskAmount.toFixed(2)}`;
                        }
                    }
                } else if (lineData.label && lineData.label.startsWith('BE @')) {
                    // Mark BE as manually positioned
                    self.beManuallyPositioned = true;
                    
                    // BE line drag: Calculate new pips or amount based on new position
                    const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                    const slPrice = parseFloat(document.getElementById('slPrice')?.value || 0);
                    
                    if (entryPrice) {
                        const profit = Math.abs(newPrice - entryPrice);
                        
                        if (self.breakevenMode === 'pips') {
                            // Update Pips value
                            const newPips = profit / self.pipSize;
                            const pipsInput = document.getElementById('breakevenPips');
                            if (pipsInput) {
                                pipsInput.value = Math.round(newPips);
                            }
                            // Update label
                            lineData.label = `BE @ ${Math.round(newPips)}p`;
                        } else {
                            // Update amount value
                            const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
                            const profitPips = profit / self.pipSize;
                            const newAmount = profitPips * quantity * self.pipValuePerLot;
                            const amountInput = document.getElementById('breakevenAmount');
                            if (amountInput) {
                                amountInput.value = newAmount.toFixed(2);
                            }
                            // Update label
                            lineData.label = `BE @ $${newAmount.toFixed(0)}`;
                        }
                        
                        // Re-render the label with updated text
                        self.renderPreviewLabel(lineData, clampedY);
                        self.adjustPreviewLineForLabel(lineData);
                    }
                } else if (lineData.label === 'Entry') {
                    const entryInput = document.getElementById('orderEntryPrice');
                    if (entryInput) {
                        entryInput.value = formattedPrice;
                        // Don't dispatch event here - we'll calculate manually below
                    }
                    
                    // Auto-detect order type based on entry position relative to current price
                    const currentCandle = self.getCurrentCandle();
                    const currentPrice = currentCandle?.c || currentCandle?.close || null;
                    
                    if (currentPrice) {
                        let newOrderType;
                        if (self.orderSide === 'BUY') {
                            // BUY: above price = STOP, below price = LIMIT
                            newOrderType = newPrice > currentPrice ? 'stop' : 'limit';
                        } else {
                            // SELL: below price = STOP, above price = LIMIT
                            newOrderType = newPrice < currentPrice ? 'stop' : 'limit';
                        }
                        
                        // Update order type if changed
                        if (self.orderType !== newOrderType) {
                            const oldType = self.orderType;
                            self.orderType = newOrderType;
                            
                            console.log(`🔄 Auto-detected order type: ${oldType} → ${newOrderType} (Entry: ${newPrice.toFixed(5)}, Current: ${currentPrice.toFixed(5)})`);
                            
                            // Update order type buttons in panel
                            document.querySelectorAll('.order-type-btn').forEach(btn => {
                                if (btn.dataset.type === newOrderType) {
                                    btn.classList.add('active');
                                } else {
                                    btn.classList.remove('active');
                                }
                            });
                            
                            // Update the Place Order button text
                            self.updatePlaceButtonText();
                            
                            // Save current X position before re-rendering
                            const currentTransform = lineData.labelGroup.attr('transform');
                            const savedX = parseFloat(currentTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                            
                            // Re-render entry label to show new type
                            self.renderPreviewLabel(lineData, clampedY);
                            
                            // Restore X position after re-render
                            const newTransform = lineData.labelGroup.attr('transform');
                            const newY = parseFloat(newTransform?.match(/translate\([^,]+,\s*([\d.]+)/)?.[1] || 0);
                            lineData.labelGroup.attr('transform', `translate(${savedX}, ${newY})`);
                        }
                    }
                    
                    // Update TP/SL badge positions if they haven't been manually positioned
                    // Only update Y position during drag to prevent horizontal jumping
                    if (self.previewLines.tp && !self.tpManuallyPositioned && self.previewLines.tp.isBadge) {
                        self.previewLines.tp.price = newPrice;
                        // Update only Y position, preserve X
                        const tpBbox = self.previewLines.tp.labelDimensions;
                        const tpHeight = tpBbox?.height || 0;
                        const tpTransform = self.previewLines.tp.labelGroup.attr('transform');
                        const tpX = parseFloat(tpTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                        const tpY = clampedY - tpHeight / 2;
                        self.previewLines.tp.labelGroup.attr('transform', `translate(${tpX}, ${tpY})`);
                        // Also update the TP input field to match entry
                        const tpInput = document.getElementById('tpPrice');
                        if (tpInput) tpInput.value = formattedPrice;
                    }
                    if (self.previewLines.sl && !self.slManuallyPositioned && self.previewLines.sl.isBadge) {
                        self.previewLines.sl.price = newPrice;
                        // Update only Y position, preserve X
                        const slBbox = self.previewLines.sl.labelDimensions;
                        const slHeight = slBbox?.height || 0;
                        const slTransform = self.previewLines.sl.labelGroup.attr('transform');
                        const slX = parseFloat(slTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                        const slY = clampedY - slHeight / 2;
                        self.previewLines.sl.labelGroup.attr('transform', `translate(${slX}, ${slY})`);
                        // Also update the SL input field to match entry
                        const slInput = document.getElementById('slPrice');
                        if (slInput) slInput.value = formattedPrice;
                    }
                    
                    // Recalculate risk/reward since TP/SL are synced to entry
                    self.calculateAdvancedRiskReward();
                }

                // Only recalculate position size if we're in a risk-based mode AND we have SL enabled
                // For lot-size mode, position doesn't depend on entry price
                if (lineData.label === 'Entry' || lineData.label === 'SL') {
                    const enableSL = document.getElementById('enableSL')?.checked;
                    
                    // Get prices - use the CURRENT drag position for the line being dragged
                    let slPrice = 0;
                    let entryPrice = 0;
                    
                    if (lineData.label === 'SL') {
                        // We're dragging SL - use newPrice for SL, get Entry from preview or input
                        slPrice = newPrice;
                        entryPrice = self.previewLines.entry?.price || parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                    } else {
                        // We're dragging Entry - use newPrice for Entry, get SL from preview or input
                        entryPrice = newPrice;
                        slPrice = self.previewLines.sl?.price || parseFloat(document.getElementById('slPrice')?.value || 0);
                    }
                    
                    // Only recalculate if:
                    // 1. We're in risk-based mode (not lot-size), AND
                    // 2. We have SL enabled and valid prices
                    if ((self.positionSizeMode === 'risk-usd' || self.positionSizeMode === 'risk-percent') && 
                        enableSL && slPrice > 0 && entryPrice > 0 && slPrice !== entryPrice) {
                        
                        // Set flag to prevent updatePreviewLines() during drag
                        const wasDragging = self.isDraggingPreviewLine;
                        self.isDraggingPreviewLine = true;
                        
                        // Calculate lot size directly using current prices
                        const riskPips = Math.abs(entryPrice - slPrice) / self.pipSize;
                        
                        if (riskPips > 0) {
                            let riskAmount;
                            if (self.positionSizeMode === 'risk-usd') {
                                riskAmount = parseFloat(document.getElementById('riskAmountUSD')?.value || 50);
                            } else {
                                const riskPercent = parseFloat(document.getElementById('riskAmountPercent')?.value || 1);
                                riskAmount = (self.accountBalance || 100000) * (riskPercent / 100);
                            }
                            
                            const lotSize = riskAmount / (riskPips * self.pipValuePerLot);
                            const roundedLotSize = Math.round(lotSize * 100) / 100;
                            
                            // Update quantity input
                            const quantityInput = document.getElementById('orderQuantity');
                            if (quantityInput) {
                                quantityInput.value = roundedLotSize.toFixed(2);
                            }
                            
                            // Update the calculatedLots display
                            const calculatedLotsDisplay = document.getElementById('calculatedLots');
                            if (calculatedLotsDisplay) {
                                calculatedLotsDisplay.textContent = `${roundedLotSize.toFixed(2)} Lots`;
                            }
                        }
                        
                        // Restore flag
                        self.isDraggingPreviewLine = wasDragging;
                        
                        // Manually update Entry label to show new lot size
                        if (self.previewLines.entry) {
                            const entryY = self.chart.scales.yScale(self.previewLines.entry.price);
                            self.renderPreviewLabel(self.previewLines.entry, entryY);
                        }
                        
                        // Update SL pips display
                        const slPipsDisplay = document.getElementById('slPipsDisplay');
                        if (slPipsDisplay) slPipsDisplay.textContent = `${riskPips.toFixed(1)} pips`;
                        
                        // Update SL amount display
                        const slAmountDisplay = document.getElementById('slAmountDisplay');
                        if (slAmountDisplay) slAmountDisplay.textContent = `$${riskAmount.toFixed(2)}`;
                    }
                    
                    // Also update TP calculations when Entry is dragged
                    if (lineData.label === 'Entry') {
                        const tpPrice = self.previewLines.tp?.price || parseFloat(document.getElementById('tpPrice')?.value || 0);
                        const enableTP = document.getElementById('enableTP')?.checked;
                        const enableSL = document.getElementById('enableSL')?.checked;
                        const slPrice = self.previewLines.sl?.price || parseFloat(document.getElementById('slPrice')?.value || 0);
                        
                        if (enableTP && tpPrice > 0 && tpPrice !== newPrice) {
                            const rewardDistance = Math.abs(tpPrice - newPrice);
                            const rewardPips = rewardDistance / self.pipSize;
                            const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
                            const rewardAmount = rewardPips * quantity * self.pipValuePerLot;
                            
                            // Update TP display
                            const tpPipsDisplay = document.getElementById('tpPipsDisplay');
                            const tpAmountDisplay = document.getElementById('tpAmountDisplay');
                            if (tpPipsDisplay) tpPipsDisplay.textContent = `${rewardPips.toFixed(1)} pips`;
                            if (tpAmountDisplay) tpAmountDisplay.textContent = `$${rewardAmount.toFixed(2)}`;
                            
                            // Calculate R:R if SL is set
                            if (enableSL && slPrice > 0 && slPrice !== newPrice) {
                                const riskDistance = Math.abs(slPrice - newPrice);
                                const rr = rewardDistance / riskDistance;
                                const rrDisplay = document.getElementById('rrDisplay');
                                if (rrDisplay) rrDisplay.textContent = `${rr.toFixed(2)}R`;
                            }
                        }
                    }
                    
                    // Update BE line position when Entry or SL changes
                    if (self.previewLines.be && document.getElementById('autoBreakevenToggle')?.checked) {
                        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                        const beMode = self.breakevenMode || 'pips';
                        
                        if (entryPrice) {
                            let newBEPrice = 0;
                            
                            if (beMode === 'pips') {
                                const bePips = parseFloat(document.getElementById('breakevenPips')?.value || 10);
                                const profitPrice = bePips * self.pipSize;
                                newBEPrice = self.orderSide === 'BUY' 
                                    ? entryPrice + profitPrice 
                                    : entryPrice - profitPrice;
                            } else {
                                const beAmount = parseFloat(document.getElementById('breakevenAmount')?.value || 50);
                                const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
                                const profitPips = beAmount / (quantity * self.pipValuePerLot);
                                const profitPrice = profitPips * self.pipSize;
                                newBEPrice = self.orderSide === 'BUY' 
                                    ? entryPrice + profitPrice 
                                    : entryPrice - profitPrice;
                            }
                            
                            // Update BE line position
                            const newBEY = self.chart.scales.yScale(newBEPrice);
                            self.previewLines.be.price = newBEPrice;
                            self.previewLines.be.line.attr('y1', newBEY).attr('y2', newBEY);
                            
                            // Update BE label position
                            const beBbox = self.previewLines.be.labelDimensions;
                            const beHeight = beBbox?.height || 0;
                            const beTransform = self.previewLines.be.labelGroup.attr('transform');
                            const beX = parseFloat(beTransform?.match(/translate\(([\d.]+)/)?.[1] || 0);
                            const beY = newBEY - beHeight / 2;
                            self.previewLines.be.labelGroup.attr('transform', `translate(${beX}, ${beY})`);
                        }
                    }
                }
                
                // Throttled live calculations - show R:R ratio and dollar amounts
                throttledCalculate(() => {
                    // Get fresh values from the just-updated inputs
                    const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                    const slPrice = parseFloat(document.getElementById('slPrice')?.value || 0);
                    const tpPrice = parseFloat(document.getElementById('tpPrice')?.value || 0);
                    const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
                    
                    if (entryPrice && slPrice && tpPrice) {
                        const risk = Math.abs(entryPrice - slPrice);
                        let reward = 0;
                        
                        if (self.orderSide === 'BUY') {
                            reward = Math.abs(tpPrice - entryPrice);
                        } else {
                            reward = Math.abs(entryPrice - tpPrice);
                        }
                        
                        const rrRatio = risk > 0 ? (reward / risk) : 0;
                        
                        // Calculate dollar amounts using the quantity from input
                        const riskPips = risk / self.pipSize;
                        const rewardPips = reward / self.pipSize;
                        const riskAmount = riskPips * quantity * self.pipValuePerLot;
                        const rewardAmount = rewardPips * quantity * self.pipValuePerLot;
                        
                        // Show live R:R on Entry line
                        if (self.previewLines.entry && self.previewLines.entry.rrIndicator) {
                            self.previewLines.entry.rrIndicator
                                .attr('x', 10)
                                .attr('y', -12)
                                .text(`R:R ${rrRatio.toFixed(2)}`);
                        }
                        
                        // Show dollar amount on TP line if dragging TP
                        if (lineData.label === 'TP' && !lineData.dollarIndicator) {
                            lineData.dollarIndicator = lineData.labelGroup.append('text')
                                .attr('class', 'dollar-indicator')
                                .attr('fill', '#22c55e')
                                .attr('font-size', '11px')
                                .attr('font-weight', '700')
                                .attr('text-anchor', 'end');
                        }
                        if (lineData.label === 'TP' && lineData.dollarIndicator) {
                            lineData.dollarIndicator
                                .attr('x', -10)
                                .attr('y', 4)
                                .text(`+$${rewardAmount.toFixed(2)}`);
                        }
                        
                        // Show dollar amount on SL line if dragging SL
                        if (lineData.label === 'SL' && !lineData.dollarIndicator) {
                            lineData.dollarIndicator = lineData.labelGroup.append('text')
                                .attr('class', 'dollar-indicator')
                                .attr('fill', '#ef4444')
                                .attr('font-size', '11px')
                                .attr('font-weight', '700')
                                .attr('text-anchor', 'end');
                        }
                        if (lineData.label === 'SL' && lineData.dollarIndicator) {
                            lineData.dollarIndicator
                                .attr('x', -10)
                                .attr('y', 4)
                                .text(`-$${riskAmount.toFixed(2)}`);
                        }
                    }
                    
                    // Call these AFTER calculating indicators
                    self.calculateAdvancedRiskReward();
                    self.updatePlaceButtonText();
                });
                
                // ALWAYS do an immediate (non-throttled) calculation for first-drag feedback
                // This ensures values show immediately, throttled version provides smooth updates
                self.calculateAdvancedRiskReward();
                self.updatePlaceButtonText();
            })
            .on('end', () => {
                if (!isDragging) return;
                isDragging = false;
                lineData.line.attr('opacity', 0.7);
                
                // Clear dragging flag
                self.isDraggingPreviewLine = false;
                
                // Clean up temporary indicators
                if (lineData.pipIndicator) {
                    lineData.pipIndicator.remove();
                    lineData.pipIndicator = null;
                }
                if (lineData.dollarIndicator) {
                    lineData.dollarIndicator.remove();
                    lineData.dollarIndicator = null;
                }
                if (lineData.rrIndicator) {
                    lineData.rrIndicator.remove();
                    lineData.rrIndicator = null;
                }
                
                // Cancel any pending frame
                if (frameId) {
                    cancelAnimationFrame(frameId);
                    frameId = null;
                }
                
                // Final calculation and update
                self.calculateAdvancedRiskReward();
                self.updatePlaceButtonText();
                
                // Update Entry label one final time to ensure lot size is correct
                if (self.previewLines.entry && (lineData.label === 'Entry' || lineData.label === 'SL')) {
                    requestAnimationFrame(() => {
                        const entryY = self.chart.scales.yScale(self.previewLines.entry.price);
                        self.renderPreviewLabel(self.previewLines.entry, entryY);
                    });
                }
                
                const dragDuration = Date.now() - dragStartTime;
                console.log(`✅ Drag completed in ${dragDuration}ms: ${lineData.label} @ ${lineData.price.toFixed(5)}`);
            });

        lineData.line.call(drag);
        if (lineData.labelGroup) {
            lineData.labelGroup.call(drag);
        }
    }

    drawPreviewBadge(entryPrice, color, label, targetPrice) {
        const y = this.chart.scales.yScale(entryPrice);
        const self = this;

        // Create a small draggable badge (no line, just the label)
        const badgeGroup = this.chart.svg.append('g')
            .attr('class', 'preview-badge-group')
            .style('cursor', 'ns-resize')
            .style('pointer-events', 'all');

        const badgeData = {
            line: null, // No line initially
            labelGroup: badgeGroup,
            price: entryPrice,
            label: label,
            color: color,
            targetPrice: targetPrice,
            isBadge: true,
            priceText: null,
            labelDimensions: { width: 0, height: 0 },
            yAxisHighlight: null
        };

        // Render the badge label
        this.renderPreviewLabel(badgeData, y);

        // Make badge draggable - when dragged, convert to full line
        const drag = d3.drag()
            .on('start', () => {
                badgeGroup.style('opacity', 0.8);
            })
            .on('drag', event => {
                if (!self.chart?.scales?.yScale) return;

                const chartHeightRaw = self.chart.h ?? self.chart.height ?? self.chart.svg?.attr('height') ?? 0;
                const chartHeight = Number(chartHeightRaw) || 0;
                const clampedY = Math.max(0, Math.min(chartHeight, event.y));
                const newPrice = self.chart.scales.yScale.invert(clampedY);

                // Mark as manually positioned and convert to full line
                if (label === 'TP') {
                    self.tpManuallyPositioned = true;
                    const tpInput = document.getElementById('tpPrice');
                    if (tpInput) tpInput.value = self.formatPrice(newPrice);
                    
                    // Calculate risk/reward immediately when TP badge is dragged
                    const entryPrice = self.previewLines.entry?.price || parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                    const slPrice = self.previewLines.sl?.price || parseFloat(document.getElementById('slPrice')?.value || 0);
                    const enableSL = document.getElementById('enableSL')?.checked;
                    
                    if (entryPrice > 0 && newPrice !== entryPrice) {
                        // Calculate reward
                        const rewardDistance = Math.abs(newPrice - entryPrice);
                        const rewardPips = rewardDistance / self.pipSize;
                        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
                        const rewardAmount = rewardPips * quantity * self.pipValuePerLot;
                        
                        // Update TP display
                        const tpPipsDisplay = document.getElementById('tpPipsDisplay');
                        const tpAmountDisplay = document.getElementById('tpAmountDisplay');
                        if (tpPipsDisplay) tpPipsDisplay.textContent = `${rewardPips.toFixed(1)} pips`;
                        if (tpAmountDisplay) tpAmountDisplay.textContent = `$${rewardAmount.toFixed(2)}`;
                        
                        // Calculate R:R if SL is set
                        if (enableSL && slPrice > 0 && slPrice !== entryPrice) {
                            const riskDistance = Math.abs(slPrice - entryPrice);
                            const rr = rewardDistance / riskDistance;
                            const rrDisplay = document.getElementById('rrDisplay');
                            if (rrDisplay) rrDisplay.textContent = `${rr.toFixed(2)}R`;
                        }
                    }
                } else if (label === 'SL') {
                    self.slManuallyPositioned = true;
                    const slInput = document.getElementById('slPrice');
                    if (slInput) slInput.value = self.formatPrice(newPrice);
                    
                    // Calculate lot size and risk display immediately when SL badge is dragged
                    const enableSL = document.getElementById('enableSL')?.checked;
                    const entryPrice = self.previewLines.entry?.price || parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
                    
                    if (enableSL && newPrice > 0 && entryPrice > 0 && newPrice !== entryPrice) {
                        const riskPips = Math.abs(entryPrice - newPrice) / self.pipSize;
                        
                        // Update SL pips display
                        const slPipsDisplay = document.getElementById('slPipsDisplay');
                        if (slPipsDisplay) slPipsDisplay.textContent = `${riskPips.toFixed(1)} pips`;
                        
                        // Calculate R:R if TP is set
                        const tpPrice = self.previewLines.tp?.price || parseFloat(document.getElementById('tpPrice')?.value || 0);
                        const enableTP = document.getElementById('enableTP')?.checked;
                        if (enableTP && tpPrice > 0 && tpPrice !== entryPrice) {
                            const rewardDistance = Math.abs(tpPrice - entryPrice);
                            const riskDistance = Math.abs(newPrice - entryPrice);
                            const rr = rewardDistance / riskDistance;
                            const rrDisplay = document.getElementById('rrDisplay');
                            if (rrDisplay) rrDisplay.textContent = `${rr.toFixed(2)}R`;
                        }
                        
                        // Calculate lot size if in risk-based mode
                        if ((self.positionSizeMode === 'risk-usd' || self.positionSizeMode === 'risk-percent') && riskPips > 0) {
                            let riskAmount;
                            if (self.positionSizeMode === 'risk-usd') {
                                riskAmount = parseFloat(document.getElementById('riskAmountUSD')?.value || 50);
                            } else {
                                const riskPercent = parseFloat(document.getElementById('riskAmountPercent')?.value || 1);
                                riskAmount = (self.accountBalance || 100000) * (riskPercent / 100);
                            }
                            
                            const lotSize = riskAmount / (riskPips * self.pipValuePerLot);
                            const roundedLotSize = Math.round(lotSize * 100) / 100;
                            
                            // Update quantity input
                            const quantityInput = document.getElementById('orderQuantity');
                            if (quantityInput) {
                                quantityInput.value = roundedLotSize.toFixed(2);
                            }
                            
                            // Update the calculatedLots display
                            const calculatedLotsDisplay = document.getElementById('calculatedLots');
                            if (calculatedLotsDisplay) {
                                calculatedLotsDisplay.textContent = `${roundedLotSize.toFixed(2)} Lots`;
                            }
                            
                            // Update SL amount display
                            const slAmountDisplay = document.getElementById('slAmountDisplay');
                            if (slAmountDisplay) slAmountDisplay.textContent = `$${riskAmount.toFixed(2)}`;
                        }
                    }
                }

                // Refresh to convert badge to full line
                self.updatePreviewLines();
                
                // Use requestAnimationFrame to ensure calculation happens after DOM updates
                requestAnimationFrame(() => {
                    self.calculateAdvancedRiskReward();
                    self.updatePlaceButtonText();
                    
                    // Also update the Entry label to show correct lot size
                    if (self.previewLines.entry) {
                        const entryY = self.chart.scales.yScale(self.previewLines.entry.price);
                        self.renderPreviewLabel(self.previewLines.entry, entryY);
                    }
                });
            })
            .on('end', () => {
                badgeGroup.style('opacity', 1);
                // Final calculation on drag end
                requestAnimationFrame(() => {
                    self.calculateAdvancedRiskReward();
                    self.updatePlaceButtonText();
                });
            });

        badgeGroup.call(drag);
        return badgeData;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SPLIT ENTRY SYSTEM - Allows splitting entry and TP into multiple levels
    // ═══════════════════════════════════════════════════════════════════════
    
    /**
     * Add a split entry at the specified price
     */
    addSplitEntry(price) {
        const mainEntryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        if (!mainEntryPrice || price === mainEntryPrice) return;
        
        // Calculate default percentage (redistribute equally)
        const totalEntries = this.splitEntries.length + 2; // +2 for main entry + new split
        const equalPercent = Math.round(100 / totalEntries);
        
        // Adjust existing percentages
        this.splitEntries.forEach(entry => {
            entry.percentage = equalPercent;
        });
        
        // Auto-detect order type for this split entry based on price vs current price
        const currentCandle = this.getCurrentCandle();
        const currentPrice = currentCandle?.c || currentCandle?.close || 0;
        let splitOrderType = this.orderType; // Default to main order type
        
        if (currentPrice > 0) {
            if (this.orderSide === 'BUY') {
                // BUY: above price = STOP, below price = LIMIT
                splitOrderType = price > currentPrice ? 'stop' : 'limit';
            } else {
                // SELL: below price = STOP, above price = LIMIT
                splitOrderType = price < currentPrice ? 'stop' : 'limit';
            }
        }
        
        // Add new split entry with its own order type
        const newSplitEntry = {
            id: this.splitEntryIdCounter++,
            price: parseFloat(price.toFixed(5)),
            percentage: equalPercent,
            orderType: splitOrderType, // Each split entry has its own order type
            lineData: null
        };
        
        this.splitEntries.push(newSplitEntry);
        this.splitEntriesEnabled = true;
        
        // Main entry also gets equal percentage (remaining)
        // This is tracked implicitly: main entry % = 100 - sum(split %)
        
        console.log(`📊 Added split entry #${newSplitEntry.id} at ${price.toFixed(5)} (${equalPercent}%)`);
        console.log(`   Total split entries: ${this.splitEntries.length}`);
        
        // Redraw preview lines
        this.updatePreviewLines();
        this.calculateAdvancedRiskReward();
        
        return newSplitEntry;
    }
    
    /**
     * Remove a split entry by ID
     */
    removeSplitEntry(entryId) {
        const index = this.splitEntries.findIndex(e => e.id === entryId);
        if (index === -1) return;
        
        this.splitEntries.splice(index, 1);
        
        // Redistribute percentages
        if (this.splitEntries.length === 0) {
            this.splitEntriesEnabled = false;
        } else {
            const equalPercent = Math.round(100 / (this.splitEntries.length + 1));
            this.splitEntries.forEach(entry => {
                entry.percentage = equalPercent;
            });
        }
        
        console.log(`🗑️ Removed split entry #${entryId}`);
        
        this.updatePreviewLines();
        this.calculateAdvancedRiskReward();
    }
    
    /**
     * Update split entry price
     */
    updateSplitEntryPrice(entryId, newPrice) {
        const entry = this.splitEntries.find(e => e.id === entryId);
        if (entry) {
            entry.price = parseFloat(newPrice.toFixed(5));
            console.log(`📊 Updated split entry #${entryId} to ${newPrice.toFixed(5)}`);
        }
    }
    
    /**
     * Get the percentage for main entry (100 - sum of split percentages)
     */
    getMainEntryPercentage() {
        if (this.splitEntries.length === 0) return 100;
        const splitSum = this.splitEntries.reduce((sum, e) => sum + e.percentage, 0);
        return Math.max(0, 100 - splitSum);
    }
    
    /**
     * Clear all split entries
     */
    clearSplitEntries() {
        this.splitEntries = [];
        this.splitEntriesEnabled = false;
        console.log('🗑️ Cleared all split entries');
        this.updatePreviewLines();
    }
    
    /**
     * Draw the split handle badge on a line
     */
    drawSplitHandle(lineData, parentGroup) {
        if (!lineData || !parentGroup) return null;
        
        const self = this;
        const handleSize = 18;
        const handleGap = 4;
        
        // Get the total width of existing segments
        const existingBBox = parentGroup.node().getBBox();
        const handleX = existingBBox.width + handleGap;
        
        // Create split handle group
        const splitHandle = parentGroup.append('g')
            .attr('class', 'split-handle')
            .attr('transform', `translate(${handleX}, ${(24 - handleSize) / 2})`)
            .style('cursor', 'copy')
            .style('opacity', 0.7);
        
        // Background circle
        splitHandle.append('circle')
            .attr('cx', handleSize / 2)
            .attr('cy', handleSize / 2)
            .attr('r', handleSize / 2)
            .attr('fill', 'rgba(124, 58, 237, 0.3)')
            .attr('stroke', '#7c3aed')
            .attr('stroke-width', 1.5);
        
        // Plus icon
        splitHandle.append('text')
            .attr('x', handleSize / 2)
            .attr('y', handleSize / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#7c3aed')
            .attr('font-size', '14px')
            .attr('font-weight', '700')
            .text('⊕');
        
        // Hover effect
        splitHandle
            .on('mouseenter', function() {
                d3.select(this).style('opacity', 1);
                d3.select(this).select('circle')
                    .attr('fill', 'rgba(124, 58, 237, 0.5)');
            })
            .on('mouseleave', function() {
                d3.select(this).style('opacity', 0.7);
                d3.select(this).select('circle')
                    .attr('fill', 'rgba(124, 58, 237, 0.3)');
            });
        
        // Make split handle draggable
        // Store initial Y offset for proper drag positioning
        let dragStartY = 0;
        let initialLineY = 0;
        
        const drag = d3.drag()
            .on('start', function(event) {
                event.sourceEvent.stopPropagation();
                d3.select(this).style('opacity', 1);
                
                // Get SVG coordinates from mouse position
                const svgNode = self.chart.svg.node();
                const pt = svgNode.createSVGPoint();
                pt.x = event.sourceEvent.clientX;
                pt.y = event.sourceEvent.clientY;
                const svgCoords = pt.matrixTransform(svgNode.getScreenCTM().inverse());
                
                // Store initial positions
                initialLineY = self.chart.scales.yScale(lineData.price);
                dragStartY = svgCoords.y;
                
                // Create a ghost line that starts at the original line position
                self.splitDragGhost = self.chart.svg.append('line')
                    .attr('class', 'split-drag-ghost')
                    .attr('x1', 0)
                    .attr('x2', self.chart.w)
                    .attr('y1', initialLineY)
                    .attr('y2', initialLineY)
                    .attr('stroke', '#7c3aed')
                    .attr('stroke-width', 2)
                    .attr('stroke-dasharray', '6,4')
                    .attr('opacity', 0.8);
                
                // Create label showing "Split Entry" or "Split TP"
                const isTpLine = lineData.label && lineData.label.startsWith('TP');
                const labelText = isTpLine ? 'New TP' : 'Split Entry';
                
                self.splitDragLabel = self.chart.svg.append('g')
                    .attr('class', 'split-drag-label');
                
                self.splitDragLabel.append('rect')
                    .attr('width', 80)
                    .attr('height', 22)
                    .attr('rx', 4)
                    .attr('fill', '#7c3aed')
                    .attr('opacity', 0.9);
                
                self.splitDragLabel.append('text')
                    .attr('x', 40)
                    .attr('y', 11)
                    .attr('dy', '0.35em')
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#ffffff')
                    .attr('font-size', '11px')
                    .attr('font-weight', '600')
                    .text(labelText);
                
                self.splitDragLabel.attr('transform', `translate(${self.chart.w - 150}, ${initialLineY - 11})`);
            })
            .on('drag', function(event) {
                if (!self.splitDragGhost) return;
                
                // Get SVG coordinates from mouse position
                const svgNode = self.chart.svg.node();
                const pt = svgNode.createSVGPoint();
                pt.x = event.sourceEvent.clientX;
                pt.y = event.sourceEvent.clientY;
                const svgCoords = pt.matrixTransform(svgNode.getScreenCTM().inverse());
                
                // Calculate the new Y position based on drag delta from initial line position
                const dragDelta = svgCoords.y - dragStartY;
                const chartHeight = self.chart.h || 400;
                const newY = Math.max(0, Math.min(chartHeight, initialLineY + dragDelta));
                const newPrice = self.chart.scales.yScale.invert(newY);
                
                // Update ghost line position
                self.splitDragGhost
                    .attr('y1', newY)
                    .attr('y2', newY);
                
                // Update label position and text
                if (self.splitDragLabel) {
                    self.splitDragLabel.attr('transform', `translate(${self.chart.w - 150}, ${newY - 11})`);
                    self.splitDragLabel.select('text').text(`@ ${self.formatPrice(newPrice)}`);
                }
            })
            .on('end', function(event) {
                // Get SVG coordinates from mouse position
                const svgNode = self.chart.svg.node();
                const pt = svgNode.createSVGPoint();
                pt.x = event.sourceEvent.clientX;
                pt.y = event.sourceEvent.clientY;
                const svgCoords = pt.matrixTransform(svgNode.getScreenCTM().inverse());
                
                // Calculate final position
                const dragDelta = svgCoords.y - dragStartY;
                const chartHeight = self.chart.h || 400;
                const finalY = Math.max(0, Math.min(chartHeight, initialLineY + dragDelta));
                const newPrice = self.chart.scales.yScale.invert(finalY);
                
                // Remove ghost elements
                if (self.splitDragGhost) {
                    self.splitDragGhost.remove();
                    self.splitDragGhost = null;
                }
                if (self.splitDragLabel) {
                    self.splitDragLabel.remove();
                    self.splitDragLabel = null;
                }
                
                d3.select(this).style('opacity', 0.7);
                
                // Check if this is Entry or TP line
                const isTpLine = lineData.label && (lineData.label.startsWith('TP') || lineData.label === 'TP');
                const isEntryLine = lineData.label === 'Entry' || (lineData.label && lineData.label.startsWith('Entry'));
                
                // Only create split if actually moved (no minimum distance requirement)
                const distance = Math.abs(newPrice - lineData.price);
                if (distance < 0.00001) {
                    // Didn't move, ignore
                    return;
                }
                
                if (isEntryLine) {
                    // Add split entry
                    self.addSplitEntry(newPrice);
                    self.showNotification(`Split entry added at ${self.formatPrice(newPrice)}`, 'success');
                } else if (isTpLine) {
                    // Add new TP target
                    self.addTPFromSplit(newPrice);
                    self.showNotification(`New TP added at ${self.formatPrice(newPrice)}`, 'success');
                }
            });
        
        splitHandle.call(drag);
        
        return splitHandle;
    }
    
    /**
     * Draw a split entry line (similar to preview line but with close button)
     */
    drawSplitEntryLine(price, color, label, entryId, index) {
        const self = this;
        const y = this.chart.scales.yScale(price);
        
        // Draw the line
        const line = this.chart.svg.append('line')
            .attr('class', 'split-entry-line')
            .attr('x1', 0)
            .attr('x2', this.chart.w)
            .attr('y1', y)
            .attr('y2', y)
            .attr('stroke', color)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '6,4')
            .attr('opacity', 0.8)
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');
        
        // Create label group
        const labelGroup = this.chart.svg.append('g')
            .attr('class', 'split-entry-label-group')
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');
        
        const lineData = {
            line,
            labelGroup,
            price,
            label,
            color,
            entryId,
            index,
            priceText: null,
            labelDimensions: { width: 0, height: 0 },
            isSplitEntry: true
        };
        
        // Render the label with close button
        this.renderSplitEntryLabel(lineData, y);
        
        // Make the line draggable
        this.makeSplitEntryLineDraggable(lineData);
        
        return lineData;
    }
    
    /**
     * Render split entry label with close button
     */
    renderSplitEntryLabel(lineData, y) {
        if (!lineData || !lineData.labelGroup) return;
        
        const self = this;
        lineData.labelGroup.selectAll('*').remove();
        
        const height = 24;
        const gap = 4;
        let offsetX = 0;
        
        // Label segment
        const labelSegment = lineData.labelGroup.append('g')
            .attr('class', 'split-entry-segment');
        
        const labelText = labelSegment.append('text')
            .attr('class', 'split-entry-label-text')
            .attr('fill', '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('text-anchor', 'middle')
            .attr('y', height / 2)
            .attr('dy', '0.35em')
            .text(lineData.label);
        
        const labelBBox = labelText.node().getBBox();
        const labelWidth = Math.max(labelBBox.width + 16, 70);
        
        labelSegment.insert('rect', ':first-child')
            .attr('class', 'split-entry-label-bg')
            .attr('width', labelWidth)
            .attr('height', height)
            .attr('rx', 6)
            .attr('fill', lineData.color)
            .attr('stroke', lineData.color)
            .attr('stroke-width', 1.2);
        
        labelText.attr('x', labelWidth / 2);
        labelSegment.attr('transform', `translate(${offsetX}, 0)`);
        offsetX += labelWidth + gap;
        
        // Price segment
        const priceSegment = lineData.labelGroup.append('g')
            .attr('class', 'split-entry-price-segment');
        
        const priceText = priceSegment.append('text')
            .attr('class', 'split-entry-price-text')
            .attr('fill', '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', '700')
            .attr('text-anchor', 'middle')
            .attr('y', height / 2)
            .attr('dy', '0.35em')
            .text(this.formatPrice(lineData.price));
        
        const priceBBox = priceText.node().getBBox();
        const priceWidth = Math.max(priceBBox.width + 16, 65);
        
        priceSegment.insert('rect', ':first-child')
            .attr('class', 'split-entry-price-bg')
            .attr('width', priceWidth)
            .attr('height', height)
            .attr('rx', 6)
            .attr('fill', 'rgba(0, 0, 0, 0.7)')
            .attr('stroke', lineData.color)
            .attr('stroke-width', 1);
        
        priceText.attr('x', priceWidth / 2);
        priceSegment.attr('transform', `translate(${offsetX}, 0)`);
        lineData.priceText = priceText;
        offsetX += priceWidth + gap;
        
        // Close button (X)
        const closeSize = 20;
        const closeGroup = lineData.labelGroup.append('g')
            .attr('class', 'split-entry-close-btn')
            .attr('transform', `translate(${offsetX}, ${(height - closeSize) / 2})`)
            .style('cursor', 'pointer');
        
        closeGroup.append('circle')
            .attr('cx', closeSize / 2)
            .attr('cy', closeSize / 2)
            .attr('r', closeSize / 2)
            .attr('fill', 'rgba(239, 68, 68, 0.3)')
            .attr('stroke', '#ef4444')
            .attr('stroke-width', 1.5);
        
        closeGroup.append('text')
            .attr('x', closeSize / 2)
            .attr('y', closeSize / 2)
            .attr('dy', '0.35em')
            .attr('text-anchor', 'middle')
            .attr('fill', '#ef4444')
            .attr('font-size', '12px')
            .attr('font-weight', '700')
            .text('✕');
        
        // Close button events
        closeGroup
            .on('mouseenter', function() {
                d3.select(this).select('circle')
                    .attr('fill', 'rgba(239, 68, 68, 0.5)');
            })
            .on('mouseleave', function() {
                d3.select(this).select('circle')
                    .attr('fill', 'rgba(239, 68, 68, 0.3)');
            })
            .on('click', function(event) {
                event.stopPropagation();
                self.removeSplitEntry(lineData.entryId);
            });
        
        // Position the label group
        const bbox = lineData.labelGroup.node().getBBox();
        lineData.labelDimensions = { width: bbox.width, height: bbox.height };
        
        const x = this.chart.w - bbox.width - 70; // Offset from right
        const translateY = y - height / 2;
        lineData.labelGroup.attr('transform', `translate(${x}, ${translateY})`);
    }
    
    /**
     * Make split entry line draggable
     */
    makeSplitEntryLineDraggable(lineData) {
        const self = this;
        let isDragging = false;
        
        const drag = d3.drag()
            .on('start', function() {
                isDragging = true;
                lineData.line.attr('opacity', 1);
                self.isDraggingPreviewLine = true;
            })
            .on('drag', function(event) {
                if (!isDragging || !self.chart?.scales?.yScale) return;
                
                const chartHeight = self.chart.h || 400;
                const clampedY = Math.max(0, Math.min(chartHeight, event.y));
                const newPrice = self.chart.scales.yScale.invert(clampedY);
                
                // Update line position
                lineData.line.attr('y1', clampedY).attr('y2', clampedY);
                lineData.price = newPrice;
                
                // Auto-detect order type based on price vs current price
                const currentCandle = self.getCurrentCandle();
                const currentPrice = currentCandle?.c || currentCandle?.close || 0;
                
                if (currentPrice > 0) {
                    let newOrderType;
                    if (self.orderSide === 'BUY') {
                        newOrderType = newPrice > currentPrice ? 'stop' : 'limit';
                    } else {
                        newOrderType = newPrice < currentPrice ? 'stop' : 'limit';
                    }
                    
                    // Update order type if changed
                    if (lineData.orderType !== newOrderType) {
                        lineData.orderType = newOrderType;
                        lineData.label = `${newOrderType.toUpperCase()} ${self.orderSide}`;
                        
                        // Update the split entry data
                        const splitEntry = self.splitEntries.find(e => e.id === lineData.entryId);
                        if (splitEntry) {
                            splitEntry.orderType = newOrderType;
                        }
                        
                        // Re-render label to show new type
                        self.renderSplitEntryLabel(lineData, clampedY);
                    }
                }
                
                // Update price text
                if (lineData.priceText) {
                    lineData.priceText.text(self.formatPrice(newPrice));
                }
                
                // Update label position
                const height = lineData.labelDimensions.height || 24;
                const currentX = self.chart.w - lineData.labelDimensions.width - 70;
                lineData.labelGroup.attr('transform', `translate(${currentX}, ${clampedY - height / 2})`);
                
                // Update split entry data
                self.updateSplitEntryPrice(lineData.entryId, newPrice);
            })
            .on('end', function() {
                isDragging = false;
                lineData.line.attr('opacity', 0.8);
                self.isDraggingPreviewLine = false;
                
                // Recalculate risk/reward
                self.calculateAdvancedRiskReward();
            });
        
        // Apply drag to both line and label
        lineData.line.call(drag);
        lineData.labelGroup.call(drag);
    }
    
    /**
     * Add a new TP target from split drag
     */
    addTPFromSplit(price) {
        // Enable multiple TP if not already (without triggering change event that initializes)
        const multipleTPToggle = document.getElementById('multipleTPToggle');
        const multipleTPSettings = document.getElementById('multipleTPSettings');
        
        if (multipleTPToggle && !multipleTPToggle.checked) {
            multipleTPToggle.checked = true;
            // Show settings panel manually (don't trigger change event)
            if (multipleTPSettings) {
                multipleTPSettings.classList.remove('is-hidden');
            }
        }
        
        // Initialize tpTargets array if needed
        if (!this.tpTargets) {
            this.tpTargets = [];
        }
        
        // IMPORTANT: If tpTargets is empty but we have a TP price from single TP mode,
        // we need to preserve the original TP first before adding the new split one
        if (this.tpTargets.length === 0) {
            const originalTPPrice = parseFloat(document.getElementById('tpPrice')?.value || 0);
            if (originalTPPrice > 0) {
                // Add the original TP as the first target
                this.tpTargets.push({
                    id: Date.now() - 1, // Slightly earlier ID to preserve ordering
                    price: parseFloat(originalTPPrice.toFixed(5)),
                    percentage: 50 // Will be recalculated below
                });
                console.log(`📊 Preserved original TP at ${originalTPPrice.toFixed(5)}`);
            }
        }
        
        // Calculate equal percentage for new total
        const numTargets = this.tpTargets.length + 1;
        const equalPercent = Math.round(100 / numTargets);
        
        // Adjust existing percentages
        this.tpTargets.forEach(t => {
            t.percentage = equalPercent;
        });
        
        // Add new target
        const newTarget = {
            id: Date.now(),
            price: parseFloat(price.toFixed(5)),
            percentage: 100 - (equalPercent * (numTargets - 1)) // Remainder goes to last
        };
        
        this.tpTargets.push(newTarget);
        
        // Sort by price (ascending for BUY, descending for SELL)
        if (this.orderSide === 'BUY') {
            this.tpTargets.sort((a, b) => a.price - b.price);
        } else {
            this.tpTargets.sort((a, b) => b.price - a.price);
        }
        
        console.log(`📊 Added TP target at ${price.toFixed(5)} - Total TPs: ${this.tpTargets.length}`);
        
        // Update UI
        this.renderTPTargets();
        this.updatePreviewLines();
        this.calculateAdvancedRiskReward();
    }
    
    /**
     * Remove a TP target by ID
     */
    removeTPTarget(targetId) {
        if (!this.tpTargets) return;
        
        const index = this.tpTargets.findIndex(t => t.id === targetId);
        if (index === -1) return;
        
        // Remove the target
        this.tpTargets.splice(index, 1);
        
        // If no targets left, disable multiple TPs
        if (this.tpTargets.length === 0) {
            const multipleTPToggle = document.getElementById('multipleTPToggle');
            const multipleTPSettings = document.getElementById('multipleTPSettings');
            if (multipleTPToggle) multipleTPToggle.checked = false;
            if (multipleTPSettings) multipleTPSettings.classList.add('is-hidden');
        } else {
            // Recalculate percentages
            const equalPercent = Math.round(100 / this.tpTargets.length);
            this.tpTargets.forEach((t, i) => {
                if (i === this.tpTargets.length - 1) {
                    t.percentage = 100 - (equalPercent * (this.tpTargets.length - 1));
                } else {
                    t.percentage = equalPercent;
                }
            });
        }
        
        console.log(`🗑️ Removed TP target #${targetId} - Remaining: ${this.tpTargets.length}`);
        
        // Update UI
        this.renderTPTargets();
        this.updatePreviewLines();
        this.calculateAdvancedRiskReward();
    }

    drawYAxisPriceHighlight(price, color, label, yOffset = 0) {
        if (!this.chart?.scales?.yScale || !this.chart?.svg) return null;

        const y = this.chart.scales.yScale(price);
        const priceText = this.formatPrice(price);
        
        // Create highlight group on the Y-axis with high z-index
        const highlightGroup = this.chart.svg.append('g')
            .attr('class', `y-axis-price-highlight y-axis-${label.toLowerCase()}-highlight`)
            .style('pointer-events', 'none')
            .style('isolation', 'isolate');

        const paddingH = 10; // Horizontal padding
        const paddingV = 4;  // Vertical padding
        const height = 24;   // Slightly taller
        
        // Create text to measure width
        const text = highlightGroup.append('text')
            .attr('class', 'y-axis-price-text')
            .attr('fill', '#ffffff')
            .attr('font-size', '12px')
            .attr('font-weight', '600')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .text(priceText);

        const textBBox = text.node().getBBox();
        const width = Math.max(textBBox.width + (paddingH * 2), 60);
        
        // Position flush right on the Y-axis area (like TradingView)
        const rightMargin = this.chart.margin?.r || 70;
        const x = this.chart.w - rightMargin + 2; // Flush to price axis
        
        // Background rect with pill-like rounded corners (TradingView style)
        highlightGroup.insert('rect', ':first-child')
            .attr('width', width)
            .attr('height', height)
            .attr('rx', 4) // Rounded corners
            .attr('ry', 4)
            .attr('fill', color)
            .attr('fill-opacity', 1);

        // Position text in center of rect
        text.attr('x', width / 2)
            .attr('y', height / 2);

        // Position the entire group with yOffset applied
        highlightGroup.attr('transform', `translate(${x}, ${y + yOffset - height / 2})`);
        
        return highlightGroup;
    }

    /**
     * Remove all preview lines from chart
     */
    removePreviewLines() {
        console.log('🗑️ Removing preview lines...');

        if (this.previewLines) {
            ['entry', 'tp', 'sl'].forEach(key => {
                if (this.previewLines[key]) {
                    try {
                        // Remove line if it exists (badges don't have lines)
                        if (this.previewLines[key].line) {
                            this.previewLines[key].line.remove();
                        }
                        // Always remove label group
                        if (this.previewLines[key].labelGroup) {
                            this.previewLines[key].labelGroup.remove();
                        }
                        // Remove Y-axis highlight if it exists (for badges)
                        if (this.previewLines[key].yAxisHighlight) {
                            this.previewLines[key].yAxisHighlight.remove();
                        }
                        console.log(`   ✅ Removed ${key} preview ${this.previewLines[key].isBadge ? 'badge' : 'line'}`);
                    } catch (e) {
                        console.warn(`   ⚠️ Error removing ${key} preview:`, e);
                    }
                }
            });
            
            // Remove multiple TP lines
            if (this.previewLines.multipleTPs && Array.isArray(this.previewLines.multipleTPs)) {
                this.previewLines.multipleTPs.forEach((tpLine, index) => {
                    try {
                        if (tpLine.line) {
                            tpLine.line.remove();
                        }
                        if (tpLine.labelGroup) {
                            tpLine.labelGroup.remove();
                        }
                        if (tpLine.yAxisHighlight) {
                            tpLine.yAxisHighlight.remove();
                        }
                        console.log(`   ✅ Removed multiple TP #${index + 1} preview line`);
                    } catch (e) {
                        console.warn(`   ⚠️ Error removing multiple TP #${index + 1}:`, e);
                    }
                });
            }
            
            // Remove split entry lines
            if (this.previewLines.splitEntries && Array.isArray(this.previewLines.splitEntries)) {
                this.previewLines.splitEntries.forEach((splitLine, index) => {
                    try {
                        if (splitLine.line) {
                            splitLine.line.remove();
                        }
                        if (splitLine.labelGroup) {
                            splitLine.labelGroup.remove();
                        }
                        console.log(`   ✅ Removed split entry #${index + 1} preview line`);
                    } catch (e) {
                        console.warn(`   ⚠️ Error removing split entry #${index + 1}:`, e);
                    }
                });
            }
            
            this.previewLines = null;
        }

        if (this.pendingPreviewAlignFrame) {
            cancelAnimationFrame(this.pendingPreviewAlignFrame);
            this.pendingPreviewAlignFrame = null;
        }
        if (this.pendingPreviewAlignFollowupFrame) {
            cancelAnimationFrame(this.pendingPreviewAlignFollowupFrame);
            this.pendingPreviewAlignFollowupFrame = null;
        }
        if (this.pendingPreviewAlignTimeout) {
            clearTimeout(this.pendingPreviewAlignTimeout);
            this.pendingPreviewAlignTimeout = null;
        }

        // Aggressively remove any orphaned preview elements
        if (this.chart && this.chart.svg) {
            const removed = {
                lines: this.chart.svg.selectAll('.preview-line').size(),
                labelGroups: this.chart.svg.selectAll('.preview-label-group').size(),
                badgeGroups: this.chart.svg.selectAll('.preview-badge-group').size(),
                yAxisHighlights: this.chart.svg.selectAll('.y-axis-price-highlight').size(),
                splitEntryLines: this.chart.svg.selectAll('.split-entry-line').size(),
                splitEntryLabels: this.chart.svg.selectAll('.split-entry-label-group').size(),
                splitDragGhosts: this.chart.svg.selectAll('.split-drag-ghost').size()
            };
            
            this.chart.svg.selectAll('.preview-line').remove();
            this.chart.svg.selectAll('.preview-label-group').remove();
            this.chart.svg.selectAll('.preview-badge-group').remove();
            this.chart.svg.selectAll('.y-axis-price-highlight').remove();
            this.chart.svg.selectAll('.split-entry-line').remove();
            this.chart.svg.selectAll('.split-entry-label-group').remove();
            this.chart.svg.selectAll('.split-drag-ghost').remove();
            this.chart.svg.selectAll('.split-drag-label').remove();
            
            const totalRemoved = Object.values(removed).reduce((a, b) => a + b, 0);
            if (totalRemoved > 0) {
                console.log(`   🧹 Cleaned up orphaned elements: lines=${removed.lines}, labels=${removed.labelGroups}, badges=${removed.badgeGroups}, splits=${removed.splitEntryLines + removed.splitEntryLabels}`);
            }
        }

        console.log('✅ Preview lines cleanup complete');
    }

    alignPreviewLabels() {
        if (!this.previewLines || !this.chart || !this.chart.scales || !this.chart.svg) return;

        const activeLines = Object.values(this.previewLines).filter(Boolean);
        if (!activeLines.length) return;

        // Separate badges from full lines - badges don't need horizontal alignment
        const badges = activeLines.filter(line => line.isBadge);
        const lines = activeLines.filter(line => !line.isBadge);

        const buckets = [];
        const bucketMap = new Map();
        lines.forEach(lineData => {
            const rawPrice = Number(lineData.price);
            if (!Number.isFinite(rawPrice)) return;
            const precision = this.getPricePrecision(rawPrice) || 5;
            const normalizedPrice = Number(rawPrice.toFixed(precision));
            const key = normalizedPrice.toFixed(precision);

            if (!bucketMap.has(key)) {
                const bucket = { price: normalizedPrice, precision, items: [] };
                bucketMap.set(key, bucket);
                buckets.push(bucket);
            }

            bucketMap.get(key).items.push(lineData);
        });

        const orderPriority = { 'Entry': 0, 'SL': 1, 'TP': 2 };
        const gap = 28;
        const marginRight = 175; // Increased margin to match badge spacing and avoid Y-axis overlap

        buckets.forEach(bucket => {
            const items = bucket.items;
            if (!items.length) return;

            items.sort((a, b) => {
                const pa = orderPriority[a.label] ?? 99;
                const pb = orderPriority[b.label] ?? 99;
                if (pa === pb) {
                    return (a.label || '').localeCompare(b.label || '');
                }
                return pa - pb;
            });

            const widths = items.map(lineData => {
                const bbox = lineData.labelGroup?.node()?.getBBox?.();
                if (bbox) {
                    const paddedWidth = bbox.width + 10;
                    lineData.labelDimensions = { width: paddedWidth, height: bbox.height };
                    return paddedWidth;
                }
                if (lineData.labelDimensions && lineData.labelDimensions.width) {
                    return lineData.labelDimensions.width;
                }
                return 0;
            });

            const totalGap = gap * (items.length > 1 ? (items.length - 1) : 0);
            const totalWidth = widths.reduce((sum, width) => sum + width, 0) + totalGap;
            const baseX = this.chart.w - totalWidth - marginRight;

            let currentX = baseX;
            items.forEach((lineData, index) => {
                const width = widths[index] ?? 0;
                const bbox = lineData.labelDimensions;
                const height = bbox?.height || 0;
                const yPixel = this.chart.scales.yScale(lineData.price);
                const translateY = yPixel - (height / 2);
                lineData.labelGroup.attr('transform', `translate(${currentX}, ${translateY})`);
                this.adjustPreviewLineForLabel(lineData, currentX, width, height);
                currentX += width + gap;
            });
        });
    }

    adjustPreviewLineForLabel(lineData, labelX = null, labelWidth = null, labelHeight = null) {
        if (!lineData || !lineData.line || !lineData.labelGroup) return;
        if (!this.chart) return;

        const bbox = lineData.labelDimensions || lineData.labelGroup.node()?.getBBox?.();
        const width = labelWidth ?? bbox?.width ?? 0;
        const x = labelX ?? (() => {
            const transform = lineData.labelGroup.attr('transform');
            if (!transform) return this.chart.w - width - 18;
            const match = /translate\(([^,]+),/.exec(transform);
            return match ? parseFloat(match[1]) : this.chart.w - width - 18;
        })();

        const rightEdge = x;
        const startX = rightEdge - 16; // leave gap before label stack

        lineData.line
            .attr('x1', 0)
            .attr('x2', Math.max(0, startX));
    }

    validateOrder(orderType, orderSide, entryPrice, currentPrice, slPrice, tpPrice, quantity = null, positionSizeMode = null, slEnabled = false) {
        const errors = [];
        
        // Validate entry price first (required for all orders)
        if (!entryPrice || entryPrice <= 0) {
            errors.push('⚠️ Entry price must be set and greater than 0');
        }
        
        // Validate lot size/quantity
        if (quantity !== null) {
            if (!quantity || quantity <= 0) {
                errors.push('⚠️ Position size must be greater than 0 lots');
                
                // Additional context for risk-based modes
                if (positionSizeMode === 'risk-usd' || positionSizeMode === 'risk-percent') {
                    if (!slEnabled || !slPrice || slPrice <= 0) {
                        errors.push('⚠️ Set a Stop Loss to calculate position size');
                    }
                }
                
                // Additional context for lot size mode
                if (positionSizeMode === 'lot-size') {
                    errors.push('⚠️ Enter a lot size value');
                }
            }
        }
        
        // Validate order type logic
        if (orderType === 'limit') {
            // Limit Buy must be BELOW current price
            // Limit Sell must be ABOVE current price
            if (orderSide === 'BUY' && entryPrice >= currentPrice) {
                errors.push(`⚠️ Limit BUY must be BELOW current price (${currentPrice.toFixed(5)})`);
            } else if (orderSide === 'SELL' && entryPrice <= currentPrice) {
                errors.push(`⚠️ Limit SELL must be ABOVE current price (${currentPrice.toFixed(5)})`);
            }
        } else if (orderType === 'stop') {
            // Stop Buy must be ABOVE current price
            // Stop Sell must be BELOW current price
            if (orderSide === 'BUY' && entryPrice <= currentPrice) {
                errors.push(`⚠️ Stop BUY must be ABOVE current price (${currentPrice.toFixed(5)})`);
            } else if (orderSide === 'SELL' && entryPrice >= currentPrice) {
                errors.push(`⚠️ Stop SELL must be BELOW current price (${currentPrice.toFixed(5)})`);
            }
        }
        
        // Validate SL/TP logic
        if (slPrice > 0) {
            if (orderSide === 'BUY') {
                if (slPrice >= entryPrice) {
                    errors.push('⚠️ Stop Loss for BUY must be BELOW entry price');
                }
            } else {
                if (slPrice <= entryPrice) {
                    errors.push('⚠️ Stop Loss for SELL must be ABOVE entry price');
                }
            }
        }
        
        if (tpPrice > 0) {
            if (orderSide === 'BUY') {
                if (tpPrice <= entryPrice) {
                    errors.push('⚠️ Take Profit for BUY must be ABOVE entry price');
                }
            } else {
                if (tpPrice >= entryPrice) {
                    errors.push('⚠️ Take Profit for SELL must be BELOW entry price');
                }
            }
        }
        
        return errors;
    }
    
    /**
     * Place advanced order from panel
     */
    placeAdvancedOrder() {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        const currentPrice = currentCandle.c;
        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || currentPrice);
        
        // Get TP/SL enabled status
        const tpEnabled = document.getElementById('enableTP')?.checked;
        const slEnabled = document.getElementById('enableSL')?.checked;
        
        let tpPrice = 0;
        let slPrice = 0;
        
        // Calculate TP price from inputs
        if (tpEnabled) {
            const tpPriceInput = parseFloat(document.getElementById('tpPrice')?.value || 0);
            
            if (tpPriceInput > 0) {
                tpPrice = tpPriceInput;
            }
        }
        
        // Calculate SL price from inputs
        if (slEnabled) {
            const slPriceInput = parseFloat(document.getElementById('slPrice')?.value || 0);
            
            if (slPriceInput > 0) {
                slPrice = slPriceInput;
            }
        }
        
        // Get auto breakeven setting
        const autoBreakeven = document.getElementById('autoBreakevenToggle')?.checked || false;
        let breakevenSettings = null;
        if (autoBreakeven) {
            breakevenSettings = {
                mode: this.breakevenMode || 'pips',
                triggered: false, // Track if breakeven has been activated
                value: this.breakevenMode === 'pips' 
                    ? parseFloat(document.getElementById('breakevenPips')?.value || 10)
                    : parseFloat(document.getElementById('breakevenAmount')?.value || 50),
                pipOffset: parseFloat(document.getElementById('breakevenPipOffset')?.value || 0)
            };
        }
        
        // Get trailing stop settings (step-based system with activation)
        const trailingEnabled = document.getElementById('trailingSLToggle')?.checked || false;
        let trailingStop = null;
        if (trailingEnabled) {
            const stepPips = parseFloat(document.getElementById('trailingStepSize')?.value || 4);
            const activateMode = this.trailingActivateMode || 'trail-rr';
            
            // Calculate activation threshold
            let activationThreshold;
            if (activateMode === 'trail-rr') {
                const activateRR = parseFloat(document.getElementById('trailingActivateRR')?.value || 1);
                const risk = Math.abs(entryPrice - slPrice);
                const reward = risk * activateRR;
                activationThreshold = this.orderSide === 'BUY' ? entryPrice + reward : entryPrice - reward;
            } else {
                const activatePips = parseFloat(document.getElementById('trailingActivatePips')?.value || 10);
                const pipDistance = activatePips * this.pipSize;
                activationThreshold = this.orderSide === 'BUY' ? entryPrice + pipDistance : entryPrice - pipDistance;
            }
            
            trailingStop = {
                enabled: true,
                activated: false,                    // Not activated yet
                activateMode: activateMode,          // 'trail-rr' or 'trail-pips'
                activationThreshold: activationThreshold,
                stepSize: stepPips * this.pipSize,  // Step size in price
                stepPips: stepPips,                  // Step size in pips
                currentStep: 0,                      // Number of steps moved
                originalSL: slPrice                  // Store original SL
            };
        }
        
        // Get multiple TP targets
        const multipleTPEnabled = document.getElementById('multipleTPToggle')?.checked || false;
        let tpTargets = null;
        console.log(`🎯 Multiple TP Check: toggle=${multipleTPEnabled}, this.tpTargets=`, this.tpTargets);
        if (multipleTPEnabled && this.tpTargets && this.tpTargets.length > 0) {
            console.log(`📊 Multiple TP enabled! Found ${this.tpTargets.length} targets`);
            
            // Validate multiple TP targets first
            const tpErrors = this.validateTPTargets();
            if (tpErrors.length > 0) {
                console.warn('❌ Multiple TP validation failed:', tpErrors);
                
                // Show errors in validation box
                const orderValidationBox = document.getElementById('orderValidation');
                if (orderValidationBox) {
                    orderValidationBox.className = 'order-validation order-validation--error';
                    orderValidationBox.innerHTML = tpErrors.map(msg => `
                        <div class="order-validation__item">
                            <span class="order-validation__icon">⚠️</span>
                            <span>${msg}</span>
                        </div>
                    `).join('');
                }
                return; // Stop order placement
            }
            
            // Filter out targets with no price set and convert to actual percentages
            tpTargets = this.tpTargets
                .filter(t => t.price > 0)
                .map(t => {
                    let actualPercentage;
                    
                    // Convert distribution value to actual percentage based on mode
                    if (this.tpDistributionMode === 'percent') {
                        // Already a percentage
                        actualPercentage = t.percentage;
                    } else if (this.tpDistributionMode === 'amount') {
                        // Convert dollar amount to percentage of position
                        // Calculate how much quantity closes this dollar amount
                        const priceDiff = this.orderSide === 'BUY' 
                            ? (t.price - entryPrice) 
                            : (entryPrice - t.price);
                        const pipsMove = priceDiff / this.pipSize;
                        const profitPerLot = pipsMove * this.pipValuePerLot;
                        const lotsToClose = t.percentage / profitPerLot; // dollars / profit-per-lot = lots
                        actualPercentage = (lotsToClose / quantity) * 100;
                    } else if (this.tpDistributionMode === 'lots') {
                        // Convert lot size to percentage
                        actualPercentage = (t.percentage / quantity) * 100;
                    }
                    
                    return { 
                        ...t, 
                        percentage: actualPercentage,
                        hit: false 
                    };
                });
            
            // Normalize percentages to ensure they sum to exactly 100
            const totalPct = tpTargets.reduce((sum, t) => sum + t.percentage, 0);
            if (totalPct !== 100 && totalPct > 0) {
                tpTargets.forEach(t => t.percentage = (t.percentage / totalPct) * 100);
            }
            
            console.log(`✅ TP Targets prepared for order (converted to percentages):`, tpTargets);
        } else {
            console.log(`📊 Multiple TP: ${multipleTPEnabled ? 'enabled' : 'disabled'}, this.tpTargets:`, this.tpTargets);
        }
        
        // Warn if both Auto Breakeven and Trailing Stop are enabled (only one will actually work!)
        if (autoBreakeven && trailingEnabled) {
            console.warn(`⚠️⚠️⚠️ WARNING: Both Auto Breakeven AND Trailing Stop are enabled!`);
            console.warn(`   Only the one that reaches its target FIRST will activate.`);
            console.warn(`   Auto BE Target: ${breakevenSettings.mode === 'pips' ? breakevenSettings.value + ' pips' : '$' + breakevenSettings.value}`);
            console.warn(`   Trailing Activation: ${trailingStop.activateMode === 'trail-rr' ? 'at profit level' : 'at pip distance'}`);
            console.warn(`   💡 TIP: For predictable behavior, enable only ONE breakeven system at a time.`);
            
            this.showNotification(
                `⚠️ Both Auto BE & Trailing Stop enabled - Only one will activate (whichever triggers first)`,
                'warning',
                5000
            );
        }
        
        // Calculate ACTUAL risk from final quantity and SL distance
        // This is the source of truth regardless of what's in input fields
        let actualRisk = 0;
        if (slEnabled && slPrice > 0) {
            const slDistance = Math.abs(entryPrice - slPrice);
            const slDistanceInPips = slDistance / this.pipSize;
            actualRisk = slDistanceInPips * quantity * this.pipValuePerLot;
        }
        
        // Get risk amount from inputs (for display/logging only)
        let inputRiskAmount = 0;
        if (this.positionSizeMode === 'risk-usd') {
            inputRiskAmount = parseFloat(document.getElementById('riskAmountUSD')?.value || 0);
        } else if (this.positionSizeMode === 'risk-percent') {
            const riskPercent = parseFloat(document.getElementById('riskAmountPercent')?.value || 0);
            const balanceType = document.querySelector('input[name="balanceType"]:checked')?.value || 'current';
            const balance = balanceType === 'current' ? this.balance : this.initialBalance;
            inputRiskAmount = (balance * riskPercent) / 100;
        } else if (this.positionSizeMode === 'lot-size') {
            inputRiskAmount = actualRisk; // For lot-size mode, input = actual
        }
        
        // Use actualRisk as the definitive risk amount
        const riskAmount = actualRisk;
        
        // VALIDATION: Check for order logic errors
        const orderValidationBox = document.getElementById('orderValidation');
        const validationErrors = this.validateOrder(this.orderType, this.orderSide, entryPrice, currentPrice, slPrice, tpPrice, quantity, this.positionSizeMode, slEnabled);
        if (orderValidationBox) {
            if (validationErrors.length > 0) {
                orderValidationBox.className = 'order-validation order-validation--error';
                orderValidationBox.innerHTML = validationErrors.map(msg => `
                    <div class="order-validation__item">
                        <span class="order-validation__icon">⚠️</span>
                        <span>${msg}</span>
                    </div>
                `).join('');
            } else {
                orderValidationBox.className = 'order-validation';
                orderValidationBox.innerHTML = '';
            }
        }

        if (validationErrors.length > 0) {
            console.warn('❌ Order validation failed:', validationErrors);
            return;
        }
        
        if (this.editingPendingOrderId && (this.orderType === 'limit' || this.orderType === 'stop')) {
            const pendingOrder = this.pendingOrders.find(o => o.id === this.editingPendingOrderId);
            if (!pendingOrder) {
                console.warn(`⚠️ Pending order #${this.editingPendingOrderId} not found for editing`);
            } else {
                pendingOrder.orderType = this.orderType;
                pendingOrder.direction = this.orderSide;
                pendingOrder.entryPrice = entryPrice;
                pendingOrder.quantity = quantity;
                pendingOrder.takeProfit = tpPrice > 0 ? tpPrice : null;
                pendingOrder.stopLoss = slPrice > 0 ? slPrice : null;
                pendingOrder.riskAmount = riskAmount;
                pendingOrder.autoBreakeven = autoBreakeven;
                pendingOrder.breakevenSettings = autoBreakeven ? breakevenSettings : null;

                this.removePendingOrderLine(pendingOrder.id);
                this.removePendingSLTPLines(pendingOrder.id);
                this.drawPendingOrderLine(pendingOrder);
                this.drawPendingOrderTargets(pendingOrder);

                const orderTypeLabel = this.orderType === 'limit' ? 'Limit' : 'Stop';
                this.showNotification(`✏️ ${orderTypeLabel} ${this.orderSide} Order #${pendingOrder.id} updated`, 'info');
                this.updatePositionsPanel();
                this.showPositionsPanel();
            }

            this.toggleOrderPanel();
            return;
        }

        // Log order details with risk validation
        console.log(`📊 ${this.orderType.toUpperCase()} ${this.orderSide} Order:`);
        console.log(`   Entry: ${entryPrice.toFixed(5)} | TP: ${tpPrice.toFixed(5)} | SL: ${slPrice.toFixed(5)}`);
        console.log(`   Quantity: ${quantity.toFixed(2)} lots`);
        console.log(`   Risk (input field): $${inputRiskAmount.toFixed(2)}`);
        console.log(`   Risk (actual from qty×SL): $${actualRisk.toFixed(2)}`);
        console.log(`   Pip Size: ${this.pipSize} | Pip Value/Lot: $${this.pipValuePerLot}`);
        if (Math.abs(actualRisk - inputRiskAmount) > 0.01) {
            console.warn(`   ⚠️ INPUT MISMATCH! Field shows $${inputRiskAmount.toFixed(2)} but actual is $${actualRisk.toFixed(2)}`);
            console.warn(`   → Using ACTUAL risk ($${actualRisk.toFixed(2)}) for order`);
        }
        
        // Remove preview lines before placing order
        this.removePreviewLines();
        
        // Check if prop firm trading is disabled due to rule violation
        if (window.propFirmTracker && window.propFirmTracker.tradingDisabled) {
            console.error('🚫 Trading is disabled due to prop firm rule violation');
            this.showNotification('❌ Trading Disabled - Challenge rule violated', 'error');
            return;
        }
        
        // For market orders: execute immediately
        // For limit/stop orders: add to pending orders
        if (this.orderType === 'limit' || this.orderType === 'stop') {
            // Check if we have split entries
            if (this.splitEntriesEnabled && this.splitEntries.length > 0) {
                console.log(`📊 Split entries detected! Placing ${this.splitEntries.length + 1} pending orders`);
                
                // Calculate main entry percentage
                const mainEntryPercent = this.getMainEntryPercentage() / 100;
                const mainEntryQuantity = quantity * mainEntryPercent;
                const mainEntryRisk = actualRisk * mainEntryPercent;
                
                // Create a split group ID to link all split orders
                const splitGroupId = `split_${Date.now()}`;
                
                // Deep clone functions to avoid shared reference issues between split orders
                const cloneTpTargets = (targets) => {
                    if (!targets || targets.length === 0) return targets;
                    return targets.map(t => ({ ...t, hit: false })); // Clone and reset hit flag
                };
                
                const cloneBreakevenSettings = (settings) => {
                    if (!settings) return settings;
                    return { ...settings, triggered: false }; // Clone and reset triggered flag
                };
                
                const cloneTrailingStop = (ts) => {
                    if (!ts) return ts;
                    return { ...ts, activated: false, currentStep: 0 }; // Clone and reset state
                };
                
                // Place main entry order (uses main orderType)
                this.placePendingOrderWithSplit(
                    entryPrice, 
                    mainEntryQuantity, 
                    tpPrice, 
                    slPrice, 
                    mainEntryRisk, 
                    autoBreakeven, 
                    cloneBreakevenSettings(breakevenSettings), // Clone to avoid shared state
                    cloneTrailingStop(trailingStop), // Clone to avoid shared state
                    cloneTpTargets(tpTargets), // Clone tpTargets for this order
                    currentCandle.t,
                    splitGroupId,
                    1,
                    this.splitEntries.length + 1,
                    this.orderType // Main entry uses main order type
                );
                
                // Place split entry orders (each with its own orderType)
                this.splitEntries.forEach((splitEntry, index) => {
                    const splitPercent = splitEntry.percentage / 100;
                    const splitQuantity = quantity * splitPercent;
                    const splitRisk = actualRisk * splitPercent;
                    
                    // Use split entry's order type (may be different from main)
                    const splitOrderType = splitEntry.orderType || this.orderType;
                    
                    this.placePendingOrderWithSplit(
                        splitEntry.price,
                        splitQuantity,
                        tpPrice,
                        slPrice,
                        splitRisk,
                        autoBreakeven,
                        cloneBreakevenSettings(breakevenSettings), // Clone to avoid shared state
                        cloneTrailingStop(trailingStop), // Clone to avoid shared state
                        cloneTpTargets(tpTargets), // Clone tpTargets for each split order
                        currentCandle.t,
                        splitGroupId,
                        index + 2,
                        this.splitEntries.length + 1,
                        splitOrderType // Pass the split entry's order type
                    );
                });
                
                // Show notification before clearing (to get correct count)
                const totalSplitOrders = this.splitEntries.length + 1;
                this.showNotification(`📋 ${totalSplitOrders} Split Orders placed successfully`, 'success');
                
                // Clear split entries after placing orders
                this.clearSplitEntries();
                
                // Show positions panel and close order panel
                this.showPositionsPanel();
                this.toggleOrderPanel();
            } else {
                // No splits - place single order as normal
                this.placePendingOrder(entryPrice, quantity, tpPrice, slPrice, actualRisk, autoBreakeven, breakevenSettings, trailingStop, tpTargets, currentCandle.t);
            }
            return;
        }
        
        // Market order: execute immediately
        const order = {
            id: this.orderIdCounter++,
            type: this.orderSide,
            openPrice: entryPrice,
            openTime: currentCandle.t,
            quantity: quantity,
            originalQuantity: quantity, // Store original quantity for journal (before partial closes)
            riskAmount: actualRisk, // Store the ACTUAL calculated risk
            originalRiskAmount: actualRisk, // Also store original for R-multiple after trailing
            status: 'OPEN',
            stopLoss: slPrice > 0 ? slPrice : null,
            takeProfit: tpPrice > 0 ? tpPrice : null,
            autoBreakeven: autoBreakeven,
            breakevenSettings: breakevenSettings,
            // MFE/MAE tracking (price levels, not dollar amounts)
            highestPrice: entryPrice,
            lowestPrice: entryPrice,
            mfe: entryPrice, // Max Favorable Excursion (price level)
            mae: entryPrice, // Max Adverse Excursion (price level)
            mfeTime: currentCandle.t, // Timestamp when MFE occurred
            maeTime: currentCandle.t, // Timestamp when MAE occurred
            mfeMaeTrackingEndTime: currentCandle.t + (this.mfeMaeTrackingHours * 60 * 60 * 1000), // End time for MFE/MAE tracking
            trailingStop: trailingStop, // Trailing stop settings
            tpTargets: tpTargets, // Multiple TP targets
            partialCloses: [], // Track partial closes for multiple TPs
            partialClosePnL: 0 // Cumulative P&L from partial closes
        };
        
        console.log(`📋 Order #${order.id} created with:`);
        console.log(`   Entry: ${entryPrice.toFixed(5)}, SL: ${slPrice.toFixed(5)}, TP: ${tpPrice.toFixed(5)}`);
        console.log(`   tpTargets:`, tpTargets);
        console.log(`   autoBreakeven: ${autoBreakeven}, breakevenSettings:`, breakevenSettings);
        
        // Calculate and log BE trigger price for comparison
        if (autoBreakeven && breakevenSettings && slPrice > 0) {
            let beTriggerPrice = 0;
            if (breakevenSettings.mode === 'pips') {
                const profitPrice = breakevenSettings.value * this.pipSize;
                beTriggerPrice = this.orderSide === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            } else {
                const profitPips = breakevenSettings.value / (quantity * this.pipValuePerLot);
                const profitPrice = profitPips * this.pipSize;
                beTriggerPrice = this.orderSide === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            }
            console.log(`   🟠 BE Trigger Price: ${beTriggerPrice.toFixed(5)}`);
            
            // Check if any TP target matches BE trigger price
            if (tpTargets && tpTargets.length > 0) {
                tpTargets.forEach((target, index) => {
                    const priceDiff = Math.abs(target.price - beTriggerPrice);
                    if (priceDiff < 0.00001) { // Within 1 pip
                        console.warn(`   ⚠️⚠️⚠️ WARNING: TP Target ${index + 1} (${target.price.toFixed(5)}) matches BE trigger price! This will close position instead of moving SL!`);
                    }
                });
            }
        }
        
        // ═══ POSITION SCALING ═══
        // If checkbox was checked, apply scaling to group with existing position
        if (this.enablePositionScaling && this.scaleNextOrder) {
            console.log(`\n🎯 SCALING ENABLED for order #${order.id}`);
            this.applyScaling(order);
            this.scaleNextOrder = false; // Reset flag
        } else {
            console.log(`📊 Scaling not requested for order #${order.id}`);
        }

        if (this.orderService) {
            this.orderService.registerOpenOrder(order);
        } else {
            if (this.orderService) {
                this.orderService.registerOpenOrder(order);
            } else {
                this.openPositions.push(order);
                this.orders.push(order);
            }
        }
        
        console.log(`✅ ${this.orderSide} order opened: #${order.id} @ $${entryPrice.toFixed(5)}`);
        console.log(`   SL: ${order.stopLoss ? '$' + order.stopLoss.toFixed(5) : 'none'} | TP: ${order.takeProfit ? '$' + order.takeProfit.toFixed(5) : 'none'}`);
        
        // Show notification
        this.showNotification(`${this.orderSide === 'BUY' ? '📈' : '📉'} ${this.orderSide} Order #${order.id} opened @ ${entryPrice.toFixed(5)}`, 'info');
        
        // Play order execution sound
        this.playOrderSound(this.orderSide.toLowerCase());
        
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        
        // Draw entry marker after a short delay to ensure chart is rendered
        setTimeout(() => {
            this.drawEntryMarker(order);
        }, 100);
        
        // Start screenshot capture immediately and store promise for later await
        if (window.screenshotManager) {
            order.screenshotPromise = window.screenshotManager.captureChartSnapshot().then(screenshot => {
                if (screenshot) {
                    order.entryScreenshot = screenshot;
                    console.log('✅ Entry screenshot captured for order #' + order.id);
                }
                return screenshot;
            }).catch(err => {
                console.error('❌ Failed to capture entry screenshot:', err);
                return null;
            });
        }
        
        this.updatePositionsPanel();
        this.showPositionsPanel();
        
        // Close panel
        this.toggleOrderPanel();
        
        // Show trade journal modal for entry notes
        this.showTradeJournalModal(order, false, null);
    }
    
    /**
     * Place a pending order (Limit or Stop)
     */
    placePendingOrder(entryPrice, quantity, tpPrice, slPrice, riskAmount, autoBreakeven, breakevenSettings, trailingStop, tpTargets, timestamp) {
        const pendingOrder = {
            id: this.orderIdCounter++,
            symbol: this.symbol || 'USD',
            orderType: this.orderType, // 'limit' or 'stop'
            direction: this.orderSide, // 'BUY' or 'SELL'
            entryPrice: entryPrice,
            quantity: quantity,
            takeProfit: tpPrice > 0 ? tpPrice : null,
            stopLoss: slPrice > 0 ? slPrice : null,
            riskAmount: riskAmount,
            originalRiskAmount: riskAmount, // Store original for R-multiple calculation
            autoBreakeven: autoBreakeven,
            breakevenSettings: breakevenSettings,
            trailingStop: trailingStop,
            tpTargets: tpTargets,
            placedTime: timestamp,
            status: 'PENDING',
            // Store scaling intent for when order executes
            scaleWithExisting: this.scaleNextOrder
        };
        
        // Reset scaling flag after storing
        if (this.scaleNextOrder) {
            console.log(`📊 Pending order #${pendingOrder.id} will scale with existing position when executed`);
            this.scaleNextOrder = false;
        }

        if (this.orderService) {
            this.orderService.registerPendingOrder(pendingOrder);
        } else {
            this.pendingOrders.push(pendingOrder);
        }
        console.log(`📋 ${this.orderType.toUpperCase()} ${this.orderSide} Order #${pendingOrder.id} placed @ ${entryPrice.toFixed(5)} (PENDING)`);
        
        // Show notification
        const orderTypeLabel = this.orderType === 'limit' ? 'Limit' : 'Stop';
        this.showNotification(`📋 ${orderTypeLabel} ${this.orderSide} Order #${pendingOrder.id} placed @ ${entryPrice.toFixed(5)}`, 'info');
        
        // Draw pending order line and targets
        this.drawPendingOrderLine(pendingOrder);
        this.drawPendingOrderTargets(pendingOrder);
        this.positionPendingOrderTargets();

        this.updatePositionsPanel();
        this.showPositionsPanel();
        
        // Close panel
        this.toggleOrderPanel();
    }
    
    /**
     * Place a pending order as part of a split entry group
     */
    placePendingOrderWithSplit(entryPrice, quantity, tpPrice, slPrice, riskAmount, autoBreakeven, breakevenSettings, trailingStop, tpTargets, timestamp, splitGroupId, splitIndex, splitTotal, orderType = null) {
        // Use provided orderType or fall back to main orderType
        const effectiveOrderType = orderType || this.orderType;
        
        const pendingOrder = {
            id: this.orderIdCounter++,
            symbol: this.symbol || 'USD',
            orderType: effectiveOrderType, // 'limit' or 'stop' - now uses split entry's type
            direction: this.orderSide, // 'BUY' or 'SELL'
            entryPrice: entryPrice,
            quantity: quantity,
            takeProfit: tpPrice > 0 ? tpPrice : null,
            stopLoss: slPrice > 0 ? slPrice : null,
            riskAmount: riskAmount,
            originalRiskAmount: riskAmount, // Store original for R-multiple calculation
            autoBreakeven: autoBreakeven,
            breakevenSettings: breakevenSettings,
            trailingStop: trailingStop,
            tpTargets: tpTargets,
            placedTime: timestamp,
            status: 'PENDING',
            // Split entry information
            splitGroupId: splitGroupId,
            splitIndex: splitIndex,
            splitTotal: splitTotal,
            isSplitEntry: true,
            // Store scaling intent for when order executes
            scaleWithExisting: this.scaleNextOrder
        };

        if (this.orderService) {
            this.orderService.registerPendingOrder(pendingOrder);
        } else {
            this.pendingOrders.push(pendingOrder);
        }
        
        console.log(`📋 SPLIT ${splitIndex}/${splitTotal}: ${effectiveOrderType.toUpperCase()} ${this.orderSide} Order #${pendingOrder.id} @ ${entryPrice.toFixed(5)} (${quantity.toFixed(2)} lots)`);
        
        // DEBUG: Log tpTargets to verify they're stored correctly
        if (tpTargets && tpTargets.length > 0) {
            console.log(`   📊 tpTargets for pending order #${pendingOrder.id}:`);
            tpTargets.forEach((t, i) => {
                console.log(`      TP${i+1}: id=${t.id}, price=${t.price?.toFixed(5)}, percentage=${t.percentage}%, hit=${t.hit}`);
            });
        } else {
            console.log(`   ⚠️ No tpTargets - will use single TP at ${tpPrice}`);
        }
        
        // Draw pending order line and targets
        this.drawPendingOrderLine(pendingOrder);
        this.drawPendingOrderTargets(pendingOrder);
        this.positionPendingOrderTargets();

        this.updatePositionsPanel();
        
        // Don't show panel or close order panel here - that happens in the main function
    }
    
    /**
     * Place order from drawing tool (Long/Short Position tool)
     * Uses the same flow as regular orders for journal collection
     * Automatically detects order type based on current price vs entry price
     */
    placeOrderFromDrawingTool(toolData) {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        console.log(`🎨 Placing order from ${toolData.toolType} drawing tool`);
        
        // Use tool data
        this.orderSide = toolData.side;
        const entryPrice = toolData.entryPrice;
        const currentPrice = currentCandle.c;
        const tpPrice = toolData.takeProfit || 0;
        const slPrice = toolData.stopLoss || 0;
        const quantity = toolData.quantity || 0.01;
        const riskAmount = toolData.riskAmount || 100;
        
        // AUTO-DETECT ORDER TYPE based on current price vs entry price
        let orderType = 'market';
        const priceDiff = Math.abs(entryPrice - currentPrice);
        const threshold = currentPrice * 0.0001; // 0.01% threshold (about 1 pip)
        
        console.log(`🎨 Drawing Tool Order Detection:`);
        console.log(`   💰 Current Price: ${currentPrice.toFixed(5)}`);
        console.log(`   🎯 Entry Price: ${entryPrice.toFixed(5)}`);
        console.log(`   📏 Price Difference: ${priceDiff.toFixed(5)} (threshold: ${threshold.toFixed(5)})`);
        console.log(`   🔄 Side: ${this.orderSide}`);
        
        if (priceDiff > threshold) {
            // Use proper forex order type logic
            if (this.orderSide === 'BUY') {
                // BUY LIMIT: Entry below current (buy at lower price)
                // BUY STOP: Entry above current (breakout buy)
                orderType = entryPrice < currentPrice ? 'limit' : 'stop';
                console.log(`   🔍 BUY order: entry ${entryPrice < currentPrice ? 'below' : 'above'} current → ${orderType.toUpperCase()}`);
            } else {
                // SELL LIMIT: Entry above current (sell at higher price)
                // SELL STOP: Entry below current (sell at lower price)
                orderType = entryPrice > currentPrice ? 'limit' : 'stop';
                console.log(`   🔍 SELL order: entry ${entryPrice > currentPrice ? 'above' : 'below'} current → ${orderType.toUpperCase()}`);
            }
        } else {
            console.log(`   ⚡ Price difference within threshold → MARKET order`);
        }
        
        console.log(`   📊 Final order type: ${orderType.toUpperCase()}`);
        
        // Validate the order with detected type
        const orderValidationBox = document.getElementById('orderValidation');
        const validationErrors = this.validateOrder(orderType, this.orderSide, entryPrice, currentPrice, slPrice, tpPrice);
        if (orderValidationBox) {
            if (validationErrors.length > 0) {
                orderValidationBox.className = 'order-validation order-validation--error';
                orderValidationBox.innerHTML = validationErrors.map(msg => `
                    <div class="order-validation__item">
                        <span class="order-validation__icon">⚠️</span>
                        <span>${msg}</span>
                    </div>
                `).join('');
            } else {
                orderValidationBox.className = 'order-validation';
                orderValidationBox.innerHTML = '';
            }
        }

        if (validationErrors.length > 0) {
            console.warn('❌ Order validation failed:', validationErrors);
            return;
        }
        
        // Handle PENDING ORDERS (Limit/Stop) vs MARKET orders
        if (orderType === 'limit' || orderType === 'stop') {
            // Create PENDING order
            const pendingOrder = {
                id: this.orderIdCounter++,
                orderType: orderType,
                direction: this.orderSide,
                entryPrice: entryPrice,
                quantity: quantity,
                takeProfit: tpPrice > 0 ? tpPrice : null,
                stopLoss: slPrice > 0 ? slPrice : null,
                riskAmount: riskAmount,
                autoBreakeven: false,
                breakevenSettings: null,
                placedTime: currentCandle.t,
                status: 'PENDING',
                createdFromTool: true,
                toolType: toolData.toolType
            };
            
            this.pendingOrders.push(pendingOrder);
            
            const orderTypeLabel = orderType === 'limit' ? 'Limit' : 'Stop';
            console.log(`📋 ${orderTypeLabel} ${this.orderSide} Order #${pendingOrder.id} placed from tool @ ${entryPrice.toFixed(5)} (PENDING)`);
            this.showNotification(`🎨 ${orderTypeLabel} ${this.orderSide} Order #${pendingOrder.id} placed from drawing tool @ ${entryPrice.toFixed(5)}`, 'info');
            
            // Draw pending order line + targets
            this.drawPendingOrderLine(pendingOrder);
            this.drawPendingOrderTargets(pendingOrder);
            
            this.updatePositionsPanel();
            this.showPositionsPanel();
            
        } else {
            // Create MARKET order (immediate execution)
            const order = {
                id: this.orderIdCounter++,
                type: this.orderSide,
                openPrice: entryPrice,
                openTime: currentCandle.t,
                quantity: quantity,
                riskAmount: riskAmount,
                originalRiskAmount: riskAmount, // Store original for R-multiple
                status: 'OPEN',
                stopLoss: slPrice > 0 ? slPrice : null,
                takeProfit: tpPrice > 0 ? tpPrice : null,
                autoBreakeven: false,
                breakevenSettings: null,
                // MFE/MAE tracking
                highestPrice: entryPrice,
                lowestPrice: entryPrice,
                mfe: entryPrice,
                mae: entryPrice,
                mfeTime: currentCandle.t,
                maeTime: currentCandle.t,
                mfeMaeTrackingEndTime: currentCandle.t + (this.mfeMaeTrackingHours * 60 * 60 * 1000),
                // Mark as created from drawing tool
                createdFromTool: true,
                toolType: toolData.toolType
            };
            
            // ═══ POSITION SCALING ═══
            if (this.enablePositionScaling && this.scaleNextOrder) {
                console.log(`\n🎯 SCALING ENABLED for drawing tool order #${order.id}`);
                this.applyScaling(order);
                this.scaleNextOrder = false;
            }
            
            if (this.orderService) {
                this.orderService.registerOpenOrder(order);
            } else {
                this.openPositions.push(order);
                this.orders.push(order);
            }
            
            console.log(`✅ ${this.orderSide} MARKET order opened from tool: #${order.id} @ ${entryPrice.toFixed(5)}`);
            this.showNotification(`🎨 ${this.orderSide} Order #${order.id} placed from drawing tool @ ${entryPrice.toFixed(5)}`, 'success');
            
            // Draw order lines on chart
            this.drawOrderLine(order);
            if (order.stopLoss || order.takeProfit) {
                this.drawSLTPLines(order);
            }
            
            // Draw entry marker with screenshot after a delay
            setTimeout(() => {
                this.drawEntryMarker(order);
                
                // Capture screenshot after entry marker is drawn
                setTimeout(() => {
                    console.log('📸 Checking screenshot manager for drawing tool order...');
                    
                    // Use window.screenshotManager (global instance) or this.screenshotManager
                    const screenshotMgr = window.screenshotManager || this.screenshotManager;
                    
                    // If screenshot manager not initialized, try to initialize it now
                    if (!screenshotMgr && typeof ScreenshotManager !== 'undefined' && window.chart) {
                        console.log('🔧 Screenshot manager missing, initializing now...');
                        window.screenshotManager = new ScreenshotManager(window.chart);
                    }
                    
                    const finalScreenshotMgr = window.screenshotManager || this.screenshotManager;
                    
                    if (finalScreenshotMgr) {
                        console.log('📸 Capturing screenshot for drawing tool order #' + order.id);
                        finalScreenshotMgr.captureChartSnapshot().then(imageData => {
                            order.entryScreenshot = imageData;
                            console.log('✅ Entry screenshot captured for drawing tool order #' + order.id);
                            
                            // IMPORTANT: Show journal modal AFTER screenshot is captured
                            this.showTradeJournalModal(order, false, null);
                        }).catch(err => {
                            console.error('❌ Failed to capture entry screenshot:', err);
                            // Still show modal even if screenshot fails
                            this.showTradeJournalModal(order, false, null);
                        });
                    } else {
                        console.error('❌ Screenshot manager not available after initialization attempt!');
                        // Show modal anyway if no screenshot manager
                        this.showTradeJournalModal(order, false, null);
                    }
                }, 300);
            }, 100);
            
            this.updatePositionsPanel();
            this.showPositionsPanel();
        }
    }
    
    /**
     * Place order from panel (legacy method for compatibility)
     */
    placeOrderFromPanel() {
        this.placeAdvancedOrder();
    }
    
    /**
     * Open buy order from panel
     */
    openBuyOrderFromPanel() {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || currentCandle.c);
        const tpValue = parseFloat(document.getElementById('orderTP')?.value || 100);  // Default 100 pips
        const slValue = parseFloat(document.getElementById('orderSL')?.value || 50);   // Default 50 pips
        const tpType = document.getElementById('tpType')?.value || 'pips';
        const slType = document.getElementById('slType')?.value || 'pips';
        
        console.log(`📊 BUY Order inputs: Entry=${entryPrice.toFixed(5)}, TP=${tpValue} ${tpType}, SL=${slValue} ${slType}`);
        
        const timestamp = currentCandle.t;
        
        // Calculate TP/SL prices
        let tpPrice = 0;
        let slPrice = 0;
        
        if (tpType === 'price') {
            tpPrice = tpValue;
        } else if (tpType === 'pips') {
            tpPrice = entryPrice + (tpValue * this.pipSize);
        } else if (tpType === 'percent') {
            tpPrice = entryPrice * (1 + tpValue / 100);
        }
        
        if (slType === 'price') {
            slPrice = slValue;
        } else if (slType === 'pips') {
            slPrice = entryPrice - (slValue * this.pipSize);
        } else if (slType === 'percent') {
            slPrice = entryPrice * (1 - slValue / 100);
        }
        
        console.log(`💰 Calculated prices: Entry=${entryPrice.toFixed(5)}, TP=${tpPrice.toFixed(5)}, SL=${slPrice.toFixed(5)}`);
        
        const order = {
            id: this.orderIdCounter++,
            type: 'BUY',
            openPrice: entryPrice,
            openTime: timestamp,
            quantity: quantity,
            status: 'OPEN',
            stopLoss: slPrice > 0 ? slPrice : null,
            takeProfit: tpPrice > 0 ? tpPrice : null
        };
        
        if (this.orderService) {
            this.orderService.registerOpenOrder(order);
        } else {
            this.openPositions.push(order);
            this.orders.push(order);
        }
        
        console.log(`✅ BUY order opened: #${order.id} @ $${entryPrice.toFixed(2)}`);
        console.log(`   SL: ${order.stopLoss ? '$' + order.stopLoss.toFixed(2) : 'null'} | TP: ${order.takeProfit ? '$' + order.takeProfit.toFixed(2) : 'null'}`);
        
        // Show notification
        this.showNotification(`📈 BUY Order #${order.id} opened @ ${entryPrice.toFixed(5)}`, 'info');
        
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        
        // Draw entry marker after a short delay to ensure chart is rendered
        console.log('⏰ Scheduling drawEntryMarker for order #' + order.id);
        setTimeout(() => {
            console.log('⏰ setTimeout fired! Calling drawEntryMarker for order #' + order.id);
            this.drawEntryMarker(order);
        }, 100);
        
        this.updatePositionsPanel();
        this.showPositionsPanel();
    }
    
    /**
     * Open sell order from panel
     */
    openSellOrderFromPanel() {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        const quantity = parseFloat(document.getElementById('orderQuantity')?.value || 1);
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || currentCandle.c);
        const tpValue = parseFloat(document.getElementById('orderTP')?.value || 0);
        const slValue = parseFloat(document.getElementById('orderSL')?.value || 0);
        const tpType = document.getElementById('tpType')?.value || 'price';
        const slType = document.getElementById('slType')?.value || 'price';
        
        const timestamp = currentCandle.t;
        
        // Calculate TP/SL prices
        let tpPrice = 0;
        let slPrice = 0;
        
        if (tpType === 'price') {
            tpPrice = tpValue;
        } else if (tpType === 'pips') {
            tpPrice = entryPrice - (tpValue * this.pipSize);
        } else if (tpType === 'percent') {
            tpPrice = entryPrice * (1 - tpValue / 100);
        }
        
        if (slType === 'price') {
            slPrice = slValue;
        } else if (slType === 'pips') {
            slPrice = entryPrice + (slValue * this.pipSize);
        } else if (slType === 'percent') {
            slPrice = entryPrice * (1 + slValue / 100);
        }
        
        const order = {
            id: this.orderIdCounter++,
            type: 'SELL',
            openPrice: entryPrice,
            openTime: timestamp,
            quantity: quantity,
            status: 'OPEN',
            stopLoss: slPrice > 0 ? slPrice : null,
            takeProfit: tpPrice > 0 ? tpPrice : null
        };
        
        if (this.orderService) {
            this.orderService.registerOpenOrder(order);
        } else {
            if (this.orderService) {
                this.orderService.registerOpenOrder(order);
            } else {
                this.openPositions.push(order);
                this.orders.push(order);
            }
        }
        
        console.log(`✅ SELL order opened: #${order.id} @ $${entryPrice.toFixed(2)}`);
        console.log(`   SL: ${order.stopLoss ? '$' + order.stopLoss.toFixed(2) : 'null'} | TP: ${order.takeProfit ? '$' + order.takeProfit.toFixed(2) : 'null'}`);
        
        // Show notification
        this.showNotification(`📉 SELL Order #${order.id} opened @ ${entryPrice.toFixed(5)}`, 'info');
        
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        
        // Draw entry marker after a short delay to ensure chart is rendered
        console.log('⏰ Scheduling drawEntryMarker for order #' + order.id);
        setTimeout(() => {
            console.log('⏰ setTimeout fired! Calling drawEntryMarker for order #' + order.id);
            this.drawEntryMarker(order);
        }, 100);
        
        this.updatePositionsPanel();
        this.showPositionsPanel();
    }
    
    /**
     * Open a quick buy order (for hotkeys/quick actions)
     */
    openBuyOrder() {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        const price = currentCandle.c;
        const timestamp = currentCandle.t;
        
        // Calculate default SL/TP (50 pips below/above for BUY)
        const pipSize = price * 0.001; // 0.1%
        const defaultSL = price - (50 * pipSize);
        const defaultTP = price + (100 * pipSize);
        
        const order = {
            id: this.orderIdCounter++,
            type: 'BUY',
            openPrice: price,
            openTime: timestamp,
            quantity: 1,
            status: 'OPEN',
            stopLoss: defaultSL,
            takeProfit: defaultTP
        };
        
        if (this.orderService) {
            this.orderService.registerOpenOrder(order);
        } else {
            if (this.orderService) {
                this.orderService.registerOpenOrder(order);
            } else {
                this.openPositions.push(order);
                this.orders.push(order);
            }
        }
        
        console.log(`✅ BUY order opened: #${order.id} @ $${price.toFixed(2)}`);
        console.log(`   SL: $${defaultSL.toFixed(2)} | TP: $${defaultTP.toFixed(2)}`);
        
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        this.updatePositionsPanel();
        this.showPositionsPanel();
    }
    
    /**
     * Open a quick sell order (for hotkeys/quick actions)
     */
    openSellOrder() {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        const price = currentCandle.c;
        const timestamp = currentCandle.t;
        
        // Calculate default SL/TP (50 pips above/below for SELL)
        const pipSize = price * 0.001; // 0.1%
        const defaultSL = price + (50 * pipSize);
        const defaultTP = price - (100 * pipSize);
        
        const order = {
            id: this.orderIdCounter++,
            type: 'SELL',
            openPrice: price,
            openTime: timestamp,
            quantity: 1,
            status: 'OPEN',
            stopLoss: defaultSL,
            takeProfit: defaultTP
        };
        
        if (this.orderService) {
            this.orderService.registerOpenOrder(order);
        } else {
            this.openPositions.push(order);
            this.orders.push(order);
        }
        
        console.log(`✅ SELL order opened: #${order.id} @ $${price.toFixed(2)}`);
        console.log(`   SL: $${defaultSL.toFixed(2)} | TP: $${defaultTP.toFixed(2)}`);
        
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        this.updatePositionsPanel();
        this.showPositionsPanel();
    }
    
    /**
     * Setup trading panel in right sidebar
     */
    setupTradingPanel() {
        this.currentTab = 'details'; // Track active tab
        
        // Set up tab switching
        const detailsTab = document.getElementById('tradingDetailsTab');
        const journalTab = document.getElementById('tradingJournalTab');
        
        if (detailsTab) {
            detailsTab.onclick = () => this.switchTab('details');
        }
        if (journalTab) {
            journalTab.onclick = () => this.switchTab('journal');
        }
        
        // Set up close button
        const closeBtn = document.getElementById('closeTradingPanel');
        if (closeBtn) {
            closeBtn.onclick = () => {
                const panel = document.getElementById('tradingPanel');
                const iconBtn = document.getElementById('tradingIconBtn');
                if (panel) panel.classList.remove('visible');
                if (iconBtn) iconBtn.classList.remove('active');
            };
        }
        
        // Set up icon button to toggle panel
        const iconBtn = document.getElementById('tradingIconBtn');
        if (iconBtn) {
            iconBtn.onclick = () => {
                const panel = document.getElementById('tradingPanel');
                const objectTreePanel = document.getElementById('objectTreePanel');
                const objectTreeBtn = document.getElementById('objectTreeIconBtn');
                
                // Close other panels
                if (objectTreePanel) objectTreePanel.classList.remove('visible');
                if (objectTreeBtn) objectTreeBtn.classList.remove('active');
                
                // Toggle trading panel
                if (panel) {
                    const isVisible = panel.classList.contains('visible');
                    if (isVisible) {
                        panel.classList.remove('visible');
                        iconBtn.classList.remove('active');
                    } else {
                        panel.classList.add('visible');
                        iconBtn.classList.add('active');
                    }
                }
            };
        }
        
        console.log('✅ Trading panel setup complete');
    }
    
    /**
     * Open a buy order at current price
     */
    openBuyOrder() {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        const price = currentCandle.c; // Close price
        const timestamp = currentCandle.t;
        
        // Calculate default SL/TP (50 pips below/above for BUY)
        const pipSize = price * 0.001; // 0.1%
        const defaultSL = price - (50 * pipSize);
        const defaultTP = price + (100 * pipSize);
        
        const order = {
            id: this.orderIdCounter++,
            type: 'BUY',
            openPrice: price,
            openTime: timestamp,
            quantity: 1, // Default quantity
            status: 'OPEN',
            stopLoss: defaultSL,
            takeProfit: defaultTP
        };
        
        if (this.orderService) {
            this.orderService.registerOpenOrder(order);
        } else {
            this.openPositions.push(order);
            this.orders.push(order);
        }
        
        console.log(`✅ BUY order opened: #${order.id} @ $${price.toFixed(2)}`);
        console.log(`   SL: $${defaultSL.toFixed(2)} | TP: $${defaultTP.toFixed(2)}`);
        
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        this.updatePositionsPanel();
        this.showPositionsPanel();
    }
    
    /**
     * Open a sell order at current price
     */
    openSellOrder() {
        if (!this.replaySystem || !this.replaySystem.isActive) {
            alert('Replay mode must be active to place orders');
            return;
        }
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) {
            alert('No price data available');
            return;
        }
        
        const price = currentCandle.c;
        const timestamp = currentCandle.t;
        
        // Calculate default SL/TP (50 pips above/below for SELL)
        const pipSize = price * 0.001; // 0.1%
        const defaultSL = price + (50 * pipSize);
        const defaultTP = price - (100 * pipSize);
        
        const order = {
            id: this.orderIdCounter++,
            type: 'SELL',
            openPrice: price,
            openTime: timestamp,
            quantity: 1,
            status: 'OPEN',
            stopLoss: defaultSL,
            takeProfit: defaultTP
        };
        
        this.openPositions.push(order);
        this.orders.push(order);
        
        console.log(`✅ SELL order opened: #${order.id} @ $${price.toFixed(2)}`);
        console.log(`   SL: $${defaultSL.toFixed(2)} | TP: $${defaultTP.toFixed(2)}`);
        
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        this.updatePositionsPanel();
        this.showPositionsPanel();
    }
    
    /**
     * Close a position
     */
    closePosition(orderId) {
        const position = this.openPositions.find(p => p.id === orderId);
        if (!position) return;
        
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) return;
        
        const closePrice = currentCandle.c;
        const closeTime = currentCandle.t;
        
        // Calculate P&L using pip values
        // P&L = (Price Difference in Pips) × Position Size (Lots) × Pip Value per Lot
        let priceDiff;
        if (position.type === 'BUY') {
            priceDiff = closePrice - position.openPrice;
        } else {
            priceDiff = position.openPrice - closePrice;
        }
        
        const pipsMove = priceDiff / this.pipSize;
        const pnl = pipsMove * position.quantity * this.pipValuePerLot;
        
        // Update position
        position.closePrice = closePrice;
        position.closeTime = closeTime;
        position.pnl = pnl;
        position.status = 'CLOSED';
        
        // Update balance
        this.balance += pnl;
        this.equity = this.balance;
        
        // Track prop firm progress
        if (window.propFirmTracker) {
            window.propFirmTracker.recordTrade({
                id: orderId,
                type: position.type,
                openPrice: position.openPrice,
                closePrice: closePrice,
                openTime: position.openTime,
                closeTime: closeTime,
                timestamp: closeTime,
                quantity: position.quantity,
                profit: pnl,
                pnl: pnl
            });
            window.propFirmTracker.updateBalance(this.balance);
        }
        
        // Move to closed positions
        this.openPositions = this.openPositions.filter(p => p.id !== orderId);
        this.closedPositions.push(position);
        
        console.log(`✅ Position closed: #${orderId} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
        
        // Play close sound
        this.playOrderSound('close');
        
        // ═══ SCALED TRADE CHECK ═══
        // If position is part of a group, check if all entries are now closed
        let scaledInfo = null;
        let isGroupComplete = false;
        
        if (position.tradeGroupId) {
            scaledInfo = this.scaledTrades.get(position.tradeGroupId);
            isGroupComplete = this.checkScaledGroupComplete(position);
            
            if (!isGroupComplete) {
                // Group still has open entries - don't create journal entry yet
                // BUT still remove ALL visual elements for THIS closed position
                console.log(`📊 Waiting for remaining entries in group #${position.tradeGroupId} to close`);
                console.log(`🧹 Removing all lines for closed position #${orderId}...`);
                this.removeOrderLine(orderId);
                this.removeSLTPLines(orderId);
                this.removeEntryMarker(orderId);
                // Force a chart redraw to ensure lines are visually removed
                if (this.chart && this.chart.render) {
                    this.chart.render();
                }
                this.updatePositionsPanel();
                this.updateJournalTab();
                return;
            }
            // Group is complete - will create aggregate journal entry below
            console.log(`📊 Creating aggregate journal entry for group #${position.tradeGroupId}`);
        }
        
        // IMPORTANT: Add to trade journal immediately (before showing modal)
        // Calculate additional metadata
        const openDate = new Date(position.openTime);
        const closeDate = new Date(closeTime);
        const holdingTimeMs = closeTime - position.openTime;
        const holdingTimeHours = (holdingTimeMs / (1000 * 60 * 60)).toFixed(2);
        
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        // Check if this is a SCALED trade (group just closed)
        let journalEntry;
        if (scaledInfo && scaledInfo.status === 'CLOSED') {
            // CREATE AGGREGATE JOURNAL ENTRY for scaled trade
            // Capture exit screenshot first
            let exitScreenshot = null;
            if (window.screenshotManager) {
                try {
                    exitScreenshot = window.screenshotManager.captureChart();
                    if (exitScreenshot) {
                        console.log('📸 Exit screenshot captured for scaled trade');
                    }
                } catch (err) {
                    console.warn('⚠️ Failed to capture exit screenshot:', err);
                }
            }
            
            journalEntry = this.createAggregateJournalEntry(scaledInfo, exitScreenshot);
            console.log(`📊 Created AGGREGATE journal entry for scaled trade group #${scaledInfo.groupId}:`);
            console.log(`   Entries: ${scaledInfo.entries.length}`);
            console.log(`   Total Qty: ${scaledInfo.totalQuantity.toFixed(2)} lots`);
            console.log(`   Avg Entry: ${scaledInfo.avgEntry.toFixed(5)}`);
            console.log(`   Total P&L: $${journalEntry.pnl.toFixed(2)}`);
        } else {
            // REGULAR SINGLE TRADE - normal journal entry
            // Calculate Reward:Risk ratio
            let rewardToRiskRatio = null;
            if (position.stopLoss && position.takeProfit) {
                const risk = Math.abs(position.openPrice - position.stopLoss);
                const reward = Math.abs(position.takeProfit - position.openPrice);
                rewardToRiskRatio = risk > 0 ? (reward / risk).toFixed(2) : null;
            }
            
            journalEntry = {
                id: position.id,
                tradeId: position.id,
                type: position.type,
                direction: position.type,
                symbol: position.symbol || 'USD',
                quantity: position.quantity,
                openPrice: position.openPrice,
                closePrice: closePrice,
                entryPrice: position.openPrice,
                exitPrice: closePrice,
                openTime: position.openTime,
                closeTime: closeTime,
                pnl: pnl,
                netPnL: pnl,
                realizedPnL: pnl,
                stopLoss: position.stopLoss,
                takeProfit: position.takeProfit,
                closeType: 'MANUAL',
                status: 'closed',
                entryScreenshot: position.entryScreenshot || null,
                exitScreenshot: null, // Will be captured below
                mfe: position.mfe || null,
                mae: position.mae || null,
                highestPrice: position.highestPrice || null,
                lowestPrice: position.lowestPrice || null,
                rMultiple: position.riskAmount ? (pnl / position.riskAmount) : null,
                riskAmount: position.riskAmount || 0,
                riskPerTrade: position.riskAmount || 0,
                rewardToRiskRatio: rewardToRiskRatio,
                // Time-based metadata
                holdingTimeHours: parseFloat(holdingTimeHours),
                dayOfWeek: dayNames[openDate.getDay()],
                hourOfEntry: openDate.getHours(),
                hourOfExit: closeDate.getHours(),
                month: monthNames[openDate.getMonth()],
                year: openDate.getFullYear(),
                // Default empty notes (will be updated if user fills out modal)
                preTradeNotes: position.preTradeNotes || {},
                postTradeNotes: {},
                tags: [],
                rulesFollowed: null,
                isScaledTrade: false
            };
            
        }
        
        // NOTE: Journal entry will be saved by showTradeJournalModal -> saveTradeToJournal
        // Store the pre-built journal entry on the position for the modal to use
        position.pendingJournalEntry = journalEntry;
        console.log(`📋 Prepared journal entry for position #${orderId} - will save after modal`)
        
        // Draw exit marker before removing lines
        this.drawExitMarker(position, {
            closePrice: closePrice,
            closeTime: closeTime,
            pnl: pnl,
            type: 'MANUAL'
        });
        
        this.removeEntryMarker(orderId);

        this.removeOrderLine(orderId);
        this.removeSLTPLines(orderId);
        
        // Clean up any preview lines that might be lingering
        this.removePreviewLines();
        
        // IMPORTANT: Clean up any pending orders with this ID (shouldn't exist but safety check)
        const hadPending = this.pendingOrders.some(p => p.id === orderId);
        if (hadPending) {
            const removedPending = this.orderService
                ? this.orderService.removePendingOrder(orderId)
                : (() => {
                    this.pendingOrders = this.pendingOrders.filter(p => p.id !== orderId);
                    return true;
                })();
            if (removedPending) {
                console.log(`🧹 Cleaned up orphaned pending order #${orderId}`);
            }
        }
        
        this.updatePositionsPanel();
        
        // Show trade journal modal for post-trade notes (modal will UPDATE the journal entry, not create it)
        this.showTradeJournalModal(position, true, {
            closePrice: closePrice,
            closeTime: closeTime,
            pnl: pnl,
            type: 'MANUAL'
        });
    }
    
    /**
     * Get current candle from replay
     */
    getCurrentCandle() {
        if (!this.chart.data || this.chart.data.length === 0) return null;
        
        // Get the last visible candle in replay mode
        if (this.replaySystem && this.replaySystem.isActive) {
            // Check if we're in tick animation mode - use the animated candle
            if (this.replaySystem.animatingCandle && this.replaySystem.isPlaying) {
                const anim = this.replaySystem.animatingCandle;
                return {
                    t: anim.t,
                    o: anim.open,
                    h: anim.high,
                    l: anim.low,
                    c: anim.close,
                    v: anim.volume
                };
            }
            
            // Otherwise use the raw data at current index
            const index = this.replaySystem.currentIndex;
            const rawData = this.replaySystem.fullRawData || this.chart.rawData;
            return rawData[index];
        }
        
        return this.chart.data[this.chart.data.length - 1];
    }
    
    /**
     * Update MFE/MAE tracking for closed positions
     */
    updateMfeMaeTracking(currentCandle, high, low) {
        if (this.mfeMaeTrackingPositions.length === 0) return;
        
        const completedTracking = [];
        
        this.mfeMaeTrackingPositions.forEach(position => {
            // Check if tracking window has expired
            if (currentCandle.t > position.mfeMaeTrackingEndTime) {
                completedTracking.push(position);
                return;
            }
            
            // Continue updating MFE/MAE (price levels)
            if (position.type === 'BUY') {
                if (high > position.highestPrice) {
                    position.highestPrice = high;
                    position.mfe = high; // Best price for BUY
                    position.mfeTime = currentCandle.t; // Track when MFE occurred
                }
                if (low < position.lowestPrice) {
                    position.lowestPrice = low;
                    position.mae = low; // Worst price for BUY
                    position.maeTime = currentCandle.t; // Track when MAE occurred
                }
            } else {
                if (low < position.lowestPrice) {
                    position.lowestPrice = low;
                    position.mfe = low; // Best price for SELL
                    position.mfeTime = currentCandle.t; // Track when MFE occurred
                }
                if (high > position.highestPrice) {
                    position.highestPrice = high;
                    position.mae = high; // Worst price for SELL
                    position.maeTime = currentCandle.t; // Track when MAE occurred
                }
            }
        });
        
        // Handle completed tracking
        completedTracking.forEach(position => {
            // Find the trade in journal and update it
            const journalIndex = this.tradeJournal.findIndex(t => t.tradeId === position.id || t.id === position.id);
            
            if (journalIndex !== -1) {
                // Update MFE/MAE in journal with final values and timestamps
                this.tradeJournal[journalIndex].mfe = position.mfe;
                this.tradeJournal[journalIndex].mae = position.mae;
                this.tradeJournal[journalIndex].mfeTime = position.mfeTime;
                this.tradeJournal[journalIndex].maeTime = position.maeTime;
                this.tradeJournal[journalIndex].highestPrice = position.highestPrice;
                this.tradeJournal[journalIndex].lowestPrice = position.lowestPrice;
                
                // Save updated journal
                this.persistJournal();
                
                // Update the journal tab display
                this.updateJournalTab();
                
                // Draw MFE/MAE markers on chart
                try {
                    this.drawMfeMaeMarkers(position);
                } catch (err) {
                    console.error('❌ Error drawing MFE/MAE markers:', err);
                }
                
                // Send notification
                this.showNotification(
                    `📊 MFE/MAE tracking complete for Order #${position.id} | MFE: ${position.mfe.toFixed(5)} | MAE: ${position.mae.toFixed(5)}`,
                    'info'
                );
                
                console.log(`✅ MFE/MAE tracking completed for Order #${position.id} | MFE: ${position.mfe.toFixed(5)} | MAE: ${position.mae.toFixed(5)}`);
            }
            
            // Remove from tracking array
            this.mfeMaeTrackingPositions = this.mfeMaeTrackingPositions.filter(p => p.id !== position.id);
        });
    }
    
    /**
     * Check and execute pending orders when price reaches them
     */
    checkPendingOrders(currentCandle) {
        if (this.pendingOrders.length === 0) return;
        
        const currentPrice = currentCandle.c;
        const high = currentCandle.h;
        const low = currentCandle.l;
        
        const ordersToExecute = [];
        const idsToRemove = [];
        
        this.pendingOrders.forEach(pendingOrder => {
            // Skip if not actually pending
            if (pendingOrder.status !== 'PENDING') {
                console.warn(`⚠️ Skipping non-pending order #${pendingOrder.id} with status: ${pendingOrder.status}`);
                idsToRemove.push(pendingOrder.id);
                return;
            }
            
            let shouldExecute = false;
            
            if (pendingOrder.orderType === 'limit') {
                // Limit BUY: executes when price drops TO or BELOW entry
                // Limit SELL: executes when price rises TO or ABOVE entry
                if (pendingOrder.direction === 'BUY' && low <= pendingOrder.entryPrice) {
                    shouldExecute = true;
                } else if (pendingOrder.direction === 'SELL' && high >= pendingOrder.entryPrice) {
                    shouldExecute = true;
                }
            } else if (pendingOrder.orderType === 'stop') {
                // Stop BUY: executes when price rises TO or ABOVE entry
                // Stop SELL: executes when price drops TO or BELOW entry
                if (pendingOrder.direction === 'BUY' && high >= pendingOrder.entryPrice) {
                    shouldExecute = true;
                } else if (pendingOrder.direction === 'SELL' && low <= pendingOrder.entryPrice) {
                    shouldExecute = true;
                }
            }
            
            if (shouldExecute) {
                ordersToExecute.push(pendingOrder);
                idsToRemove.push(pendingOrder.id);
            }
        });
        
        // IMPORTANT: Remove from pending array FIRST to prevent re-execution
        if (idsToRemove.length > 0) {
            if (this.orderService) {
                idsToRemove.forEach(id => this.orderService.removePendingOrder(id));
            } else {
                this.pendingOrders = this.pendingOrders.filter(o => !idsToRemove.includes(o.id));
            }
            console.log(`🗑️ Removed ${idsToRemove.length} order(s) from pending queue`);
        }
        
        // Then execute the triggered orders
        ordersToExecute.forEach(pendingOrder => {
            this.executePendingOrder(pendingOrder, currentCandle);
        });
    }
    
    /**
     * Execute a pending order
     */
    executePendingOrder(pendingOrder, currentCandle) {
        // REALISTIC GAP HANDLING: If there's a gap, order should execute at the candle's open price
        // not at the pending order price (which was never actually traded)
        const open = currentCandle.o;
        const high = currentCandle.h;
        const low = currentCandle.l;
        
        let executionPrice = pendingOrder.entryPrice; // Default to pending order price
        let hadGap = false;
        
        // Detect gaps and adjust execution price
        if (pendingOrder.orderType === 'limit') {
            if (pendingOrder.direction === 'BUY') {
                // Limit BUY: wanted to buy at entryPrice, but if price gapped down below it,
                // execute at the open (which is lower than our limit = better price)
                if (open < pendingOrder.entryPrice && low < pendingOrder.entryPrice) {
                    executionPrice = open;
                    hadGap = open < pendingOrder.entryPrice; // Gap if open is significantly different
                }
            } else { // SELL
                // Limit SELL: wanted to sell at entryPrice, but if price gapped up above it,
                // execute at the open (which is higher than our limit = better price)
                if (open > pendingOrder.entryPrice && high > pendingOrder.entryPrice) {
                    executionPrice = open;
                    hadGap = open > pendingOrder.entryPrice;
                }
            }
        } else if (pendingOrder.orderType === 'stop') {
            if (pendingOrder.direction === 'BUY') {
                // Stop BUY: wanted to buy at entryPrice, but if price gapped up above it,
                // execute at the open (which is higher = slippage against us)
                if (open > pendingOrder.entryPrice && high > pendingOrder.entryPrice) {
                    executionPrice = open;
                    hadGap = open > pendingOrder.entryPrice;
                }
            } else { // SELL
                // Stop SELL: wanted to sell at entryPrice, but if price gapped down below it,
                // execute at the open (which is lower = slippage against us)
                if (open < pendingOrder.entryPrice && low < pendingOrder.entryPrice) {
                    executionPrice = open;
                    hadGap = open < pendingOrder.entryPrice;
                }
            }
        }
        
        const gapInfo = hadGap ? ` (GAP: ${pendingOrder.entryPrice.toFixed(5)} → ${executionPrice.toFixed(5)})` : '';
        console.log(`✅ Executing ${pendingOrder.orderType.toUpperCase()} ${pendingOrder.direction} Order #${pendingOrder.id} @ ${executionPrice.toFixed(5)}${gapInfo}`);
        
        // Create market order from pending order
        const order = {
            id: pendingOrder.id,
            type: pendingOrder.direction,
            openPrice: executionPrice, // Use actual execution price (accounts for gaps)
            openTime: currentCandle.t,
            quantity: pendingOrder.quantity,
            riskAmount: pendingOrder.riskAmount,
            originalRiskAmount: pendingOrder.originalRiskAmount || pendingOrder.riskAmount, // Preserve original
            status: 'OPEN',
            stopLoss: pendingOrder.stopLoss,
            takeProfit: pendingOrder.takeProfit,
            autoBreakeven: pendingOrder.autoBreakeven,
            breakevenSettings: pendingOrder.breakevenSettings,
            // MFE/MAE tracking
            highestPrice: executionPrice,
            lowestPrice: executionPrice,
            mfe: executionPrice,
            mae: executionPrice,
            mfeTime: currentCandle.t,
            maeTime: currentCandle.t,
            mfeMaeTrackingEndTime: currentCandle.t + (this.mfeMaeTrackingHours * 60 * 60 * 1000),
            // Mark as converted from pending
            wasLimitOrder: pendingOrder.orderType === 'limit',
            wasStopOrder: pendingOrder.orderType === 'stop',
            // Gap tracking
            hadGap: hadGap,
            pendingOrderPrice: pendingOrder.entryPrice, // Store original pending price for reference
            // Preserve drawing tool metadata
            createdFromTool: pendingOrder.createdFromTool || false,
            toolType: pendingOrder.toolType || null,
            // Advanced features
            trailingStop: pendingOrder.trailingStop,
            tpTargets: pendingOrder.tpTargets,
            // Track original quantity and partial closes for multiple TPs
            originalQuantity: pendingOrder.quantity,
            partialCloses: [],
            partialClosePnL: 0,
            // Split entry tracking
            splitGroupId: pendingOrder.splitGroupId || null,
            splitIndex: pendingOrder.splitIndex || null,
            splitTotal: pendingOrder.splitTotal || null,
            isSplitEntry: pendingOrder.isSplitEntry || false
        };
        
        // DEBUG: Log tpTargets to verify they're correct
        console.log(`📊 Order #${order.id} executed with tpTargets:`, order.tpTargets);
        if (order.tpTargets && order.tpTargets.length > 0) {
            order.tpTargets.forEach((t, i) => {
                console.log(`   TP${i+1}: id=${t.id}, price=${t.price?.toFixed(5)}, percentage=${t.percentage}%, hit=${t.hit}`);
            });
        } else {
            console.log(`   ⚠️ No tpTargets or empty array - will use single TP at ${order.takeProfit}`);
        }
        
        // ═══ POSITION SCALING ═══
        // If pending order had scaling checkbox checked, apply scaling now
        if (this.enablePositionScaling && pendingOrder.scaleWithExisting) {
            console.log(`\n🎯 SCALING ENABLED for executed pending order #${order.id}`);
            this.applyScaling(order);
        } else {
            console.log(`📊 Scaling not requested for pending order #${order.id}`);
        }
        
        // NOTE: Pending order already removed from array in checkPendingOrders()
        // to prevent re-execution race conditions
        
        // Add to open positions
        if (this.orderService) {
            this.orderService.registerOpenOrder(order);
        } else {
            this.openPositions.push(order);
            this.orders.push(order);
        }
        
        // ═══ SPLIT ENTRY GROUP TRACKING ═══
        // Track split entries for aggregate journal entry when all close
        // ONLY if not being scaled (scaling takes priority and uses its own grouping)
        if (order.splitGroupId && order.isSplitEntry && !order.tradeGroupId) {
            let splitGroup = this.splitTrades.get(order.splitGroupId);
            if (!splitGroup) {
                splitGroup = {
                    groupId: order.splitGroupId,
                    entries: [],
                    side: order.type,
                    status: 'OPEN',
                    totalQuantity: 0,
                    totalPnL: 0,
                    splitTotal: order.splitTotal || 2
                };
                this.splitTrades.set(order.splitGroupId, splitGroup);
            }
            splitGroup.entries.push(order);
            splitGroup.totalQuantity += order.quantity;
            console.log(`📊 Split entry #${order.id} added to group ${order.splitGroupId} (${splitGroup.entries.length}/${splitGroup.splitTotal})`);
        } else if (order.tradeGroupId) {
            console.log(`📊 Split entry #${order.id} is being scaled - using tradeGroupId ${order.tradeGroupId} instead of splitGroupId`);
        }
        
        // Remove pending order line AND pending SL/TP lines, then draw active versions
        this.removePendingOrderLine(pendingOrder.id);
        this.removePendingSLTPLines(pendingOrder.id); // IMPORTANT: Remove pending SL/TP lines too!
        this.drawOrderLine(order);
        this.drawSLTPLines(order);
        
        // Show notification
        const orderTypeLabel = order.wasLimitOrder ? 'Limit' : 'Stop';
        const toolLabel = order.createdFromTool ? ' (from drawing tool)' : '';
        const gapLabel = order.hadGap ? ` ⚠️ GAP (pending @ ${order.pendingOrderPrice.toFixed(5)})` : '';
        this.showNotification(`✅ ${orderTypeLabel} ${order.type} Order #${order.id} executed @ ${order.openPrice.toFixed(5)}${gapLabel}${toolLabel}`, 'success');
        
        // Play order execution sound
        this.playOrderSound('pending');
        
        // Draw entry marker after a small delay for visual rendering
        setTimeout(() => {
            this.drawEntryMarker(order);
        }, 100);
        
        // Start screenshot capture immediately and store promise for later await
        if (window.screenshotManager) {
            order.screenshotPromise = window.screenshotManager.captureChartSnapshot().then(screenshot => {
                if (screenshot) {
                    order.entryScreenshot = screenshot;
                    console.log('✅ Entry screenshot captured for executed pending order #' + order.id);
                }
                // Show journal modal for drawing tool orders
                if (order.createdFromTool) {
                    this.showTradeJournalModal(order, false, null);
                }
                return screenshot;
            }).catch(err => {
                console.error('❌ Failed to capture entry screenshot:', err);
                if (order.createdFromTool) {
                    this.showTradeJournalModal(order, false, null);
                }
                return null;
            });
        } else if (order.createdFromTool) {
            this.showTradeJournalModal(order, false, null);
        }
        
        this.updatePositionsPanel();
    }
    
    /**
     * Update positions with current prices
     */
    updatePositions() {
        const currentCandle = this.getCurrentCandle();
        if (!currentCandle) return;
        
        const currentPrice = currentCandle.c;
        const high = currentCandle.h;
        const low = currentCandle.l;
        
        // Check and execute pending orders
        this.checkPendingOrders(currentCandle);
        
        // If no open positions but have MFE/MAE tracking, still continue
        if (this.openPositions.length === 0) {
            if (this.mfeMaeTrackingPositions.length > 0) {
                this.updateMfeMaeTracking(currentCandle, currentCandle.h, currentCandle.l);
            }
            return;
        }
        
        let totalPnL = 0;
        
        // Check each position for SL/TP hits
        const positionsToClose = [];
        
        this.openPositions.forEach(position => {
            if (position.type === 'BUY') {
                const priceDiff = currentPrice - position.openPrice;
                // P&L = (Price Difference in Pips) × Position Size (Lots) × Pip Value per Lot
                const pipsMove = priceDiff / this.pipSize;
                position.unrealizedPnL = pipsMove * position.quantity * this.pipValuePerLot;
                
                // Update MFE/MAE for BUY positions (only within tracking window)
                if (currentCandle.t <= position.mfeMaeTrackingEndTime) {
                    if (high > position.highestPrice) {
                        position.highestPrice = high;
                        position.mfe = high; // MFE = highest price reached (best for BUY)
                        position.mfeTime = currentCandle.t; // Track when MFE occurred
                    }
                    if (low < position.lowestPrice) {
                        position.lowestPrice = low;
                        position.mae = low; // MAE = lowest price reached (worst for BUY)
                        position.maeTime = currentCandle.t; // Track when MAE occurred
                    }
                }
                
                console.log(`   📊 BUY #${position.id}: Entry=${position.openPrice.toFixed(5)}, Current=${currentPrice.toFixed(5)}, Diff=${priceDiff.toFixed(5)}, Qty=${position.quantity}, P&L=${position.unrealizedPnL >= 0 ? '+' : ''}$${position.unrealizedPnL.toFixed(2)}`);
                
                // Check for auto breakeven trigger (skip if trailing stop is already activated)
                if (position.autoBreakeven && position.breakevenSettings && !position.breakevenSettings.triggered && position.stopLoss && 
                    !(position.trailingStop && position.trailingStop.activated)) {
                    let shouldTrigger = false;
                    
                    if (position.breakevenSettings.mode === 'pips') {
                        // Calculate required profit in pips
                        const currentPipsProfit = (high - position.openPrice) / this.pipSize;
                        shouldTrigger = currentPipsProfit >= position.breakevenSettings.value;
                    } else {
                        // Check if profit amount reached
                        shouldTrigger = position.unrealizedPnL >= position.breakevenSettings.value;
                    }
                    
                    if (shouldTrigger) {
                        console.log(`   ⚡⚡⚡ BE TRIGGER - MOVING SL ONLY, NOT CLOSING! ⚡⚡⚡`);
                        const oldSL = position.stopLoss;
                        // Move SL to breakeven (entry price) + pip offset
                        const pipOffset = position.breakevenSettings.pipOffset || 0;
                        const pipOffsetPrice = pipOffset * this.pipSize;
                        console.log(`      Entry: ${position.openPrice.toFixed(5)}, pipOffset: ${pipOffset}, this.pipSize: ${this.pipSize}, pipOffsetPrice: ${pipOffsetPrice.toFixed(5)}`);
                        position.stopLoss = position.openPrice + pipOffsetPrice;
                        console.log(`      New SL = ${position.openPrice.toFixed(5)} + ${pipOffsetPrice.toFixed(5)} = ${position.stopLoss.toFixed(5)}`);
                        position.breakevenSettings.triggered = true;
                        
                        // If trailing stop exists but not activated yet, mark BE as the winner
                        if (position.trailingStop && !position.trailingStop.activated) {
                            position.trailingStop.beSupersedesTrailing = true;
                            console.log(`      📌 Auto BE triggered first - Trailing Stop will not activate`);
                        }
                        
                        // Mark that BE was just triggered to skip TP checks this candle
                        position.beJustTriggered = true;
                        
                        const triggerType = position.breakevenSettings.mode === 'pips' 
                            ? `${position.breakevenSettings.value} pips`
                            : `$${position.breakevenSettings.value}`;
                        
                        const offsetText = pipOffset !== 0 ? ` +${pipOffset} pips` : '';
                        console.log(`   ⚡ BREAKEVEN TRIGGERED! (${triggerType}) SL moved from ${oldSL.toFixed(5)} to ${position.stopLoss.toFixed(5)}${offsetText} for BUY #${position.id}`);
                        console.log(`   Position #${position.id} is STILL OPEN with quantity ${position.quantity}`);
                        console.log(`   ⚠️ Skipping TP checks for this candle to let BE take effect`);
                        this.showNotification(`⚡ Breakeven Hit! Order #${position.id} | SL moved to ${position.stopLoss.toFixed(5)}${offsetText}`, 'success');
                        
                        // Update the SL line on chart
                        this.removeSLTPLines(position.id);
                        this.drawSLTPLines(position);
                    }
                }
                
                // Check for step-based trailing stop activation and adjustment
                if (position.trailingStop && position.trailingStop.enabled && position.stopLoss && !position.trailingStop.beSupersedesTrailing) {
                    // Check if trailing should activate (reach threshold first)
                    if (!position.trailingStop.activated) {
                        const shouldActivate = currentPrice >= position.trailingStop.activationThreshold;
                        
                        if (shouldActivate) {
                            position.trailingStop.activated = true;
                            console.log(`   🔥 TRAILING STOP ACTIVATED for BUY #${position.id} at ${currentPrice.toFixed(5)}`);
                            
                            // If Auto BE exists but not triggered yet, mark trailing as the winner
                            if (position.autoBreakeven && position.breakevenSettings && !position.breakevenSettings.triggered) {
                                position.breakevenSettings.triggered = true; // Mark as handled
                                console.log(`      📌 Trailing activated first - Auto BE will not trigger`);
                            }
                            
                            this.showNotification(`🔥 Trailing Stop Activated! Order #${position.id}`, 'success');
                        }
                    }
                    
                    // If activated, apply step-based trailing
                    if (position.trailingStop.activated) {
                        // Calculate profit from ACTIVATION THRESHOLD (not from entry!)
                        const profitFromActivation = currentPrice - position.trailingStop.activationThreshold;
                        
                        // Calculate how many steps of profit we've reached since activation
                        const stepsReached = Math.floor(profitFromActivation / position.trailingStop.stepSize);
                        
                        // Only update if we've reached a new step level
                        if (stepsReached > position.trailingStop.currentStep && stepsReached > 0) {
                            // Calculate new SL position to maintain original risk distance
                            // Original risk distance from entry
                            const originalRisk = position.openPrice - position.trailingStop.originalSL;
                            // New SL = activation threshold + steps moved - original risk
                            const newSL = position.trailingStop.activationThreshold + (stepsReached * position.trailingStop.stepSize) - originalRisk;
                            
                            // Ensure trailing SL:
                            // 1. Is higher than current SL
                            // 2. Never goes below breakeven (entry + pip offset) if breakeven was triggered
                            let breakevenSL = position.openPrice;
                            if (position.autoBreakeven && position.breakevenSettings?.triggered) {
                                const pipOffset = position.breakevenSettings.pipOffset || 0;
                                breakevenSL = position.openPrice + (pipOffset * this.pipSize);
                            }
                            const minSL = (position.autoBreakeven && position.breakevenSettings?.triggered) 
                                ? Math.max(position.stopLoss, breakevenSL) 
                                : position.stopLoss;
                            
                            if (newSL > minSL) {
                                const oldSL = position.stopLoss;
                                position.stopLoss = newSL;
                                position.trailingStop.currentStep = stepsReached;
                                
                                console.log(`   📈 STEP TRAILING SL: ${oldSL.toFixed(5)} → ${newSL.toFixed(5)} (Step ${stepsReached}) for BUY #${position.id}`);
                                this.showNotification(`📈 SL moved to Step ${stepsReached} (+${stepsReached * position.trailingStop.stepPips} pips)`, 'success');
                                
                                // Update the SL line on chart
                                this.removeSLTPLines(position.id);
                                this.drawSLTPLines(position);
                                console.log(`   ✅ New SL/TP lines drawn at ${position.stopLoss.toFixed(5)}`);
                                
                                // Show notification
                                this.showNotification(`📈 Trailing SL: ${oldSL.toFixed(5)} → ${newSL.toFixed(5)} | #${position.id}`, 'info');
                            }
                        }
                    }
                }
                
                // Check for multiple TP hits (skip if BE was just triggered this candle)
                if (position.tpTargets && position.tpTargets.length > 0 && !position.beJustTriggered) {
                    console.log(`   📊 Checking ${position.tpTargets.length} TP targets for BUY #${position.id}`);
                    position.tpTargets.forEach((target, index) => {
                        console.log(`      Target ${index + 1}: price=${target.price.toFixed(5)}, percentage=${target.percentage}%, hit=${target.hit}, high=${high.toFixed(5)}`);
                        if (!target.hit && high >= target.price) {
                            target.hit = true;
                            const closePercentage = target.percentage / 100;
                            
                            // Check if this is the LAST target to be hit
                            const allTargetsHit = position.tpTargets.every(t => t.hit);
                            const closeType = allTargetsHit ? 'TP' : 'TP-PARTIAL';
                            
                            console.log(`   🎯 TP TARGET #${target.id} HIT! ${allTargetsHit ? 'FINAL TARGET - ' : ''}Closing ${(closePercentage * 100).toFixed(0)}% at ${target.price.toFixed(5)} for BUY #${position.id}`);
                            console.log(`      allTargetsHit=${allTargetsHit}, closeType=${closeType}, percentage=${closePercentage}`);
                            positionsToClose.push({ 
                                id: position.id, 
                                closePrice: target.price, 
                                type: closeType,
                                percentage: allTargetsHit ? null : closePercentage, // null for full close
                                targetId: target.id
                            });
                        }
                    });
                } else if (position.beJustTriggered && position.tpTargets && position.tpTargets.length > 0) {
                    console.log(`   ⏭️ Skipping TP checks for BUY #${position.id} - BE was just triggered`);
                }
                
                // Check if SL or TP was hit (skip SL check if BE just triggered this candle!)
                if (!position.beJustTriggered) {
                    if (!position.tpTargets || position.tpTargets.length === 0) {
                        if (position.stopLoss && low <= position.stopLoss) {
                            console.log(`   🛑 STOP LOSS HIT! Closing BUY #${position.id} at ${position.stopLoss.toFixed(5)}`);
                            positionsToClose.push({ id: position.id, closePrice: position.stopLoss, type: 'SL' });
                        } else if (position.takeProfit && high >= position.takeProfit) {
                            console.log(`   🎯 TAKE PROFIT HIT! Closing BUY #${position.id} at ${position.takeProfit.toFixed(5)}`);
                            positionsToClose.push({ id: position.id, closePrice: position.takeProfit, type: 'TP' });
                        }
                    } else {
                        // For multiple TPs, still check SL
                        if (position.stopLoss && low <= position.stopLoss) {
                            console.log(`   🛑 STOP LOSS HIT! Closing remaining position BUY #${position.id} at ${position.stopLoss.toFixed(5)}`);
                            positionsToClose.push({ id: position.id, closePrice: position.stopLoss, type: 'SL' });
                        }
                    }
                } else {
                    console.log(`   ⏭️ Skipping SL checks for BUY #${position.id} - BE was just triggered, new SL needs next candle`);
                }
                
                // Clear the BE just triggered flag AFTER all checks (it only applies to current candle)
                if (position.beJustTriggered) {
                    position.beJustTriggered = false;
                }
            } else {
                const priceDiff = position.openPrice - currentPrice;
                // P&L = (Price Difference in Pips) × Position Size (Lots) × Pip Value per Lot
                const pipsMove = priceDiff / this.pipSize;
                position.unrealizedPnL = pipsMove * position.quantity * this.pipValuePerLot;
                
                // Update MFE/MAE for SELL positions (only within tracking window)
                if (currentCandle.t <= position.mfeMaeTrackingEndTime) {
                    if (low < position.lowestPrice) {
                        position.lowestPrice = low;
                        position.mfe = low; // MFE = lowest price reached (best for SELL)
                        position.mfeTime = currentCandle.t; // Track when MFE occurred
                    }
                    if (high > position.highestPrice) {
                        position.highestPrice = high;
                        position.mae = high; // MAE = highest price reached (worst for SELL)
                        position.maeTime = currentCandle.t; // Track when MAE occurred
                    }
                }
                
                console.log(`   📊 SELL #${position.id}: Entry=${position.openPrice.toFixed(5)}, Current=${currentPrice.toFixed(5)}, Diff=${priceDiff.toFixed(5)}, Qty=${position.quantity}, P&L=${position.unrealizedPnL >= 0 ? '+' : ''}$${position.unrealizedPnL.toFixed(2)}`);
                
                // Check for auto breakeven trigger (skip if trailing stop is already activated)
                if (position.autoBreakeven && position.breakevenSettings && !position.breakevenSettings.triggered && position.stopLoss && 
                    !(position.trailingStop && position.trailingStop.activated)) {
                    let shouldTrigger = false;
                    
                    if (position.breakevenSettings.mode === 'pips') {
                        // Calculate required profit in pips (for SELL, profit is entry - low)
                        const currentPipsProfit = (position.openPrice - low) / this.pipSize;
                        shouldTrigger = currentPipsProfit >= position.breakevenSettings.value;
                    } else {
                        // Check if profit amount reached
                        shouldTrigger = position.unrealizedPnL >= position.breakevenSettings.value;
                    }
                    
                    if (shouldTrigger) {
                        console.log(`   ⚡⚡⚡ BE TRIGGER - MOVING SL ONLY, NOT CLOSING! ⚡⚡⚡`);
                        const oldSL = position.stopLoss;
                        // Move SL to breakeven (entry price) - pip offset (for SELL, offset goes down)
                        const pipOffset = position.breakevenSettings.pipOffset || 0;
                        const pipOffsetPrice = pipOffset * this.pipSize;
                        console.log(`      Entry: ${position.openPrice.toFixed(5)}, pipOffset: ${pipOffset}, this.pipSize: ${this.pipSize}, pipOffsetPrice: ${pipOffsetPrice.toFixed(5)}`);
                        position.stopLoss = position.openPrice - pipOffsetPrice;
                        console.log(`      New SL = ${position.openPrice.toFixed(5)} - ${pipOffsetPrice.toFixed(5)} = ${position.stopLoss.toFixed(5)}`);
                        position.breakevenSettings.triggered = true;
                        
                        // If trailing stop exists but not activated yet, mark BE as the winner
                        if (position.trailingStop && !position.trailingStop.activated) {
                            position.trailingStop.beSupersedesTrailing = true;
                            console.log(`      📌 Auto BE triggered first - Trailing Stop will not activate`);
                        }
                        
                        // Mark that BE was just triggered to skip TP checks this candle
                        position.beJustTriggered = true;
                        
                        const triggerType = position.breakevenSettings.mode === 'pips' 
                            ? `${position.breakevenSettings.value} pips`
                            : `$${position.breakevenSettings.value}`;
                        
                        const offsetText = pipOffset !== 0 ? ` +${pipOffset} pips` : '';
                        console.log(`   ⚡ BREAKEVEN TRIGGERED! (${triggerType}) SL moved from ${oldSL.toFixed(5)} to ${position.stopLoss.toFixed(5)}${offsetText} for SELL #${position.id}`);
                        console.log(`   Position #${position.id} is STILL OPEN with quantity ${position.quantity}`);
                        console.log(`   ⚠️ Skipping TP checks for this candle to let BE take effect`);
                        this.showNotification(`⚡ Breakeven Hit! Order #${position.id} | SL moved to ${position.stopLoss.toFixed(5)}${offsetText}`, 'success');
                        
                        // Update the SL line on chart
                        this.removeSLTPLines(position.id);
                        this.drawSLTPLines(position);
                    }
                }
                
                // Check for step-based trailing stop activation and adjustment
                if (position.trailingStop && position.trailingStop.enabled && position.stopLoss && !position.trailingStop.beSupersedesTrailing) {
                    // Check if trailing should activate (reach threshold first)
                    if (!position.trailingStop.activated) {
                        const shouldActivate = currentPrice <= position.trailingStop.activationThreshold;
                        
                        if (shouldActivate) {
                            position.trailingStop.activated = true;
                            console.log(`   🔥 TRAILING STOP ACTIVATED for SELL #${position.id} at ${currentPrice.toFixed(5)}`);
                            
                            // If Auto BE exists but not triggered yet, mark trailing as the winner
                            if (position.autoBreakeven && position.breakevenSettings && !position.breakevenSettings.triggered) {
                                position.breakevenSettings.triggered = true; // Mark as handled
                                console.log(`      📌 Trailing activated first - Auto BE will not trigger`);
                            }
                            
                            this.showNotification(`🔥 Trailing Stop Activated! Order #${position.id}`, 'success');
                        }
                    }
                    
                    // If activated, apply step-based trailing
                    if (position.trailingStop.activated) {
                        // Calculate profit from ACTIVATION THRESHOLD (not from entry!)
                        const profitFromActivation = position.trailingStop.activationThreshold - currentPrice;
                        
                        // Calculate how many steps of profit we've reached since activation
                        const stepsReached = Math.floor(profitFromActivation / position.trailingStop.stepSize);
                        
                        // Only update if we've reached a new step level
                        if (stepsReached > position.trailingStop.currentStep && stepsReached > 0) {
                            // Calculate new SL position to maintain original risk distance
                            // Original risk distance from entry
                            const originalRisk = position.trailingStop.originalSL - position.openPrice;
                            // New SL = activation threshold - steps moved + original risk
                            const newSL = position.trailingStop.activationThreshold - (stepsReached * position.trailingStop.stepSize) + originalRisk;
                            
                            // Ensure trailing SL:
                            // 1. Is lower than current SL (for SELL)
                            // 2. Never goes above breakeven (entry - pip offset) if breakeven was triggered
                            let breakevenSL = position.openPrice;
                            if (position.autoBreakeven && position.breakevenSettings?.triggered) {
                                const pipOffset = position.breakevenSettings.pipOffset || 0;
                                breakevenSL = position.openPrice - (pipOffset * this.pipSize);
                            }
                            const maxSL = (position.autoBreakeven && position.breakevenSettings?.triggered) 
                                ? Math.min(position.stopLoss, breakevenSL) 
                                : position.stopLoss;
                            
                            if (newSL < maxSL) {
                                const oldSL = position.stopLoss;
                                position.stopLoss = newSL;
                                position.trailingStop.currentStep = stepsReached;
                                
                                console.log(`   📉 STEP TRAILING SL: ${oldSL.toFixed(5)} → ${newSL.toFixed(5)} (Step ${stepsReached}) for SELL #${position.id}`);
                                this.showNotification(`📉 SL moved to Step ${stepsReached} (+${stepsReached * position.trailingStop.stepPips} pips)`, 'success');
                                
                                // Update the SL line on chart
                                this.removeSLTPLines(position.id);
                                this.drawSLTPLines(position);
                                console.log(`   ✅ New SL/TP lines drawn at ${position.stopLoss.toFixed(5)}`);
                                
                                // Show notification
                                this.showNotification(`📉 Trailing SL: ${oldSL.toFixed(5)} → ${newSL.toFixed(5)} | #${position.id}`, 'info');
                            }
                        }
                    }
                }
                
                // Check for multiple TP hits (skip if BE was just triggered this candle)
                if (position.tpTargets && position.tpTargets.length > 0 && !position.beJustTriggered) {
                    console.log(`   📊 Checking ${position.tpTargets.length} TP targets for SELL #${position.id}`);
                    position.tpTargets.forEach((target, index) => {
                        console.log(`      Target ${index + 1}: price=${target.price.toFixed(5)}, percentage=${target.percentage}%, hit=${target.hit}, low=${low.toFixed(5)}`);
                        if (!target.hit && low <= target.price) {
                            target.hit = true;
                            const closePercentage = target.percentage / 100;
                            
                            // Check if this is the LAST target to be hit
                            const allTargetsHit = position.tpTargets.every(t => t.hit);
                            const closeType = allTargetsHit ? 'TP' : 'TP-PARTIAL';
                            
                            console.log(`   🎯 TP TARGET #${target.id} HIT! ${allTargetsHit ? 'FINAL TARGET - ' : ''}Closing ${(closePercentage * 100).toFixed(0)}% at ${target.price.toFixed(5)} for SELL #${position.id}`);
                            console.log(`      allTargetsHit=${allTargetsHit}, closeType=${closeType}, percentage=${closePercentage}`);
                            positionsToClose.push({ 
                                id: position.id, 
                                closePrice: target.price, 
                                type: closeType,
                                percentage: allTargetsHit ? null : closePercentage, // null for full close
                                targetId: target.id
                            });
                        }
                    });
                } else if (position.beJustTriggered && position.tpTargets && position.tpTargets.length > 0) {
                    console.log(`   ⏭️ Skipping TP checks for SELL #${position.id} - BE was just triggered`);
                }
                
                // Check if SL or TP was hit (skip SL check if BE just triggered this candle!)
                if (!position.beJustTriggered) {
                    if (!position.tpTargets || position.tpTargets.length === 0) {
                        if (position.stopLoss && high >= position.stopLoss) {
                            console.log(`   🛑 STOP LOSS HIT! Closing SELL #${position.id} at ${position.stopLoss.toFixed(5)}`);
                            positionsToClose.push({ id: position.id, closePrice: position.stopLoss, type: 'SL' });
                        } else if (position.takeProfit && low <= position.takeProfit) {
                            console.log(`   🎯 TAKE PROFIT HIT! Closing SELL #${position.id} at ${position.takeProfit.toFixed(5)}`);
                            positionsToClose.push({ id: position.id, closePrice: position.takeProfit, type: 'TP' });
                        }
                    } else {
                        // For multiple TPs, still check SL
                        if (position.stopLoss && high >= position.stopLoss) {
                            console.log(`   🛑 STOP LOSS HIT! Closing remaining position SELL #${position.id} at ${position.stopLoss.toFixed(5)}`);
                            positionsToClose.push({ id: position.id, closePrice: position.stopLoss, type: 'SL' });
                        }
                    }
                } else {
                    console.log(`   ⏭️ Skipping SL checks for SELL #${position.id} - BE was just triggered, new SL needs next candle`);
                }
                
                // Clear the BE just triggered flag AFTER all checks (it only applies to current candle)
                if (position.beJustTriggered) {
                    position.beJustTriggered = false;
                }
            }
            
            totalPnL += position.unrealizedPnL;
        });
        
        // Close positions that hit SL/TP
        // Use try-catch to prevent one error from breaking other closes
        positionsToClose.forEach(({ id, closePrice, type, percentage, targetId }) => {
            try {
                this.closePositionAtPrice(id, closePrice, type, percentage, targetId);
            } catch (err) {
                console.error(`❌ Error closing position #${id}:`, err);
                // Still try to remove the lines even if close failed
                try {
                    this.removeOrderLine(id);
                    this.removeSLTPLines(id);
                    this.removeEntryMarker(id);
                } catch (e) {
                    console.error(`❌ Error removing lines for #${id}:`, e);
                }
            }
        });
        
        // Continue tracking MFE/MAE for closed positions
        this.updateMfeMaeTracking(currentCandle, high, low);
        
        // Pause replay if any positions were closed due to TP/SL
        if (positionsToClose.length > 0 && this.replaySystem && this.replaySystem.isPlaying) {
            console.log('⏸️ Pausing replay due to TP/SL hit');
            this.replaySystem.pause();
        }
        
        this.equity = this.balance + totalPnL;
        
        // Log current state
        if (this.openPositions.length > 0) {
            console.log(`💰 Total Unrealized P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} | Balance: $${this.balance.toFixed(2)} | Equity: $${this.equity.toFixed(2)}`);
        }
        
        this.updatePositionsPanel();
    }
    
    /**
     * Close position at specific price (for SL/TP hits)
     */
    closePositionAtPrice(orderId, closePrice, hitType = null, percentage = null, targetId = null) {
        const position = this.openPositions.find(p => p.id === orderId);
        if (!position) return;
        
        console.log(`🔍 closePositionAtPrice called: orderId=${orderId}, hitType=${hitType}, percentage=${percentage}, targetId=${targetId}`);
        
        const currentCandle = this.getCurrentCandle();
        const closeTime = currentCandle ? currentCandle.t : Date.now();
        
        // Determine if this is a partial close
        // If hitType is 'TP-PARTIAL' and percentage is provided and < 1, it's partial
        // If hitType is 'TP' (final target) or percentage is null, it's a full close
        const isPartialClose = hitType === 'TP-PARTIAL' && percentage && percentage < 1;
        const closeQuantity = isPartialClose ? position.quantity * percentage : position.quantity;
        
        console.log(`   isPartialClose=${isPartialClose}, closeQuantity=${closeQuantity}, position.quantity=${position.quantity}`);
        
        // Calculate P&L using pip values
        // P&L = (Price Difference in Pips) × Close Quantity (Lots) × Pip Value per Lot
        let priceDiff;
        if (position.type === 'BUY') {
            priceDiff = closePrice - position.openPrice;
        } else {
            priceDiff = position.openPrice - closePrice;
        }
        
        const pipsMove = priceDiff / this.pipSize;
        const pnl = pipsMove * closeQuantity * this.pipValuePerLot;
        
        // Update balance
        this.balance += pnl;
        this.equity = this.balance;
        
        // Track prop firm progress (for both partial and full closes)
        if (window.propFirmTracker) {
            window.propFirmTracker.recordTrade({
                id: orderId,
                type: position.type,
                openPrice: position.openPrice,
                closePrice: closePrice,
                openTime: position.openTime,
                closeTime: closeTime,
                timestamp: closeTime,
                quantity: closeQuantity,
                profit: pnl,
                pnl: pnl,
                hitType: hitType,
                isPartial: isPartialClose
            });
            window.propFirmTracker.updateBalance(this.balance);
        }
        
        if (isPartialClose) {
            // Partial close: reduce quantity but keep position open
            position.quantity -= closeQuantity;
            
            // IMPORTANT: Track cumulative partial close P&L on the position
            // This will be added to the final P&L when the position fully closes
            if (!position.partialCloses) {
                position.partialCloses = [];
            }
            position.partialCloses.push({
                closePrice: closePrice,
                closeTime: closeTime,
                quantity: closeQuantity,
                pnl: pnl,
                percentage: percentage,
                hitType: hitType,
                targetId: targetId
            });
            
            // Track cumulative partial P&L for easy access
            position.partialClosePnL = (position.partialClosePnL || 0) + pnl;
            
            console.log(`✅ Partial close: #${orderId} | Closed ${(percentage * 100).toFixed(0)}% (${closeQuantity.toFixed(2)} lots) | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | Cumulative Partial P&L: $${position.partialClosePnL.toFixed(2)} | Remaining: ${position.quantity.toFixed(2)} lots | Balance: $${this.balance.toFixed(2)}`);
            
            // Remove the specific TP target line that was hit
            if (targetId !== undefined && this.tpLines) {
                const hitLine = this.tpLines.find(tpLine => tpLine.orderId === orderId && tpLine.targetId === targetId);
                if (hitLine) {
                    // Remove the SVG elements for this TP line
                    if (hitLine.line) hitLine.line.remove();
                    if (hitLine.labelBox) hitLine.labelBox.remove();
                    if (hitLine.labelText) hitLine.labelText.remove();
                    if (hitLine.priceBox) hitLine.priceBox.remove();
                    if (hitLine.priceText) hitLine.priceText.remove();
                    if (hitLine.closeBtn) hitLine.closeBtn.remove();
                    
                    // Remove from array
                    this.tpLines = this.tpLines.filter(tpLine => !(tpLine.orderId === orderId && tpLine.targetId === targetId));
                    console.log(`   ✅ Removed TP line for target #${targetId}`);
                }
            }
            
            // Update remaining SL/TP lines to reflect new quantity (for P&L recalculation)
            this.updateSLTPLines();
            
            // Draw partial profit marker on chart (like exit marker but for partial close)
            this.drawPartialCloseMarker(position, {
                closePrice: closePrice,
                closeTime: closeTime,
                pnl: pnl,
                percentage: percentage,
                targetId: targetId
            });
            
            // Show notification
            const remainingTargets = position.tpTargets.filter(t => !t.hit).length;
            this.showNotification(`🎯 TP Target Hit! Closed ${(percentage * 100).toFixed(0)}% of Order #${orderId} | P&L: +$${pnl.toFixed(2)} | ${remainingTargets} targets remaining`, 'success');
        } else {
            // Full close
            position.closePrice = closePrice;
            position.closeTime = closeTime;
            
            // IMPORTANT: Calculate TOTAL P&L including any partial closes
            const partialPnL = position.partialClosePnL || 0;
            const finalClosePnL = pnl; // This is the P&L for the remaining position
            const totalPnL = partialPnL + finalClosePnL;
            
            position.pnl = totalPnL; // Store TOTAL P&L on position
            position.finalClosePnL = finalClosePnL; // Store the final close P&L separately
            position.status = 'CLOSED';
            
            // Move to closed positions first
            this.openPositions = this.openPositions.filter(p => p.id !== orderId);
            this.closedPositions.push(position);
            
            // Log with breakdown if there were partial closes
            if (partialPnL !== 0) {
                console.log(`✅ Position closed: #${orderId} | Final Close P&L: ${finalClosePnL >= 0 ? '+' : ''}$${finalClosePnL.toFixed(2)} | Partial TPs P&L: ${partialPnL >= 0 ? '+' : ''}$${partialPnL.toFixed(2)} | TOTAL P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} | Balance: $${this.balance.toFixed(2)}`);
            } else {
                console.log(`✅ Position closed: #${orderId} | P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)} | Balance: $${this.balance.toFixed(2)}`);
            }
            
            // Play close sound
            this.playOrderSound('close');
            
            // Check if this position is part of a scaled group OR split entry group
            // These are MUTUALLY EXCLUSIVE - a position is either scaled OR split, not both
            let scaledInfo = null;
            let splitInfo = null;
            let shouldCreateJournalEntry = true;
            
            // Check SCALED trades first (takes priority)
            if (position.tradeGroupId) {
                scaledInfo = this.scaledTrades.get(position.tradeGroupId);
                
                if (scaledInfo) {
                    // Update this entry's status in the scaled group (same as split entries)
                    const entryInGroup = scaledInfo.entries.find(e => e.id === position.id);
                    if (entryInGroup) {
                        entryInGroup.status = 'CLOSED';
                        entryInGroup.pnl = position.pnl; // Include partial closes
                        entryInGroup.closePrice = closePrice;
                        entryInGroup.closeTime = closeTime;
                        entryInGroup.partialClosePnL = position.partialClosePnL || 0;
                        console.log(`📊 Updated scaled entry #${position.id} in group: status=CLOSED, pnl=$${position.pnl?.toFixed(2)}`);
                    }
                }
                
                this.closeScaledPosition(position.tradeGroupId);
                
                // Only create journal entry when ALL entries in group are closed
                // AND only treat as multi-trade if group has more than 1 entry
                if (scaledInfo && scaledInfo.status === 'CLOSED') {
                    if (scaledInfo.entries.length > 1) {
                        console.log(`📊 All ${scaledInfo.entries.length} entries in scaled group #${position.tradeGroupId} closed - creating aggregate journal entry`);
                        // Will create aggregated entry below
                    } else {
                        // Single entry in group - treat as regular trade, clear the scaledInfo so regular flow is used
                        console.log(`📊 Scaled group #${position.tradeGroupId} has only 1 entry - treating as regular trade`);
                        scaledInfo = null; // Clear so regular journal entry is created
                    }
                } else {
                    // Group still has open positions - skip individual journal entry
                    shouldCreateJournalEntry = false;
                    console.log(`📊 Scaled position #${orderId} closed, but group #${position.tradeGroupId} still has open entries - skipping individual journal entry`);
                }
            }
            // ELSE check SPLIT entries (only if NOT a scaled trade)
            else if (position.splitGroupId && position.isSplitEntry) {
                splitInfo = this.splitTrades.get(position.splitGroupId);
                if (splitInfo) {
                    // Update this entry's status in the split group
                    const entryInGroup = splitInfo.entries.find(e => e.id === position.id);
                    if (entryInGroup) {
                        entryInGroup.status = 'CLOSED';
                        entryInGroup.pnl = position.pnl; // Include partial closes
                        entryInGroup.closePrice = closePrice;
                        entryInGroup.closeTime = closeTime;
                        entryInGroup.partialClosePnL = position.partialClosePnL || 0;
                    }
                    
                    // Check if all entries in split group are closed
                    const allSplitsClosed = splitInfo.entries.every(e => e.status === 'CLOSED');
                    
                    if (allSplitsClosed) {
                        splitInfo.status = 'CLOSED';
                        splitInfo.totalPnL = splitInfo.entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
                        
                        // Only treat as multi-trade if more than 1 entry
                        if (splitInfo.entries.length > 1) {
                            console.log(`📊 All ${splitInfo.entries.length} split entries closed - creating aggregate journal entry`);
                            console.log(`   Total Split P&L: $${splitInfo.totalPnL.toFixed(2)}`);
                        } else {
                            // Single entry in group - treat as regular trade
                            console.log(`📊 Split group has only 1 entry - treating as regular trade`);
                            splitInfo = null; // Clear so regular journal entry is created
                        }
                    } else {
                        // Split group still has open entries - skip journal for now
                        shouldCreateJournalEntry = false;
                        const closedCount = splitInfo.entries.filter(e => e.status === 'CLOSED').length;
                        console.log(`📊 Split entry #${orderId} closed (${closedCount}/${splitInfo.entries.length}) - waiting for remaining entries`);
                    }
                }
            }
            
            if (!shouldCreateJournalEntry) {
                // Don't add to journal yet - waiting for all group entries to close
                // BUT still draw exit marker for THIS individual entry (like split entries do)
                this.drawExitMarker(position, {
                    closePrice: closePrice,
                    closeTime: closeTime,
                    pnl: position.pnl, // Individual entry's P&L
                    type: hitType || 'MANUAL'
                });
                
                // Remove the visual lines for this closed position
                this.removeOrderLine(orderId);
                this.removeSLTPLines(orderId);
                this.removeEntryMarker(orderId);
                this.updatePositionsPanel();
                return;
            }
            
            // IMPORTANT: Add to trade journal immediately (before showing modal)
            // Calculate additional metadata
            const openDate = new Date(position.openTime);
            const closeDate = new Date(closeTime);
            const holdingTimeMs = closeTime - position.openTime;
            const holdingTimeHours = (holdingTimeMs / (1000 * 60 * 60)).toFixed(2);
            
            const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            
            // Check if this is a SCALED trade (group just closed)
            let journalEntry;
            if (scaledInfo && scaledInfo.status === 'CLOSED') {
                // CREATE AGGREGATE JOURNAL ENTRY for scaled trade
                const totalPnL = scaledInfo.totalPnL || scaledInfo.entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
                const totalRisk = scaledInfo.entries.reduce((sum, e) => sum + (e.riskAmount || 0), 0);
                const avgEntry = scaledInfo.avgEntry;
                const totalQty = scaledInfo.totalQuantity;
                
                // Use first entry's open time and last entry's close time
                const firstEntry = scaledInfo.entries[0];
                const lastEntry = scaledInfo.entries[scaledInfo.entries.length - 1];
                const firstOpenDate = new Date(firstEntry.openTime);
                const lastCloseDate = new Date(lastEntry.closeTime || closeTime);
                const totalHoldingMs = (lastEntry.closeTime || closeTime) - firstEntry.openTime;
                const totalHoldingHours = (totalHoldingMs / (1000 * 60 * 60)).toFixed(2);
                
                // Calculate aggregate MFE/MAE
                const bestMFE = Math.max(...scaledInfo.entries.map(e => e.mfe || e.openPrice));
                const worstMAE = Math.min(...scaledInfo.entries.map(e => e.mae || e.openPrice));
                
                // Collect ALL entry screenshots from all entries
                const allEntryScreenshots = scaledInfo.entries
                    .filter(e => e.entryScreenshot)
                    .map(e => ({
                        orderId: e.id,
                        screenshot: e.entryScreenshot,
                        openPrice: e.openPrice,
                        openTime: e.openTime
                    }));
                
                console.log(`📸 Collected ${allEntryScreenshots.length} entry screenshots from ${scaledInfo.entries.length} entries`);
                
                // Use unique ID with prefix to avoid collision with regular trade IDs
                const scaledTradeId = `scaled_${scaledInfo.groupId}`;
                
                journalEntry = {
                    id: scaledTradeId,
                    tradeId: scaledTradeId,
                    type: scaledInfo.side,
                    direction: scaledInfo.side,
                    symbol: firstEntry.symbol || 'USD',
                    quantity: totalQty,
                    openPrice: avgEntry,
                    closePrice: closePrice,
                    entryPrice: avgEntry,
                    exitPrice: closePrice,
                    openTime: firstEntry.openTime,
                    closeTime: lastEntry.closeTime || closeTime,
                    pnl: totalPnL,
                    netPnL: totalPnL,
                    realizedPnL: totalPnL,
                    stopLoss: firstEntry.stopLoss,
                    takeProfit: firstEntry.takeProfit,
                    closeType: hitType || 'MANUAL',
                    status: 'closed',
                    // Entry screenshots - primary for backward compat + all screenshots array
                    entryScreenshot: firstEntry.entryScreenshot || null,
                    entryScreenshots: allEntryScreenshots,
                    exitScreenshot: null, // Will be captured below
                    mfe: bestMFE,
                    mae: worstMAE,
                    highestPrice: Math.max(...scaledInfo.entries.map(e => e.highestPrice || e.openPrice)),
                    lowestPrice: Math.min(...scaledInfo.entries.map(e => e.lowestPrice || e.openPrice)),
                    rMultiple: totalRisk > 0 ? (totalPnL / totalRisk) : null,
                    riskAmount: totalRisk,
                    riskPerTrade: totalRisk,
                    rewardToRiskRatio: null,
                    holdingTimeHours: parseFloat(totalHoldingHours),
                    dayOfWeek: dayNames[firstOpenDate.getDay()],
                    hourOfEntry: firstOpenDate.getHours(),
                    hourOfExit: lastCloseDate.getHours(),
                    month: monthNames[firstOpenDate.getMonth()],
                    year: firstOpenDate.getFullYear(),
                    preTradeNotes: firstEntry.preTradeNotes || {},
                    postTradeNotes: {},
                    tags: [],
                    rulesFollowed: null,
                    // SCALED TRADE SPECIFIC DATA
                    isScaledTrade: true,
                    scaledEntries: scaledInfo.entries.map(e => ({
                        id: e.id,
                        quantity: e.quantity,
                        openPrice: e.openPrice,
                        closePrice: e.closePrice,
                        pnl: e.pnl,
                        openTime: e.openTime,
                        closeTime: e.closeTime,
                        entryScreenshot: e.entryScreenshot || null
                    })),
                    scaledGroupId: scaledInfo.groupId,
                    numberOfEntries: scaledInfo.entries.length
                };
                
                console.log(`📊 Created AGGREGATE journal entry for scaled trade group #${scaledInfo.groupId}:`);
                console.log(`   Entries: ${scaledInfo.entries.length}`);
                console.log(`   Total Qty: ${totalQty.toFixed(2)} lots`);
                console.log(`   Avg Entry: ${avgEntry.toFixed(5)}`);
                console.log(`   Total P&L: $${totalPnL.toFixed(2)}`);
            } else if (splitInfo && splitInfo.status === 'CLOSED') {
                // CREATE AGGREGATE JOURNAL ENTRY for SPLIT ENTRIES
                const totalPnL = splitInfo.totalPnL || splitInfo.entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
                const totalRisk = splitInfo.entries.reduce((sum, e) => sum + (e.riskAmount || 0), 0);
                const totalQty = splitInfo.entries.reduce((sum, e) => sum + (e.originalQuantity || e.quantity || 0), 0);
                
                // Calculate weighted average entry price
                let totalCost = 0;
                splitInfo.entries.forEach(e => {
                    totalCost += e.openPrice * (e.originalQuantity || e.quantity);
                });
                const avgEntry = totalCost / totalQty;
                
                // Use first entry's open time and last entry's close time
                const firstEntry = splitInfo.entries[0];
                const lastEntry = splitInfo.entries[splitInfo.entries.length - 1];
                const firstOpenDate = new Date(firstEntry.openTime);
                const lastCloseDate = new Date(lastEntry.closeTime || closeTime);
                const totalHoldingMs = (lastEntry.closeTime || closeTime) - firstEntry.openTime;
                const totalHoldingHours = (totalHoldingMs / (1000 * 60 * 60)).toFixed(2);
                
                // Calculate aggregate MFE/MAE
                const allMFE = splitInfo.entries.map(e => e.mfe || e.openPrice).filter(v => v);
                const allMAE = splitInfo.entries.map(e => e.mae || e.openPrice).filter(v => v);
                const bestMFE = allMFE.length > 0 ? Math.max(...allMFE) : null;
                const worstMAE = allMAE.length > 0 ? Math.min(...allMAE) : null;
                
                // Collect ALL entry screenshots from all split entries
                const allEntryScreenshots = splitInfo.entries
                    .filter(e => e.entryScreenshot)
                    .map(e => ({
                        orderId: e.id,
                        screenshot: e.entryScreenshot,
                        openPrice: e.openPrice,
                        openTime: e.openTime
                    }));
                
                // Collect all partial closes from all entries
                const allPartialCloses = [];
                let totalPartialPnL = 0;
                splitInfo.entries.forEach(e => {
                    if (e.partialCloses && e.partialCloses.length > 0) {
                        allPartialCloses.push(...e.partialCloses.map(pc => ({
                            ...pc,
                            entryId: e.id,
                            entryPrice: e.openPrice
                        })));
                    }
                    totalPartialPnL += e.partialClosePnL || 0;
                });
                
                console.log(`📸 Collected ${allEntryScreenshots.length} entry screenshots from ${splitInfo.entries.length} split entries`);
                console.log(`📊 Total partial closes across all entries: ${allPartialCloses.length}, P&L: $${totalPartialPnL.toFixed(2)}`);
                
                // Use unique ID with prefix to avoid collision with regular trade IDs
                const splitTradeId = `split_${splitInfo.groupId}`;
                
                journalEntry = {
                    id: splitTradeId,
                    tradeId: splitTradeId,
                    type: splitInfo.side,
                    direction: splitInfo.side,
                    symbol: firstEntry.symbol || 'USD',
                    quantity: totalQty,
                    openPrice: avgEntry,
                    closePrice: lastEntry.closePrice || closePrice,
                    entryPrice: avgEntry,
                    exitPrice: lastEntry.closePrice || closePrice,
                    openTime: firstEntry.openTime,
                    closeTime: lastEntry.closeTime || closeTime,
                    pnl: totalPnL,
                    netPnL: totalPnL,
                    realizedPnL: totalPnL,
                    stopLoss: firstEntry.stopLoss,
                    takeProfit: firstEntry.takeProfit,
                    closeType: hitType || 'MANUAL',
                    status: 'closed',
                    // Entry screenshots
                    entryScreenshot: firstEntry.entryScreenshot || null,
                    entryScreenshots: allEntryScreenshots,
                    exitScreenshot: null, // Will be captured below
                    mfe: bestMFE,
                    mae: worstMAE,
                    highestPrice: Math.max(...splitInfo.entries.map(e => e.highestPrice || e.openPrice)),
                    lowestPrice: Math.min(...splitInfo.entries.map(e => e.lowestPrice || e.openPrice)),
                    rMultiple: totalRisk > 0 ? (totalPnL / totalRisk) : null,
                    riskAmount: totalRisk,
                    riskPerTrade: totalRisk,
                    rewardToRiskRatio: null,
                    holdingTimeHours: parseFloat(totalHoldingHours),
                    dayOfWeek: dayNames[firstOpenDate.getDay()],
                    hourOfEntry: firstOpenDate.getHours(),
                    hourOfExit: lastCloseDate.getHours(),
                    month: monthNames[firstOpenDate.getMonth()],
                    year: firstOpenDate.getFullYear(),
                    preTradeNotes: firstEntry.preTradeNotes || {},
                    postTradeNotes: {},
                    tags: [],
                    rulesFollowed: null,
                    // SPLIT ENTRY SPECIFIC DATA
                    isSplitEntry: true,
                    hasPartialCloses: allPartialCloses.length > 0,
                    partialCloses: allPartialCloses,
                    partialClosePnL: totalPartialPnL,
                    splitEntries: splitInfo.entries.map(e => ({
                        id: e.id,
                        quantity: e.originalQuantity || e.quantity,
                        openPrice: e.openPrice,
                        closePrice: e.closePrice,
                        pnl: e.pnl,
                        partialClosePnL: e.partialClosePnL || 0,
                        openTime: e.openTime,
                        closeTime: e.closeTime,
                        entryScreenshot: e.entryScreenshot || null,
                        partialCloses: e.partialCloses || []
                    })),
                    splitGroupId: splitInfo.groupId,
                    numberOfEntries: splitInfo.entries.length
                };
                
                console.log(`📊 Created AGGREGATE journal entry for SPLIT trade group ${splitInfo.groupId}:`);
                console.log(`   Entries: ${splitInfo.entries.length}`);
                console.log(`   Total Qty: ${totalQty.toFixed(2)} lots`);
                console.log(`   Avg Entry: ${avgEntry.toFixed(5)}`);
                console.log(`   Total P&L: $${totalPnL.toFixed(2)} (Partial TPs: $${totalPartialPnL.toFixed(2)})`);
            } else {
                // REGULAR SINGLE TRADE - normal journal entry
                const rewardToRiskRatio = position.stopLoss && position.takeProfit
                    ? (Math.abs(position.takeProfit - position.openPrice) / Math.abs(position.openPrice - position.stopLoss)).toFixed(2)
                    : null;
                
                // Use the TOTAL P&L (includes partial closes)
                const totalPnL = position.pnl; // This already includes partial closes from above
                const partialPnL = position.partialClosePnL || 0;
                const finalClosePnL = position.finalClosePnL || pnl;
                const hasPartialCloses = position.partialCloses && position.partialCloses.length > 0;
                
                // Determine close type - if had partial TPs and then SL, note it
                let closeType = hitType || 'MANUAL';
                if (hasPartialCloses && hitType === 'SL') {
                    closeType = 'SL (after partial TPs)';
                }
                
                journalEntry = {
                    id: position.id,
                    tradeId: position.id,
                    type: position.type,
                    direction: position.type,
                    symbol: position.symbol || 'USD',
                    quantity: position.originalQuantity || position.quantity, // Use original quantity
                    openPrice: position.openPrice,
                    closePrice: closePrice,
                    entryPrice: position.openPrice,
                    exitPrice: closePrice,
                    openTime: position.openTime,
                    closeTime: closeTime,
                    pnl: totalPnL, // TOTAL P&L including partials
                    netPnL: totalPnL,
                    realizedPnL: totalPnL,
                    stopLoss: position.stopLoss,
                    takeProfit: position.takeProfit,
                    closeType: closeType,
                    status: 'closed',
                    entryScreenshot: position.entryScreenshot || null,
                    exitScreenshot: null,
                    mfe: position.mfe || null,
                    mae: position.mae || null,
                    highestPrice: position.highestPrice || null,
                    lowestPrice: position.lowestPrice || null,
                    rMultiple: position.riskAmount ? (totalPnL / position.riskAmount) : null,
                    riskAmount: position.riskAmount || 0,
                    riskPerTrade: position.riskAmount || 0,
                    rewardToRiskRatio: rewardToRiskRatio,
                    holdingTimeHours: parseFloat(holdingTimeHours),
                    dayOfWeek: dayNames[openDate.getDay()],
                    hourOfEntry: openDate.getHours(),
                    hourOfExit: closeDate.getHours(),
                    month: monthNames[openDate.getMonth()],
                    year: openDate.getFullYear(),
                    preTradeNotes: position.preTradeNotes || {},
                    postTradeNotes: {},
                    tags: [],
                    rulesFollowed: null,
                    isScaledTrade: false,
                    // MULTIPLE TP DATA
                    hasPartialCloses: hasPartialCloses,
                    partialCloses: position.partialCloses || [],
                    partialClosePnL: partialPnL,
                    finalClosePnL: finalClosePnL,
                    // SPLIT ENTRY DATA
                    isSplitEntry: position.isSplitEntry || false,
                    splitGroupId: position.splitGroupId || null,
                    splitIndex: position.splitIndex || null,
                    splitTotal: position.splitTotal || null
                };
                
                // Log partial close details
                if (hasPartialCloses) {
                    console.log(`📊 Trade #${position.id} had ${position.partialCloses.length} partial closes:`);
                    position.partialCloses.forEach((pc, i) => {
                        console.log(`   TP${i + 1}: ${(pc.percentage * 100).toFixed(0)}% @ ${pc.closePrice.toFixed(5)} = $${pc.pnl.toFixed(2)}`);
                    });
                    console.log(`   Final close (${hitType}): $${finalClosePnL.toFixed(2)}`);
                    console.log(`   TOTAL P&L: $${totalPnL.toFixed(2)}`);
                }
            }
            
            // Save journal entry IMMEDIATELY (don't wait for modal)
            if (!journalEntry) {
                console.error(`❌ ERROR: journalEntry is undefined for position #${orderId}`);
                console.error(`   scaledInfo:`, scaledInfo);
                console.error(`   splitInfo:`, splitInfo);
                return;
            }
            
            position.pendingJournalEntry = journalEntry;
            
            // Check for duplicate before adding
            const tradeId = journalEntry.tradeId || journalEntry.id;
            console.log(`📔 Checking for duplicate with tradeId: "${tradeId}" (type: ${typeof tradeId})`);
            const existingIndex = this.tradeJournal.findIndex(t => (t.tradeId || t.id) === tradeId);
            console.log(`📔 Existing index: ${existingIndex}, Journal size: ${this.tradeJournal.length}`);
            
            if (existingIndex === -1) {
                this.tradeJournal.push(journalEntry);
                console.log(`📔 ✅ Trade "${tradeId}" (position #${orderId}) saved to journal IMMEDIATELY`);
                console.log(`📊 Journal now has ${this.tradeJournal.length} trades`);
                
                // Save journal
                this.persistJournal();
                console.log('💾 Saved journal');
                
                // Update the Journal tab immediately
                this.updateJournalTab();
                
                // Also force update after a short delay (ensure DOM is ready)
                setTimeout(() => {
                    console.log('🔄 Delayed refresh of journal tab...');
                    this.updateJournalTab();
                    this.updatePositionsPanel();
                }, 100);
            } else {
                console.warn(`⚠️ Trade #${tradeId} already exists in journal - skipping duplicate`);
            }
            
            // Draw exit marker before removing lines
            // Use TOTAL P&L (including partials) for the exit marker
            this.drawExitMarker(position, {
                closePrice: closePrice,
                closeTime: closeTime,
                pnl: totalPnL, // Show total P&L including partial closes
                type: hitType || 'MANUAL'
            });
            
            this.removeEntryMarker(orderId);

            // Show notification based on hit type
            if (hitType === 'SL') {
                this.showNotification(`🛑 Stop Loss Hit! Order #${orderId} closed | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, 'error');
            } else if (hitType === 'TP') {
                // Check if this was from multiple TPs (final target hit)
                const wasMultipleTP = position.tpTargets && position.tpTargets.length > 0;
                const message = wasMultipleTP 
                    ? `🎯 All TP Targets Hit! Order #${orderId} closed | Total P&L: +$${pnl.toFixed(2)}`
                    : `🎯 Take Profit Hit! Order #${orderId} closed | P&L: +$${pnl.toFixed(2)}`;
                this.showNotification(message, 'success');
            } else {
                // Manual close
                const type = pnl >= 0 ? 'success' : 'error';
                this.showNotification(`✅ Position #${orderId} closed | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`, type);
            }
        }
        
        // Only remove lines if it's a full close
        if (!isPartialClose) {
            this.removeOrderLine(orderId);
            this.removeSLTPLines(orderId);
        }
        
        // Clean up any preview lines that might be lingering
        this.removePreviewLines();
        
        // IMPORTANT: Clean up any pending orders with this ID (shouldn't exist but safety check)
        const hadPending = this.pendingOrders.some(p => p.id === orderId);
        if (hadPending) {
            this.pendingOrders = this.pendingOrders.filter(p => p.id !== orderId);
            console.log(`🧹 Cleaned up orphaned pending order #${orderId}`);
        }
        
        this.updatePositionsPanel();
        
        // Check if MFE/MAE tracking window hasn't expired yet
        if (currentCandle && closeTime < position.mfeMaeTrackingEndTime) {
            // Continue tracking this position for MFE/MAE
            this.mfeMaeTrackingPositions.push({
                ...position,
                journalIndex: null // Will be set when saved to journal
            });
            console.log(`📊 Order #${orderId} closed but continuing MFE/MAE tracking until ${new Date(position.mfeMaeTrackingEndTime).toLocaleTimeString()}`);
        }
        
        // Show trade journal modal for post-trade notes
        // Get P&L from pendingJournalEntry if it exists (for scaled/split trades)
        const journalPnL = position.pendingJournalEntry?.pnl;
        const modalPnL = journalPnL || position.pnl || pnl;
        
        // Check if this was a multi-trade (scaled or split) from the journal entry
        const isScaledTrade = position.pendingJournalEntry?.isScaledTrade || false;
        const isSplitTrade = position.pendingJournalEntry?.isSplitEntry || false;
        const numberOfEntries = position.pendingJournalEntry?.numberOfEntries || 
                               position.pendingJournalEntry?.scaledEntries?.length || 
                               position.pendingJournalEntry?.splitEntries?.length || 1;
        
        this.showTradeJournalModal(position, true, {
            closePrice: closePrice,
            closeTime: closeTime,
            pnl: modalPnL,
            type: hitType || 'MANUAL',
            // Pass additional info for multi-trade display
            isScaledTrade: isScaledTrade,
            isSplitTrade: isSplitTrade,
            numberOfEntries: numberOfEntries
        });
    }
    
    /**
     * Make a line draggable vertically
     * @param {Object} line - D3 line selection
     * @param {Object} label - D3 label box selection
     * @param {Object} order - Order object
     * @param {string} lineType - 'entry', 'sl', 'tp', or 'be'
     * @param {Object} extraElements - Optional: { labelText, priceBox, priceText }
     */
    makeLineDraggable(line, label, order, lineType, extraElements = {}) {
        const self = this;
        let isDragging = false;
        let startY = 0;
        let startPrice = 0;
        let dragStartPrice = 0;
        let frameId = null;
        let pipIndicator = null;
        let dollarIndicator = null;
        let rrIndicator = null;
        
        // Throttle helper for calculations
        const throttledUpdate = (fn) => {
            if (frameId) return;
            frameId = requestAnimationFrame(() => {
                fn();
                frameId = null;
            });
        };
        
        // Get native DOM elements
        const lineNode = line.node();
        const labelNode = label.node();
        const labelTextNode = extraElements.labelText?.node?.();
        const priceBoxNode = extraElements.priceBox?.node?.();
        const priceTextNode = extraElements.priceText?.node?.();
        
        const onMouseDown = function(e) {
            // Don't start dragging if clicking on a close button
            if (e.target.closest('.order-close-btn') || 
                e.target.closest('.pending-order-close-btn') || 
                e.target.closest('.sl-close-btn') || 
                e.target.closest('.tp-close-btn')) {
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            startY = e.clientY;
            
            // Store starting price and drag start price
            if (lineType === 'entry') {
                startPrice = order.openPrice;
                dragStartPrice = order.openPrice;
            } else if (lineType === 'sl') {
                startPrice = order.stopLoss;
                dragStartPrice = order.stopLoss;
            } else if (lineType === 'tp') {
                startPrice = order.takeProfit;
                dragStartPrice = order.takeProfit;
            } else if (lineType === 'be') {
                // For BE line, calculate current trigger price
                if (order.breakevenSettings.mode === 'pips') {
                    const profitPrice = order.breakevenSettings.value * self.pipSize;
                    startPrice = order.type === 'BUY' 
                        ? order.openPrice + profitPrice 
                        : order.openPrice - profitPrice;
                } else {
                    const profitPips = order.breakevenSettings.value / (order.quantity * self.pipValuePerLot);
                    const profitPrice = profitPips * self.pipSize;
                    startPrice = order.type === 'BUY' 
                        ? order.openPrice + profitPrice 
                        : order.openPrice - profitPrice;
                }
            }
            
            console.log(`🖱️ Drag started: ${lineType.toUpperCase()} @ ${startPrice.toFixed(5)}`);
            
            // Increase opacity
            line.attr('opacity', 1);
            
            // Force immediate panel update
            self.updatePositionsPanel();
            
            // Add document listeners
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        
        const onMouseMove = function(e) {
            if (!isDragging) return;
            
            const currentY = e.clientY;
            const deltaY = currentY - startY;
            
            // Get current line Y position
            const lineY = parseFloat(line.attr('y1'));
            const newY = lineY + deltaY;
            
            // Convert Y position to price using inverse scale
            if (self.chart.scales && self.chart.scales.yScale) {
                const newPrice = self.chart.scales.yScale.invert(newY);
                
                // Update the order object
                if (lineType === 'entry') {
                    order.openPrice = newPrice;
                } else if (lineType === 'sl') {
                    order.stopLoss = newPrice;
                } else if (lineType === 'tp') {
                    order.takeProfit = newPrice;
                } else if (lineType === 'be') {
                    // BE line is read-only (calculated from entry/SL)
                    return;
                }
                
                // Update line position
                line.attr('y1', newY).attr('y2', newY);
                
                // Update label position
                label.attr('y', newY - 5);
                if (lineType === 'entry') {
                    label.text(`${order.type} #${order.id} @ ${newPrice.toFixed(5)}`);
                } else if (lineType === 'sl') {
                    // Update SL label text with new price
                    if (extraElements.labelText) {
                        // Calculate new SL P&L
                        let slPnL = 0;
                        if (order.type === 'BUY') {
                            slPnL = (newPrice - order.openPrice) * order.quantity * self.contractSize;
                        } else {
                            slPnL = (order.openPrice - newPrice) * order.quantity * self.contractSize;
                        }
                        extraElements.labelText.text(`SL , P&L: ${slPnL >= 0 ? '+' : ''}$${slPnL.toFixed(2)}`);
                    }
                } else if (lineType === 'tp') {
                    // Update TP label text with new price
                    if (extraElements.labelText) {
                        // Calculate new TP P&L
                        let tpPnL = 0;
                        if (order.type === 'BUY') {
                            tpPnL = (newPrice - order.openPrice) * order.quantity * self.contractSize;
                        } else {
                            tpPnL = (order.openPrice - newPrice) * order.quantity * self.contractSize;
                        }
                        extraElements.labelText.text(`TP , P&L: ${tpPnL >= 0 ? '+' : ''}$${tpPnL.toFixed(2)}`);
                    }
                }
                
                // Update price text element
                if (extraElements.priceText) {
                    extraElements.priceText.text(newPrice.toFixed(5));
                }
                
                // Show live pip distance indicator
                const pipDistance = Math.abs(newPrice - dragStartPrice) / self.pipSize;
                if (pipDistance > 0.1) {
                    if (!pipIndicator) {
                        pipIndicator = self.chart.svg.append('text')
                            .attr('class', `pip-indicator-${order.id}`)
                            .attr('fill', '#fbbf24')
                            .attr('font-size', '10px')
                            .attr('font-weight', '600')
                            .attr('text-anchor', 'middle')
                            .attr('pointer-events', 'none');
                    }
                    pipIndicator
                        .attr('x', self.chart.w / 2)
                        .attr('y', newY - 25)
                        .text(`${pipDistance.toFixed(1)} pips`);
                } else if (pipIndicator) {
                    pipIndicator.remove();
                    pipIndicator = null;
                }
                
                // Calculate and show dollar amount for SL/TP (do this immediately, not throttled)
                const entryPrice = order.openPrice;
                if (lineType === 'sl' || lineType === 'tp') {
                    let priceDiff = 0;
                        
                        if (order.type === 'BUY') {
                            priceDiff = lineType === 'tp' 
                                ? (newPrice - entryPrice) 
                                : (entryPrice - newPrice);
                        } else {
                            priceDiff = lineType === 'tp' 
                                ? (entryPrice - newPrice) 
                                : (newPrice - entryPrice);
                        }
                        
                    if (priceDiff > 0) {
                        const pips = priceDiff / self.pipSize;
                        const dollarAmount = pips * order.quantity * self.pipValuePerLot;
                        const color = lineType === 'tp' ? '#22c55e' : '#ef4444';
                        const sign = lineType === 'tp' ? '+' : '-';
                        
                        if (!dollarIndicator) {
                            dollarIndicator = self.chart.svg.append('text')
                                .attr('class', `dollar-indicator-${order.id}`)
                                .attr('fill', color)
                                .attr('font-size', '11px')
                                .attr('font-weight', '700')
                                .attr('text-anchor', 'start')
                                .attr('pointer-events', 'none');
                        }
                        dollarIndicator
                            .attr('x', self.chart.w / 2 + 50)
                            .attr('y', newY + 4)
                            .attr('fill', color)
                            .text(`${sign}$${dollarAmount.toFixed(2)}`);
                    }
                    
                    // Calculate and show live R:R ratio
                    if (order.stopLoss && order.takeProfit) {
                        const risk = Math.abs(entryPrice - order.stopLoss);
                        const reward = Math.abs(order.takeProfit - entryPrice);
                        const rrRatio = risk > 0 ? (reward / risk) : 0;
                        
                        if (!rrIndicator) {
                            rrIndicator = self.chart.svg.append('text')
                                .attr('class', `rr-indicator-${order.id}`)
                                .attr('fill', '#60a5fa')
                                .attr('font-size', '11px')
                                .attr('font-weight', '700')
                                .attr('text-anchor', 'start')
                                .attr('pointer-events', 'none');
                        }
                        rrIndicator
                            .attr('x', self.chart.w / 2 + 50)
                            .attr('y', newY - 12)
                            .text(`R:R ${rrRatio.toFixed(2)}`);
                    }
                }
                
                // Throttled panel update to avoid excessive redraws
                throttledUpdate(() => {
                    self.updatePositionsPanel();
                });
            }
            
            startY = currentY;
        };
        
        const onMouseUp = function(e) {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Remove document listeners
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // Clean up indicators
            if (pipIndicator) {
                pipIndicator.remove();
                pipIndicator = null;
            }
            if (dollarIndicator) {
                dollarIndicator.remove();
                dollarIndicator = null;
            }
            if (rrIndicator) {
                rrIndicator.remove();
                rrIndicator = null;
            }
            if (frameId) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            
            // Reset opacity
            line.attr('opacity', lineType === 'entry' ? 0.8 : 1);
            
            const finalPrice = lineType === 'entry' ? order.openPrice : 
                             lineType === 'sl' ? order.stopLoss : 
                             order.takeProfit;
            
            // Final update - refresh all SL/TP lines and positions panel
            self.updateSLTPLines();
            self.updatePositionsPanel();
            
            console.log(`✅ Drag ended: ${lineType.toUpperCase()} @ ${finalPrice.toFixed(5)}`);
            
            // Show pip distance moved
            const pipsMoved = Math.abs(finalPrice - dragStartPrice) / self.pipSize;
            if (pipsMoved > 0.1) {
                console.log(`   📏 Moved ${pipsMoved.toFixed(1)} pips`);
            }
        };
        
        // Attach native mouse events to all draggable elements
        lineNode.addEventListener('mousedown', onMouseDown);
        labelNode.addEventListener('mousedown', onMouseDown);
        if (labelTextNode) labelTextNode.addEventListener('mousedown', onMouseDown);
        if (priceBoxNode) priceBoxNode.addEventListener('mousedown', onMouseDown);
        if (priceTextNode) priceTextNode.addEventListener('mousedown', onMouseDown);
    }
    
    /**
     * Make a multi-TP line draggable
     */
    makeLineDraggableMultiTP(line, labelBox, labelText, priceBox, priceText, order, targetIndex, target) {
        const self = this;
        let isDragging = false;
        let startY = 0;
        let dragStartPrice = 0;
        let frameId = null;
        let pipIndicator = null;
        let dollarIndicator = null;
        
        // Get native DOM elements
        const lineNode = line.node();
        const labelBoxNode = labelBox?.node();
        const labelTextNode = labelText?.node();
        const priceBoxNode = priceBox?.node();
        const priceTextNode = priceText?.node();
        
        const onMouseDown = function(e) {
            e.preventDefault();
            e.stopPropagation();
            
            isDragging = true;
            startY = e.clientY;
            dragStartPrice = target.price;
            
            console.log(`🖱️ Multi-TP drag started: TP${targetIndex + 1} @ ${target.price.toFixed(5)}`);
            
            // Increase opacity
            line.attr('opacity', 1);
            
            // Add document listeners
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        };
        
        const onMouseMove = function(e) {
            if (!isDragging) return;
            
            const currentY = e.clientY;
            const deltaY = currentY - startY;
            
            // Get current line Y position
            const lineY = parseFloat(line.attr('y1'));
            const newY = lineY + deltaY;
            
            // Convert Y position to price using inverse scale
            if (self.chart.scales && self.chart.scales.yScale) {
                const newPrice = self.chart.scales.yScale.invert(newY);
                
                // Update target price in the order
                if (order.tpTargets && order.tpTargets[targetIndex]) {
                    order.tpTargets[targetIndex].price = newPrice;
                }
                
                // Update line position
                line.attr('y1', newY).attr('y2', newY);
                
                // Update price text
                if (priceText) {
                    priceText.text(newPrice.toFixed(5));
                }
                
                // Show live pip distance indicator
                const pipDistance = Math.abs(newPrice - dragStartPrice) / self.pipSize;
                if (pipDistance > 0.1) {
                    if (!pipIndicator) {
                        pipIndicator = self.chart.svg.append('text')
                            .attr('class', `pip-indicator-tp-${order.id}-${targetIndex}`)
                            .attr('fill', '#fbbf24')
                            .attr('font-size', '10px')
                            .attr('font-weight', '600')
                            .attr('text-anchor', 'middle')
                            .attr('pointer-events', 'none');
                    }
                    pipIndicator
                        .attr('x', self.chart.w / 2)
                        .attr('y', newY - 25)
                        .text(`${pipDistance.toFixed(1)} pips`);
                } else if (pipIndicator) {
                    pipIndicator.remove();
                    pipIndicator = null;
                }
                
                // Calculate dollar amount
                const entryPrice = order.openPrice;
                const targetQuantity = order.quantity * (target.percentage / 100);
                let priceDiff = order.type === 'BUY' 
                    ? (newPrice - entryPrice) 
                    : (entryPrice - newPrice);
                    
                if (priceDiff > 0) {
                    const pips = priceDiff / self.pipSize;
                    const dollarAmount = pips * targetQuantity * self.pipValuePerLot;
                    
                    if (!dollarIndicator) {
                        dollarIndicator = self.chart.svg.append('text')
                            .attr('class', `dollar-indicator-tp-${order.id}-${targetIndex}`)
                            .attr('fill', '#22c55e')
                            .attr('font-size', '11px')
                            .attr('font-weight', '700')
                            .attr('text-anchor', 'start')
                            .attr('pointer-events', 'none');
                    }
                    dollarIndicator
                        .attr('x', self.chart.w / 2 + 50)
                        .attr('y', newY + 4)
                        .text(`+$${dollarAmount.toFixed(2)}`);
                } else if (dollarIndicator) {
                    dollarIndicator.remove();
                    dollarIndicator = null;
                }
                
                // Update SL/TP lines positions (throttled)
                if (!frameId) {
                    frameId = requestAnimationFrame(() => {
                        self.updateSLTPLines();
                        self.updatePositionsPanel();
                        frameId = null;
                    });
                }
            }
            
            startY = currentY;
        };
        
        const onMouseUp = function(e) {
            if (!isDragging) return;
            
            isDragging = false;
            
            // Remove document listeners
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            
            // Clean up indicators
            if (pipIndicator) {
                pipIndicator.remove();
                pipIndicator = null;
            }
            if (dollarIndicator) {
                dollarIndicator.remove();
                dollarIndicator = null;
            }
            if (frameId) {
                cancelAnimationFrame(frameId);
                frameId = null;
            }
            
            // Reset opacity
            line.attr('opacity', 1);
            
            const finalPrice = target.price;
            
            // Final update
            self.updateSLTPLines();
            self.updatePositionsPanel();
            
            console.log(`✅ Multi-TP drag ended: TP${targetIndex + 1} @ ${finalPrice.toFixed(5)}`);
            
            // Show pip distance moved
            const pipsMoved = Math.abs(finalPrice - dragStartPrice) / self.pipSize;
            if (pipsMoved > 0.1) {
                console.log(`   📏 Moved ${pipsMoved.toFixed(1)} pips`);
            }
        };
        
        // Attach native mouse events to all draggable elements
        if (lineNode) lineNode.addEventListener('mousedown', onMouseDown);
        if (labelBoxNode) labelBoxNode.addEventListener('mousedown', onMouseDown);
        if (labelTextNode) labelTextNode.addEventListener('mousedown', onMouseDown);
        if (priceBoxNode) priceBoxNode.addEventListener('mousedown', onMouseDown);
        if (priceTextNode) priceTextNode.addEventListener('mousedown', onMouseDown);
    }
    
    /**
     * Draw order line on chart
     */
    drawOrderLine(order) {
        console.log(`🎨 Drawing order line for ${order.type} #${order.id}`);
        
        if (!this.chart.svg) {
            console.error('❌ Chart SVG not found! Cannot draw order line.');
            return;
        }
        
        const color = order.type === 'BUY' ? '#2962ff' : '#f23645';
        const lineColor = order.type === 'BUY' ? '#2962ff' : '#f23645';
        
        const line = this.chart.svg.append('line')
            .attr('class', `order-line order-${order.id}`)
            .attr('stroke', lineColor)
            .attr('stroke-width', 1)
            .attr('opacity', 1)
            .style('cursor', 'ns-resize');
        
        // Left side label box (colored background)
        const labelBox = this.chart.svg.append('rect')
            .attr('class', `order-label-box order-${order.id}`)
            .attr('fill', color)
            .attr('rx', 2)
            .style('cursor', 'ns-resize');
        
        // Label text (white on colored background)
        const labelText = this.chart.svg.append('text')
            .attr('class', `order-label-text order-${order.id}`)
            .attr('fill', '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .style('cursor', 'ns-resize')
            .text(`${order.type.toLowerCase()} ${order.quantity.toFixed(2)}`);
        
        // Arrow icon
        const arrow = this.chart.svg.append('text')
            .attr('class', `order-arrow order-${order.id}`)
            .attr('fill', '#ffffff')
            .attr('font-size', '12px')
            .attr('font-weight', '700')
            .style('cursor', 'ns-resize')
            .text(order.type === 'BUY' ? '↑' : '↓');
        
        // Right side price box (solid background)
        const priceBox = this.chart.svg.append('rect')
            .attr('class', `order-price-box order-${order.id}`)
            .attr('fill', color)
            .attr('rx', 2)
            .style('cursor', 'ns-resize');
        
        // Price text
        const priceText = this.chart.svg.append('text')
            .attr('class', `order-price-text order-${order.id}`)
            .attr('fill', '#ffffff')
            .attr('font-size', '11px')
            .attr('font-weight', '700')
            .attr('text-anchor', 'middle')
            .style('cursor', 'ns-resize')
            .text(order.openPrice.toFixed(5));
        
        // Close button (X)
        const closeBtn = this.chart.svg.append('g')
            .attr('class', `order-close-btn order-${order.id}`)
            .attr('pointer-events', 'all')
            .style('cursor', 'pointer');
        
        const closeBtnBg = closeBtn.append('circle')
            .attr('r', 10)
            .attr('fill', color)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 1.5)
            .style('pointer-events', 'all')
            .style('cursor', 'pointer');
        
        const closeBtnText = closeBtn.append('text')
            .attr('fill', '#ffffff')
            .attr('font-size', '14px')
            .attr('font-weight', '700')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('pointer-events', 'none')
            .text('×');
        
        // Close button click handler
        closeBtn.on('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (confirm(`Close ${order.type} position #${order.id} at market price?`)) {
                this.closePosition(order.id);
            }
        });
        
        // Hover effect for close button
        closeBtn.on('mouseover', function() {
            closeBtnBg.attr('fill', '#ffffff');
            closeBtnText.attr('fill', color);
        }).on('mouseout', function() {
            closeBtnBg.attr('fill', color);
            closeBtnText.attr('fill', '#ffffff');
        });
        
        // Make line draggable
        this.makeLineDraggable(line, labelBox, order, 'entry');
        
        this.orderLines.push({ 
            orderId: order.id, 
            line, 
            labelBox, 
            labelText,
            arrow,
            priceBox, 
            priceText,
            closeBtn
        });
        
        console.log(`✅ Order line created and added to array (total: ${this.orderLines.length})`);
        
        // Force a chart render which will position the lines automatically
        if (this.chart && typeof this.chart.render === 'function') {
            this.chart.renderPending = true;
            this.chart.render();
            console.log('🎨 Chart render triggered - lines will be positioned automatically');
        }
    }
    
    /**
     * Draw pending order line on chart (dashed line)
     */
    drawPendingOrderLine(pendingOrder) {
        console.log(`🎨 Drawing pending ${pendingOrder.orderType} order line for ${pendingOrder.direction} #${pendingOrder.id}`);
        
        if (!this.chart.svg) {
            console.error('❌ Chart SVG not found! Cannot draw pending order line.');
            return;
        }
        
        // Use direction color for pending orders (blue for BUY, red for SELL)
        const lineColor = pendingOrder.direction === 'BUY' ? '#2962ff' : '#f23645';
        
        const line = this.chart.svg.append('line')
            .attr('class', `pending-order-line pending-${pendingOrder.id}`)
            .attr('stroke', lineColor)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', '5,5')
            .attr('opacity', 0.8)
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');
        
        // Label box with colored background for visibility
        const labelBox = this.chart.svg.append('rect')
            .attr('class', `pending-order-label-box pending-${pendingOrder.id}`)
            .attr('fill', lineColor)
            .attr('rx', 2)
            .style('pointer-events', 'all')
            .style('cursor', 'ns-resize');
        
        // Label text showing order type and direction (white text on colored background)
        const orderTypeLabel = pendingOrder.orderType === 'limit' ? 'LIMIT' : 'STOP';
        const directionLabel = pendingOrder.direction; // BUY or SELL
        const labelText = this.chart.svg.append('text')
            .attr('class', `pending-order-label-text pending-${pendingOrder.id}`)
            .attr('fill', '#ffffff')
            .attr('font-size', '10px')
            .attr('font-weight', '700')
            .style('cursor', 'pointer')
            .text(`${orderTypeLabel} ${directionLabel}`);
        
        // Right side price box (skip if created from position tool - it already shows the price)
        let priceBox = null;
        let priceText = null;
        
        if (!pendingOrder.createdFromTool) {
            priceBox = this.chart.svg.append('rect')
                .attr('class', `pending-order-price-box pending-${pendingOrder.id}`)
                .attr('fill', lineColor)
                .attr('rx', 2)
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            
            // Price text
            priceText = this.chart.svg.append('text')
                .attr('class', `pending-order-price-text pending-${pendingOrder.id}`)
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '700')
                .attr('text-anchor', 'middle')
                .style('cursor', 'pointer')
                .text(pendingOrder.entryPrice.toFixed(5));
        }
        
        // Close button (X) for pending orders
        const closeBtn = this.chart.svg.append('g')
            .attr('class', `pending-order-close-btn pending-${pendingOrder.id}`)
            .attr('pointer-events', 'all')
            .style('cursor', 'pointer');
        
        const closeBtnBg = closeBtn.append('circle')
            .attr('r', 10)
            .attr('fill', lineColor)
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 1.5)
            .style('pointer-events', 'all')
            .style('cursor', 'pointer');
        
        const closeBtnText = closeBtn.append('text')
            .attr('fill', '#ffffff')
            .attr('font-size', '14px')
            .attr('font-weight', '700')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .style('pointer-events', 'none')
            .text('×');
        
        // Close button click handler
        closeBtn.on('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            if (confirm(`Cancel ${orderTypeLabel} ${pendingOrder.direction} order #${pendingOrder.id}?`)) {
                this.cancelPendingOrder(pendingOrder.id);
            }
        });
        
        // Hover effect for close button
        closeBtn.on('mouseover', function() {
            closeBtnBg.attr('fill', '#ffffff');
            closeBtnText.attr('fill', lineColor);
        }).on('mouseout', function() {
            closeBtnBg.attr('fill', lineColor);
            closeBtnText.attr('fill', '#ffffff');
        });
        
        // Make entry line draggable
        const self = this;
        let isDragging = false;
        
        const drag = d3.drag()
            .on('start', function() {
                isDragging = true;
                line.attr('stroke-width', 3).attr('opacity', 1);
                console.log(`🎯 Started dragging pending entry line`);
            })
            .on('drag', function(event) {
                if (!isDragging || !self.chart?.scales?.yScale) return;
                
                const chartHeight = self.chart.h || 500;
                const clampedY = Math.max(0, Math.min(chartHeight, event.y));
                const newPrice = self.chart.scales.yScale.invert(clampedY);
                
                // Update line position
                line.attr('y1', clampedY).attr('y2', clampedY);
                
                // Use same positioning as updateOrderLines
                const boxHeight = 18;
                const boxY = clampedY - boxHeight / 2;
                const yAxisWidth = 70;
                
                // Position close button (rightmost, before Y-axis area)
                closeBtn.attr('transform', `translate(${self.chart.w - yAxisWidth - 15}, ${clampedY})`);
                
                // Position label box to the left of close button
                const labelTextBbox = labelText.node().getBBox();
                const labelBoxWidth = labelTextBbox.width + 20;
                const labelBoxX = self.chart.w - yAxisWidth - 30 - labelBoxWidth;
                
                labelBox
                    .attr('x', labelBoxX)
                    .attr('y', boxY)
                    .attr('width', labelBoxWidth)
                    .attr('height', boxHeight);
                
                labelText
                    .attr('x', labelBoxX + 10)
                    .attr('y', clampedY + 4);
                
                // Hide price box/text (price shown on Y-axis)
                if (priceBox) priceBox.style('display', 'none');
                if (priceText) priceText.style('display', 'none');
                
                pendingOrder.entryPrice = newPrice;
            })
            .on('end', function() {
                if (!isDragging) return;
                isDragging = false;
                
                line.attr('stroke-width', 2).attr('opacity', 0.8);
                
                const formattedPrice = self.formatPrice(pendingOrder.entryPrice);
                console.log(`📍 Pending entry moved to ${formattedPrice}`);
                
                // Redraw targets to update P&L
                self.removePendingSLTPLines(pendingOrder.id);
                self.drawPendingOrderTargets(pendingOrder);
                
                self.showNotification(`✏️ Entry moved to ${formattedPrice}`, 'info');
            });
        
        // Apply drag to line, labelBox, and priceBox
        line.call(drag);
        labelBox.call(drag);
        if (priceBox) priceBox.call(drag);
        
        this.orderLines.push({ 
            orderId: pendingOrder.id, 
            isPending: true,
            line, 
            labelBox, 
            labelText,
            priceBox,
            closeBtn, 
            priceText 
        });
        
        console.log(`✅ Pending order line created (total lines: ${this.orderLines.length})`);
        
        // Force a chart render
        if (this.chart && typeof this.chart.render === 'function') {
            this.chart.renderPending = true;
            this.chart.render();
        }
    }

    drawPendingOrderTargets(pendingOrder) {
        if (!this.chart?.svg) return;
        const entries = [];
        const entryPrice = pendingOrder.entryPrice;
        const quantity = pendingOrder.quantity;
        const direction = pendingOrder.direction; // 'BUY' or 'SELL'

        const self = this;
        
        const createLine = (price, type, labelText = null, pnl = null, targetId = null, percentage = null) => {
            if (!price) return null;
            const color = type === 'TP' ? '#22c55e' : type === 'SL' ? '#f23645' : '#f59e0b';
            const isDraggable = (type === 'TP' || type === 'SL');
            
            const line = this.chart.svg.append('line')
                .attr('class', `pending-${type.toLowerCase()}-line pending-${type.toLowerCase()}-${pendingOrder.id}`)
                .attr('stroke', color)
                .attr('stroke-width', isDraggable ? 3 : 1.5)
                .attr('stroke-dasharray', type === 'BE' ? '4,3' : '6,4')
                .attr('opacity', type === 'BE' ? 0.8 : 0.9)
                .style('pointer-events', isDraggable ? 'all' : 'none')
                .style('cursor', isDraggable ? 'ns-resize' : 'default');

            const labelGroup = this.chart.svg.append('g')
                .attr('class', `pending-${type.toLowerCase()}-label pending-${type.toLowerCase()}-${pendingOrder.id}`)
                .style('pointer-events', isDraggable ? 'all' : 'none')
                .style('cursor', isDraggable ? 'ns-resize' : 'default');

            return { price, type, line, labelGroup, labelText, pnl, orderId: pendingOrder.id, targetId, percentage };
        };

        // Check if we have multiple TP targets
        if (pendingOrder.tpTargets && pendingOrder.tpTargets.length > 0) {
            // Draw multiple TP lines with P&L calculated from THIS pending order's entry
            pendingOrder.tpTargets.forEach((target, index) => {
                if (target.hit) return; // Skip already hit targets
                
                // Calculate P&L for this TP target based on pending order's entry
                let tpPnL = 0;
                const closeQty = quantity * (target.percentage / 100);
                if (direction === 'BUY') {
                    tpPnL = (target.price - entryPrice) * closeQty * this.contractSize;
                } else {
                    tpPnL = (entryPrice - target.price) * closeQty * this.contractSize;
                }
                
                const labelText = `TP${index + 1} (${target.percentage.toFixed(0)}%) , P&L: ${tpPnL >= 0 ? '+' : ''}$${tpPnL.toFixed(2)}`;
                const item = createLine(target.price, 'TP', labelText, tpPnL, target.id || index, target.percentage);
                if (item) {
                    entries.push(item);
                }
            });
        } else if (pendingOrder.takeProfit) {
            // Single TP - calculate P&L
            let tpPnL = 0;
            if (direction === 'BUY') {
                tpPnL = (pendingOrder.takeProfit - entryPrice) * quantity * this.contractSize;
            } else {
                tpPnL = (entryPrice - pendingOrder.takeProfit) * quantity * this.contractSize;
            }
            const labelText = `TP , P&L: ${tpPnL >= 0 ? '+' : ''}$${tpPnL.toFixed(2)}`;
            const item = createLine(pendingOrder.takeProfit, 'TP', labelText, tpPnL);
            if (item) entries.push(item);
        }
        
        // Draw SL with P&L calculated from THIS pending order's entry
        if (pendingOrder.stopLoss) {
            let slPnL = 0;
            if (direction === 'BUY') {
                slPnL = (pendingOrder.stopLoss - entryPrice) * quantity * this.contractSize;
            } else {
                slPnL = (entryPrice - pendingOrder.stopLoss) * quantity * this.contractSize;
            }
            const labelText = `SL , P&L: ${slPnL >= 0 ? '+' : ''}$${slPnL.toFixed(2)}`;
            const item = createLine(pendingOrder.stopLoss, 'SL', labelText, slPnL);
            if (item) entries.push(item);
        }
        
        // Add BE trigger line if breakeven is enabled
        if (pendingOrder.autoBreakeven && pendingOrder.breakevenSettings && pendingOrder.stopLoss) {
            const entryPrice = pendingOrder.entryPrice;
            let beTriggerPrice = 0;
            
            if (pendingOrder.breakevenSettings.mode === 'pips') {
                // Pips mode - direct conversion
                const profitPrice = pendingOrder.breakevenSettings.value * this.pipSize;
                beTriggerPrice = pendingOrder.direction === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            } else {
                // Amount mode
                const profitPips = pendingOrder.breakevenSettings.value / (pendingOrder.quantity * this.pipValuePerLot);
                const profitPrice = profitPips * this.pipSize;
                beTriggerPrice = pendingOrder.direction === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            }
            
            const beItem = createLine(beTriggerPrice, 'BE');
            if (beItem) {
                beItem.beMode = pendingOrder.breakevenSettings.mode;
                beItem.beValue = pendingOrder.breakevenSettings.value;
                entries.push(beItem);
            }
        }

        if (entries.length === 0) return;

        this.pendingTargetLines.push({ orderId: pendingOrder.id, pendingOrder: pendingOrder, targets: entries });

        this.positionPendingOrderTargets();
    }

    positionPendingOrderTargets() {
        if (!this.chart?.scales?.yScale || !this.pendingTargetLines) return;

        // Clean up orphaned pending target highlights
        this.chart.svg.selectAll('.y-axis-pending-sl-highlight').remove();
        this.chart.svg.selectAll('.y-axis-pending-tp-highlight').remove();
        this.chart.svg.selectAll('.y-axis-pending-be-highlight').remove();

        const marginRight = 90;
        const lineStopOffset = 14;

        this.pendingTargetLines.forEach(entry => {
            entry.targets.forEach(target => {
                const y = this.chart.scales.yScale(target.price);
                const isDraggable = (target.type === 'TP' || target.type === 'SL');
                
                // Position visible line
                target.line
                    .attr('x1', 0)
                    .attr('x2', this.chart.w - lineStopOffset)
                    .attr('y1', y)
                    .attr('y2', y)
                    .style('cursor', isDraggable ? 'ns-resize' : 'default');

                const labelGroup = target.labelGroup;
                labelGroup.selectAll('*').remove();

                const bgColor = target.type === 'TP' ? '#22c55e' 
                    : target.type === 'SL' ? '#f23645' 
                    : '#f59e0b';
                
                const labelRect = labelGroup.append('rect')
                    .attr('rx', 2)
                    .attr('fill', bgColor);

                let displayLabel = '';
                if (target.labelText) {
                    displayLabel = target.labelText;
                } else if (target.type === 'BE') {
                    displayLabel = target.beMode === 'pips' 
                        ? `BE @ ${target.beValue}p`
                        : `BE @ $${target.beValue}`;
                } else {
                    displayLabel = `${target.type} ${this.formatPrice(target.price)}`;
                }

                const text = labelGroup.append('text')
                    .attr('fill', '#ffffff')
                    .attr('font-size', '11px')
                    .attr('font-weight', '700')
                    .style('pointer-events', 'none')
                    .text(displayLabel);

                const bbox = text.node().getBBox();
                const labelWidth = bbox.width + 16;
                const labelHeight = bbox.height + 8;
                
                // Store dimensions for drag calculations
                target.labelDimensions = { width: labelWidth, height: labelHeight };
                
                labelRect
                    .attr('width', labelWidth)
                    .attr('height', labelHeight)
                    .attr('x', 0)
                    .attr('y', 0);

                text
                    .attr('x', labelWidth / 2)
                    .attr('y', labelHeight / 2)
                    .attr('text-anchor', 'middle')
                    .attr('dy', '0.35em');

                const translateX = this.chart.w - labelWidth - marginRight;
                const translateY = y - labelHeight / 2;
                labelGroup
                    .attr('transform', `translate(${translateX}, ${translateY})`)
                    .style('cursor', isDraggable ? 'ns-resize' : 'default');
                
                // Apply drag to BOTH line AND labelGroup (same pattern as executed orders)
                if (isDraggable && entry.pendingOrder && !target.dragApplied) {
                    this.makePendingTargetDraggable(target, entry.pendingOrder);
                    target.dragApplied = true;
                }
                
                // Add Y-axis price highlight
                if (target.priceHighlight) {
                    target.priceHighlight.remove();
                }
                target.priceHighlight = this.drawYAxisPriceHighlight(
                    target.price, 
                    bgColor, 
                    `pending-${target.type.toLowerCase()}`, 
                    0
                );
            });
        });
    }

    /**
     * Make pending order TP/SL target draggable (same pattern as executed orders)
     */
    makePendingTargetDraggable(target, pendingOrder) {
        const self = this;
        let isDragging = false;
        
        const drag = d3.drag()
            .on('start', function() {
                isDragging = true;
                target.line.attr('stroke-width', 5).attr('opacity', 1);
                console.log(`🎯 Started dragging pending ${target.type}`);
            })
            .on('drag', function(event) {
                if (!isDragging || !self.chart?.scales?.yScale) return;
                
                const chartHeight = self.chart.h || 500;
                const clampedY = Math.max(0, Math.min(chartHeight, event.y));
                const newPrice = self.chart.scales.yScale.invert(clampedY);
                
                // Update line position
                target.line.attr('y1', clampedY).attr('y2', clampedY);
                
                // Update label position
                const dims = target.labelDimensions || { width: 80, height: 20 };
                const marginRight = 90;
                const translateX = self.chart.w - dims.width - marginRight;
                target.labelGroup.attr('transform', `translate(${translateX}, ${clampedY - dims.height / 2})`);
                
                // Update Y-axis highlight
                if (target.priceHighlight) {
                    target.priceHighlight.remove();
                }
                const color = target.type === 'TP' ? '#22c55e' : '#f23645';
                target.priceHighlight = self.drawYAxisPriceHighlight(newPrice, color, `pending-${target.type.toLowerCase()}`, 0);
                
                target.price = newPrice;
            })
            .on('end', function() {
                if (!isDragging) return;
                isDragging = false;
                
                target.line.attr('stroke-width', 3).attr('opacity', 0.9);
                
                const formattedPrice = self.formatPrice(target.price);
                console.log(`📍 Pending ${target.type} moved to ${formattedPrice}`);
                
                // Update pending order data
                if (target.type === 'TP') {
                    if (target.targetId !== undefined && target.targetId !== null && pendingOrder.tpTargets) {
                        const tpTarget = pendingOrder.tpTargets.find(t => t.id === target.targetId);
                        if (tpTarget) tpTarget.price = parseFloat(formattedPrice);
                    } else {
                        pendingOrder.takeProfit = parseFloat(formattedPrice);
                    }
                } else if (target.type === 'SL') {
                    pendingOrder.stopLoss = parseFloat(formattedPrice);
                }
                
                // Redraw targets to update P&L display
                self.removePendingSLTPLines(pendingOrder.id);
                self.drawPendingOrderTargets(pendingOrder);
                
                self.showNotification(`✏️ ${target.type} moved to ${formattedPrice}`, 'info');
            });
        
        // Apply drag to BOTH line AND labelGroup (same as executed orders)
        target.line.call(drag);
        target.labelGroup.call(drag);
    }

    removePendingSLTPLines(orderId) {
        if (!this.pendingTargetLines) return;
        const record = this.pendingTargetLines.find(entry => entry.orderId === orderId);
        if (!record) return;

        record.targets.forEach(target => {
            target.line?.remove();
            target.labelGroup?.remove();
            target.priceHighlight?.remove();
        });
        if (this.pendingTargetLines) this.pendingTargetLines = this.pendingTargetLines.filter(entry => entry.orderId !== orderId);
    }
    
    /**
     * Remove pending order line from chart
     */
    removePendingOrderLine(orderId) {
        console.log(`🗑️ removePendingOrderLine called for order #${orderId}`);
        
        const lineData = this.orderLines.find(l => l.orderId === orderId && l.isPending);
        if (lineData) {
            try {
                if (lineData.line) lineData.line.remove();
                if (lineData.labelBox) lineData.labelBox.remove();
                if (lineData.labelText) lineData.labelText.remove();
                if (lineData.priceBox) lineData.priceBox.remove();
                if (lineData.priceText) lineData.priceText.remove();
                if (lineData.closeBtn) lineData.closeBtn.remove();
            } catch (e) {
                console.error('Error removing lineData elements:', e);
            }
            
            this.orderLines = this.orderLines.filter(l => !(l.orderId === orderId && l.isPending));
            console.log(`✅ Pending order line removed for order #${orderId}`);
        }
        
        // Also directly remove SVG elements by class selector (fallback)
        if (this.chart?.svg) {
            this.chart.svg.selectAll(`.pending-${orderId}`).remove();
            this.chart.svg.selectAll(`.pending-order-line.pending-${orderId}`).remove();
            this.chart.svg.selectAll(`.pending-order-price-box.pending-${orderId}`).remove();
            this.chart.svg.selectAll(`.pending-order-price-text.pending-${orderId}`).remove();
            this.chart.svg.selectAll(`.pending-order-label-box.pending-${orderId}`).remove();
            this.chart.svg.selectAll(`.pending-order-label-text.pending-${orderId}`).remove();
            this.chart.svg.selectAll(`.pending-order-close-btn.pending-${orderId}`).remove();
            console.log(`✅ Fallback: removed all .pending-${orderId} elements from SVG`);
        }

        this.removePendingSLTPLines(orderId);
    }
    
    /**
     * Cancel a pending order
     */
    cancelPendingOrder(orderId) {
        const pendingOrder = this.pendingOrders.find(o => o.id === orderId);
        if (!pendingOrder) return;
        
        // Remove from pending orders
        if (this.orderService) {
            this.orderService.removePendingOrder(orderId);
        } else {
            this.pendingOrders = this.pendingOrders.filter(o => o.id !== orderId);
        }
        
        // Remove visual line
        this.removePendingOrderLine(orderId);
        
        const orderTypeLabel = pendingOrder.orderType === 'limit' ? 'Limit' : 'Stop';
        console.log(`❌ Cancelled ${orderTypeLabel} ${pendingOrder.direction} order #${orderId}`);
        this.showNotification(`❌ ${orderTypeLabel} ${pendingOrder.direction} Order #${orderId} cancelled`, 'info');
        
        this.updatePositionsPanel();
    }
    
    /**
     * Draw entry marker on chart (TradingView style)
     */
    drawEntryMarker(order) {
        console.log('🎯 drawEntryMarker called for order:', order.id, order.type);
        console.log('   Chart:', !!this.chart, 'SVG:', !!this.chart?.svg, 'Scales:', !!this.chart?.scales);
        
        if (!this.chart || !this.chart.svg || !this.chart.scales) {
            console.error('❌ Cannot draw entry marker - chart not ready');
            console.error('   this.chart:', this.chart);
            console.error('   this.chart.svg:', this.chart?.svg);
            console.error('   this.chart.scales:', this.chart?.scales);
            return;
        }

        const { xScale, yScale } = this.chart.scales;
        if (!xScale || !yScale) {
            console.error('❌ xScale or yScale not available');
            return;
        }

        // Debug: Log order time and available candle times
        console.log('   🔍 Looking for candle with openTime:', order.openTime);
        console.log('   📊 Total candles:', this.chart.data.length);
        console.log('   📊 Last 5 candle times:', this.chart.data.slice(-5).map(d => d.t));
        
        // Find the index of the candle with matching timestamp
        let dataIndex = this.chart.data.findIndex(d => d.t === order.openTime);
        
        // If exact match not found, find the closest candle
        if (dataIndex === -1) {
            console.warn('⚠️ Exact timestamp not found, searching for closest candle...');
            let closestIndex = -1;
            let minDiff = Infinity;
            
            this.chart.data.forEach((candle, i) => {
                const diff = Math.abs(candle.t - order.openTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = i;
                }
            });
            
            if (closestIndex !== -1) {
                dataIndex = closestIndex;
                console.log('   ✅ Found closest candle at index:', dataIndex, 'time:', this.chart.data[dataIndex].t, 'diff:', minDiff, 'ms');
            } else {
                console.error('❌ Cannot find any candle near timestamp:', order.openTime);
                return;
            }
        } else {
            console.log('   ✅ Found exact match at index:', dataIndex);
        }
        
        // Get candle spacing for centering
        const candleSpacing = this.chart.getCandleSpacing();
        const m = this.chart.margin;
        
        console.log('   📐 Candle spacing:', candleSpacing, 'offsetX:', this.chart.offsetX);
        
        // Use the SAME formula as candle rendering (chart.js line 4584)
        // x = margin.left + (index * spacing) + offsetX + center_offset
        const x = m.l + (dataIndex * candleSpacing) + this.chart.offsetX + (candleSpacing / 2);
        const y = yScale(order.openPrice);
        
        console.log('   📊 Chart dimensions: width=', this.chart.w, 'height=', this.chart.h);
        console.log('   ✅ X in bounds?', x >= 0 && x <= this.chart.w, '| Y in bounds?', y >= 0 && y <= this.chart.h);
        
        const isBuy = order.type === 'BUY';
        const color = isBuy ? '#22c55e' : '#ef4444';
        const labelText = isBuy ? 'BUY' : 'SELL';
        
        // Append directly to main SVG (not to any child group to avoid clip-path issues)
        console.log('   Appending to main SVG');
        
        // Create marker group - append to main svg and bring to VERY front
        const markerGroup = this.chart.svg.append('g')
            .attr('class', `entry-marker entry-marker-${order.id}`)
            .attr('data-order-id', order.id)
            .style('pointer-events', 'none')
            .style('clip-path', 'none') // Disable clipping
            .raise(); // Bring to front
        
        console.log('   ✅ Marker group created at x=', x, 'y=', y);
        
        // Simple text label: "SELL 1.23456" or "BUY 1.23456"
        const priceText = `${labelText} ${order.openPrice.toFixed(5)}`;
        const labelY = isBuy ? y + 18 : y - 10;
        
        // Simple text with drop shadow for visibility
        markerGroup.append('text')
            .attr('data-role', 'entry-label-text')
            .attr('x', x)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', color)
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('font-family', 'Roboto, sans-serif').text(priceText);
        
        // Store marker reference for updates
        if (!this.entryMarkers) this.entryMarkers = [];
        this.entryMarkers.push({
            marker: markerGroup,
            time: order.openTime,
            price: order.openPrice,
            orderId: order.id,
            type: order.type,
            hasPriceElements: true
        });
        
        console.log(`✅ Entry marker drawn for order #${order.id} at index ${dataIndex}`);
        console.log(`   Stored ${this.entryMarkers.length} entry markers for pan/zoom updates`);
    }
    
    /**
     * Draw exit marker on chart (TradingView style)
     * Aggregates P&L for markers at the same price level (for split entries)
     */
    drawExitMarker(order, closeData) {
        if (!this.chart || !this.chart.svg || !this.chart.scales) {
            console.warn('⚠️ Cannot draw exit marker - chart not ready');
            return;
        }

        const { xScale, yScale } = this.chart.scales;
        if (!xScale || !yScale) return;

        // Find the index of the candle with matching timestamp
        const dataIndex = this.chart.data.findIndex(d => d.t === closeData.closeTime);
        if (dataIndex === -1) {
            console.error('❌ Cannot find exit candle with timestamp:', closeData.closeTime);
            return;
        }

        // Get candle spacing and margin
        const candleSpacing = this.chart.getCandleSpacing();
        const m = this.chart.margin;

        // Use same formula as candle rendering
        const x = m.l + (dataIndex * candleSpacing) + this.chart.offsetX + (candleSpacing / 2);
        const y = yScale(closeData.closePrice);
        
        console.log('   Exit Position: x=', x, 'y=', y, 'data index=', dataIndex);
        
        // Check if there's already an exit marker at this price level (for aggregation)
        if (!this.exitMarkers) this.exitMarkers = [];
        
        const priceKey = closeData.closePrice.toFixed(5);
        const existingMarker = this.exitMarkers.find(m => 
            m.priceKey === priceKey && m.time === closeData.closeTime
        );
        
        if (existingMarker) {
            // Aggregate P&L to existing marker
            existingMarker.totalPnL += closeData.pnl;
            existingMarker.count++;
            
            // Update the existing marker's text
            const isProfitable = existingMarker.totalPnL >= 0;
            const color = isProfitable ? '#22c55e' : '#ef4444';
            const pnlText = `${isProfitable ? '+' : ''}$${existingMarker.totalPnL.toFixed(2)}`;
            
            existingMarker.marker.select('[data-role="exit-pnl-text"]')
                .attr('fill', color)
                .text(pnlText);
            
            console.log(`   📊 Aggregated exit: ${existingMarker.count} positions, total P&L: ${existingMarker.totalPnL.toFixed(2)}`);
            return;
        }
        
        const isProfitable = closeData.pnl >= 0;
        const color = isProfitable ? '#22c55e' : '#ef4444';
        
        // Append directly to main SVG to avoid clip-path
        const markerGroup = this.chart.svg.append('g')
            .attr('class', `exit-marker exit-marker-${order.id}`)
            .style('pointer-events', 'none')
            .style('clip-path', 'none')
            .raise(); // Bring to front
        
        setTimeout(() => markerGroup.raise(), 50);
        
        // Simple text: "+$345.94" or "-$100.00" with close price
        const pnlText = `${isProfitable ? '+' : ''}$${closeData.pnl.toFixed(2)}`;
        const priceText = closeData.closePrice.toFixed(5);
        const labelY = y - 10;
        
        // P&L text with drop shadow for visibility
        markerGroup.append('text')
            .attr('data-role', 'exit-pnl-text')
            .attr('x', x)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', color)
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('font-family', 'Roboto, sans-serif')
            .text(pnlText);
        
        // Close price below P&L
        markerGroup.append('text')
            .attr('data-role', 'exit-price-text')
            .attr('x', x)
            .attr('y', labelY + 14)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', '#9ca3af')
            .attr('font-size', '10px')
            .attr('font-weight', '400')
            .attr('font-family', 'Roboto, sans-serif')
            .text(priceText);
        
        // Store marker reference with aggregation data
        this.exitMarkers.push({
            orderId: order.id,
            marker: markerGroup,
            time: closeData.closeTime,
            price: closeData.closePrice,
            priceKey: priceKey,
            totalPnL: closeData.pnl,
            count: 1
        });
        
        console.log(`✅ Exit marker drawn for order #${order.id} (P&L: ${pnlText})`);
    }
    
    /**
     * Draw partial close marker on chart (for TP partial hits)
     * Aggregates P&L for markers at the same price level (for split entries)
     */
    drawPartialCloseMarker(order, closeData) {
        if (!this.chart || !this.chart.svg || !this.chart.scales) {
            console.warn('⚠️ Cannot draw partial close marker - chart not ready');
            return;
        }

        const { xScale, yScale } = this.chart.scales;
        if (!xScale || !yScale) return;

        // Find the index of the candle with matching timestamp
        const dataIndex = this.chart.data.findIndex(d => d.t === closeData.closeTime);
        if (dataIndex === -1) {
            console.error('❌ Cannot find partial close candle with timestamp:', closeData.closeTime);
            return;
        }

        // Get candle spacing and margin
        const candleSpacing = this.chart.getCandleSpacing();
        const m = this.chart.margin;

        // Use same formula as candle rendering
        const x = m.l + (dataIndex * candleSpacing) + this.chart.offsetX + (candleSpacing / 2);
        const y = yScale(closeData.closePrice);
        
        console.log('   Partial Close Position: x=', x, 'y=', y, 'data index=', dataIndex);
        
        // Check if there's already a marker at this price level (for aggregation)
        if (!this.partialCloseMarkers) this.partialCloseMarkers = [];
        
        const priceKey = closeData.closePrice.toFixed(5);
        const existingMarker = this.partialCloseMarkers.find(m => 
            m.priceKey === priceKey && m.time === closeData.closeTime
        );
        
        if (existingMarker) {
            // Aggregate P&L to existing marker
            existingMarker.totalPnL += closeData.pnl;
            existingMarker.count++;
            
            // Update the existing marker's text
            const isProfitable = existingMarker.totalPnL >= 0;
            const color = isProfitable ? '#22c55e' : '#ef4444';
            const pnlText = `${isProfitable ? '+' : ''}$${existingMarker.totalPnL.toFixed(2)}`;
            
            existingMarker.marker.select('[data-role="partial-pnl-text"]')
                .attr('fill', color)
                .text(pnlText);
            
            console.log(`   📊 Aggregated partial close: ${existingMarker.count} positions, total P&L: ${existingMarker.totalPnL.toFixed(2)}`);
            return;
        }
        
        const isProfitable = closeData.pnl >= 0;
        const color = isProfitable ? '#22c55e' : '#ef4444';
        const percentText = `${(closeData.percentage * 100).toFixed(0)}%`;
        
        // Append directly to main SVG to avoid clip-path
        const markerGroup = this.chart.svg.append('g')
            .attr('class', `partial-close-marker partial-close-marker-${order.id}-${closeData.targetId}`)
            .style('pointer-events', 'none')
            .style('clip-path', 'none')
            .raise(); // Bring to front
        
        setTimeout(() => markerGroup.raise(), 50);
        
        // P&L text with percentage indicator
        const pnlText = `${isProfitable ? '+' : ''}$${closeData.pnl.toFixed(2)}`;
        const priceText = closeData.closePrice.toFixed(5);
        const labelY = y - 10;
        
        // P&L text 
        markerGroup.append('text')
            .attr('data-role', 'partial-pnl-text')
            .attr('x', x)
            .attr('y', labelY)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', color)
            .attr('font-size', '11px')
            .attr('font-weight', '600')
            .attr('font-family', 'Roboto, sans-serif')
            .text(pnlText);
        
        // Close price below P&L
        markerGroup.append('text')
            .attr('data-role', 'partial-price-text')
            .attr('x', x)
            .attr('y', labelY + 14)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'middle')
            .attr('fill', '#9ca3af')
            .attr('font-size', '10px')
            .attr('font-weight', '400')
            .attr('font-family', 'Roboto, sans-serif')
            .text(priceText);
        
        // Store marker reference with aggregation data
        this.partialCloseMarkers.push({
            orderId: order.id,
            targetId: closeData.targetId,
            marker: markerGroup,
            time: closeData.closeTime,
            priceKey: priceKey,
            totalPnL: closeData.pnl,
            count: 1,
            price: closeData.closePrice
        });
        
        console.log(`✅ Partial close marker drawn for order #${order.id} target #${closeData.targetId} (P&L: ${pnlText})`);
    }
    
    /**
     * Update entry/exit marker positions on chart render
     */
    updateTradeMarkers() {
        if (!this.chart || !this.chart.scales) return;
        
        const { xScale, yScale } = this.chart.scales;
        if (!xScale || !yScale) return;
        
        const entryCount = this.entryMarkers?.length || 0;
        const exitCount = this.exitMarkers?.length || 0;
        
        if (entryCount > 0 || exitCount > 0) {
            console.log(`📍 Updating ${entryCount} entry markers and ${exitCount} exit markers`);
        }
        
        // Update entry markers (simplified structure - just text)
        if (this.entryMarkers && this.entryMarkers.length > 0) {
            this.entryMarkers.forEach(markerData => {
                const { marker, time, price, type } = markerData;
                // Find candle index for this timestamp
                const dataIndex = this.chart.data.findIndex(d => d.t === time);
                if (dataIndex === -1) return;
                
                // Get candle spacing and margin
                const candleSpacing = this.chart.getCandleSpacing();
                const m = this.chart.margin;
                
                // Use same formula as candle rendering
                const x = m.l + (dataIndex * candleSpacing) + this.chart.offsetX + (candleSpacing / 2);
                const y = yScale(price);
                
                const isBuy = type === 'BUY';
                const labelY = isBuy ? y + 18 : y - 10;
                
                // Update simple text label position
                const labelText = marker.select('[data-role="entry-label-text"]');
                if (!labelText.empty()) {
                    labelText.attr('x', x).attr('y', labelY);
                }
            });
        }
        
        // Update exit markers (simplified structure - just text)
        if (this.exitMarkers && this.exitMarkers.length > 0) {
            this.exitMarkers.forEach(({ marker, time, price }) => {
                // Find candle index for this timestamp
                const dataIndex = this.chart.data.findIndex(d => d.t === time);
                if (dataIndex === -1) return;
                
                // Get candle spacing and margin
                const candleSpacing = this.chart.getCandleSpacing();
                const m = this.chart.margin;
                
                // Use same formula as candle rendering
                const x = m.l + (dataIndex * candleSpacing) + this.chart.offsetX + (candleSpacing / 2);
                const y = yScale(price);
                
                const labelY = y - 10;
                
                // Update P&L text position
                const pnlText = marker.select('[data-role="exit-pnl-text"]');
                if (!pnlText.empty()) {
                    pnlText.attr('x', x).attr('y', labelY);
                }
                
                // Update price text position
                const priceText = marker.select('[data-role="exit-price-text"]');
                if (!priceText.empty()) {
                    priceText.attr('x', x).attr('y', labelY + 14);
                }
            });
        }
        
        // Update partial close markers (for TP partial hits)
        if (this.partialCloseMarkers && this.partialCloseMarkers.length > 0) {
            this.partialCloseMarkers.forEach(({ marker, time, price }) => {
                // Find candle index for this timestamp
                const dataIndex = this.chart.data.findIndex(d => d.t === time);
                if (dataIndex === -1) return;
                
                // Get candle spacing and margin
                const candleSpacing = this.chart.getCandleSpacing();
                const m = this.chart.margin;
                
                // Use same formula as candle rendering
                const x = m.l + (dataIndex * candleSpacing) + this.chart.offsetX + (candleSpacing / 2);
                const y = yScale(price);
                
                const labelY = y - 10;
                
                // Update P&L text position
                const pnlText = marker.select('[data-role="partial-pnl-text"]');
                if (!pnlText.empty()) {
                    pnlText.attr('x', x).attr('y', labelY);
                }
                
                // Update price text position
                const priceText = marker.select('[data-role="partial-price-text"]');
                if (!priceText.empty()) {
                    priceText.attr('x', x).attr('y', labelY + 14);
                }
            });
        }
    }
    
    /**
     * Toggle visibility of trade markers (entry/exit signs)
     */
    toggleTradeMarkers(show) {
        this.showTradeMarkers = show;
        
        const entryCount = this.entryMarkers?.length || 0;
        const exitCount = this.exitMarkers?.length || 0;
        
        console.log(`📍 Toggling trade markers: show=${show}, entries=${entryCount}, exits=${exitCount}`);
        
        // Toggle entry markers
        if (this.entryMarkers && this.entryMarkers.length > 0) {
            this.entryMarkers.forEach(({ marker }) => {
                if (marker) {
                    marker.style('visibility', show ? 'visible' : 'hidden');
                    marker.style('opacity', show ? 1 : 0);
                }
            });
        }
        
        // Toggle exit markers
        if (this.exitMarkers && this.exitMarkers.length > 0) {
            this.exitMarkers.forEach(({ marker }) => {
                if (marker) {
                    marker.style('visibility', show ? 'visible' : 'hidden');
                    marker.style('opacity', show ? 1 : 0);
                }
            });
        }
        
        console.log(`📍 Trade markers ${show ? 'shown' : 'hidden'}`);
    }
    
    /**
     * Remove order line from chart (handles both active and pending orders)
     */
    removeOrderLine(orderId) {
        // Find all lines with this orderId (could be both active and pending)
        const orderLinesToRemove = this.orderLines.filter(ol => ol.orderId === orderId);
        
        if (orderLinesToRemove.length === 0) {
            console.log(`⚠️ No order line found for orderId #${orderId}`);
            return;
        }
        
        orderLinesToRemove.forEach(orderLine => {
            console.log(`🗑️ Removing ${orderLine.isPending ? 'pending' : 'active'} order line for #${orderId}`);
            
            // Remove all SVG elements
            if (orderLine.line) orderLine.line.remove();
            if (orderLine.labelBox) orderLine.labelBox.remove();
            if (orderLine.labelText) orderLine.labelText.remove();
            if (orderLine.arrow) orderLine.arrow.remove();
            if (orderLine.priceBox) orderLine.priceBox.remove();
            if (orderLine.priceText) orderLine.priceText.remove();
            if (orderLine.closeBtn) orderLine.closeBtn.remove();
        });
        
        // Remove from array
        this.orderLines = this.orderLines.filter(ol => ol.orderId !== orderId);
        console.log(`✅ Order line removed. Remaining lines: ${this.orderLines.length}`);
    }
    
    /**
     * Draw SL and TP lines on chart
     */
    drawSLTPLines(order) {
        console.log(`🎨 Drawing SL/TP lines for order #${order.id}`);
        console.log(`   SL: ${order.stopLoss}, TP: ${order.takeProfit}`);
        console.log(`   tpTargets:`, order.tpTargets);
        console.log(`   Has multiple TPs: ${order.tpTargets && order.tpTargets.length > 0 ? 'YES (' + order.tpTargets.length + ')' : 'NO'}`);
        
        if (!this.chart.svg) {
            console.error('❌ Chart SVG not found! Cannot draw SL/TP lines.');
            return;
        }
        
        const slLines = [];
        const tpLines = [];
        
        // Draw Stop Loss line (red)
        if (order.stopLoss) {
            console.log(`  🛑 Drawing SL line at ${order.stopLoss.toFixed(2)}`);
            
            // Calculate potential loss at SL
            let slPnL = 0;
            if (order.type === 'BUY') {
                slPnL = (order.stopLoss - order.openPrice) * order.quantity * this.contractSize;
            } else {
                slPnL = (order.openPrice - order.stopLoss) * order.quantity * this.contractSize;
            }
            
            const slLine = this.chart.svg.append('line')
                .attr('class', `sl-line sl-${order.id}`)
                .attr('stroke', '#f23645')
                .attr('stroke-width', 2)
                .attr('opacity', 1)
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            
            // Left side label box (red background)
            const slLabelBox = this.chart.svg.append('rect')
                .attr('class', `sl-label-box sl-${order.id}`)
                .attr('fill', '#f23645')
                .attr('rx', 2)
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            
            // Label text (white on red background)
            const slLabelText = this.chart.svg.append('text')
                .attr('class', `sl-label-text sl-${order.id}`)
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize')
                .text(`SL , P&L: ${slPnL >= 0 ? '+' : ''}$${slPnL.toFixed(2)}`);
            
            // Close button (removes only SL, not the entire position)
            const slCloseBtn = this.chart.svg.append('g')
                .attr('class', `sl-close-btn sl-${order.id}`)
                .attr('pointer-events', 'all')
                .style('cursor', 'pointer');
            
            const slCloseBtnBg = slCloseBtn.append('circle')
                .attr('r', 10)
                .attr('fill', '#f23645')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 1.5)
                .style('pointer-events', 'all')
                .style('cursor', 'pointer');
            
            const slCloseBtnText = slCloseBtn.append('text')
                .attr('fill', '#ffffff')
                .attr('font-size', '14px')
                .attr('font-weight', '700')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('pointer-events', 'none')
                .text('×');
            
            // Close button click handler
            slCloseBtn.on('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                if (confirm(`Remove Stop Loss from order #${order.id}?`)) {
                    this.removeStopLoss(order.id);
                }
            });
            
            // Hover effect for close button
            slCloseBtn.on('mouseover', function() {
                slCloseBtnBg.attr('fill', '#ffffff');
                slCloseBtnText.attr('fill', '#f23645');
            }).on('mouseout', function() {
                slCloseBtnBg.attr('fill', '#f23645');
                slCloseBtnText.attr('fill', '#ffffff');
            });
            
            // Right side price box
            const slPriceBox = this.chart.svg.append('rect')
                .attr('class', `sl-price-box sl-${order.id}`)
                .attr('fill', '#f23645')
                .attr('rx', 2)
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            
            // Price text
            const slPriceText = this.chart.svg.append('text')
                .attr('class', `sl-price-text sl-${order.id}`)
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '700')
                .attr('text-anchor', 'middle')
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize')
                .text(order.stopLoss.toFixed(5));
            
            // Make SL line draggable (pass all elements for full drag area)
            this.makeLineDraggable(slLine, slLabelBox, order, 'sl', {
                labelText: slLabelText,
                priceBox: slPriceBox,
                priceText: slPriceText
            });
            
            slLines.push({ 
                orderId: order.id, 
                line: slLine, 
                labelBox: slLabelBox, 
                labelText: slLabelText,
                closeBtn: slCloseBtn,
                priceBox: slPriceBox,
                priceText: slPriceText,
                type: 'SL' 
            });
        }
        
        // Draw Take Profit lines (check for multiple TPs first)
        if (order.tpTargets && Array.isArray(order.tpTargets) && order.tpTargets.length > 0) {
            // Draw multiple TP lines
            console.log(`  🎯 Drawing ${order.tpTargets.length} TP lines for order #${order.id}`);
            
            order.tpTargets.forEach((target, index) => {
                if (target.price > 0 && target.percentage > 0) {
                    // Calculate PnL for this target
                    const targetQuantity = order.quantity * (target.percentage / 100);
                    let tpPnL = 0;
                    if (order.type === 'BUY') {
                        tpPnL = (target.price - order.openPrice) * targetQuantity * this.contractSize;
                    } else {
                        tpPnL = (order.openPrice - target.price) * targetQuantity * this.contractSize;
                    }
                    
                    // Color gradient from light to dark green
                    const colors = ['#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534'];
                    const color = colors[Math.min(index, colors.length - 1)];
                    
                    const tpLine = this.chart.svg.append('line')
                        .attr('class', `tp-line tp-${order.id} tp-target-${target.id || index}`)
                        .attr('stroke', color)
                        .attr('stroke-width', 2)
                        .attr('opacity', 1)
                        .style('pointer-events', 'all')
                        .style('cursor', 'ns-resize');
                    
                    const tpLabelBox = this.chart.svg.append('rect')
                        .attr('class', `tp-label-box tp-${order.id} tp-target-${target.id || index}`)
                        .attr('fill', color)
                        .attr('rx', 2)
                        .style('pointer-events', 'all')
                        .style('cursor', 'ns-resize');
                    
                    const tpLabelText = this.chart.svg.append('text')
                        .attr('class', `tp-label-text tp-${order.id} tp-target-${target.id || index}`)
                        .attr('fill', '#ffffff')
                        .attr('font-size', '11px')
                        .attr('font-weight', '600')
                        .style('pointer-events', 'all')
                        .style('cursor', 'ns-resize')
                        .text(`TP${index + 1} (${target.percentage.toFixed(0)}%) , P&L: ${tpPnL >= 0 ? '+' : ''}$${tpPnL.toFixed(2)}`);
                    
                    const tpPriceBox = this.chart.svg.append('rect')
                        .attr('class', `tp-price-box tp-${order.id} tp-target-${target.id || index}`)
                        .attr('fill', color)
                        .attr('rx', 2)
                        .style('pointer-events', 'all')
                        .style('cursor', 'ns-resize');
                    
                    const tpPriceText = this.chart.svg.append('text')
                        .attr('class', `tp-price-text tp-${order.id} tp-target-${target.id || index}`)
                        .attr('fill', '#ffffff')
                        .attr('font-size', '11px')
                        .attr('font-weight', '700')
                        .attr('text-anchor', 'middle')
                        .style('pointer-events', 'all')
                        .style('cursor', 'ns-resize')
                        .text(target.price.toFixed(5));
                    
                    // Make multiple TP line draggable
                    this.makeLineDraggableMultiTP(tpLine, tpLabelBox, tpLabelText, tpPriceBox, tpPriceText, order, index, target);
                    
                    tpLines.push({ 
                        orderId: order.id,
                        targetId: target.id || index,
                        line: tpLine, 
                        labelBox: tpLabelBox, 
                        labelText: tpLabelText,
                        priceBox: tpPriceBox,
                        priceText: tpPriceText,
                        type: 'TP'
                    });
                }
            });
        } else if (order.takeProfit) {
            // Draw single TP line (fallback)
            console.log(`  🎯 Drawing single TP line at ${order.takeProfit.toFixed(2)}`);
            
            // Calculate potential profit at TP
            let tpPnL = 0;
            if (order.type === 'BUY') {
                tpPnL = (order.takeProfit - order.openPrice) * order.quantity * this.contractSize;
            } else {
                tpPnL = (order.openPrice - order.takeProfit) * order.quantity * this.contractSize;
            }
            
            const tpLine = this.chart.svg.append('line')
                .attr('class', `tp-line tp-${order.id}`)
                .attr('stroke', '#22c55e')
                .attr('stroke-width', 2)
                .attr('opacity', 1)
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            
            // Left side label box (green background)
            const tpLabelBox = this.chart.svg.append('rect')
                .attr('class', `tp-label-box tp-${order.id}`)
                .attr('fill', '#22c55e')
                .attr('rx', 2)
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            
            // Label text (white on green background)
            const tpLabelText = this.chart.svg.append('text')
                .attr('class', `tp-label-text tp-${order.id}`)
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize')
                .text(`TP , P&L: ${tpPnL >= 0 ? '+' : ''}$${tpPnL.toFixed(2)}`);
            
            // Close button (removes only TP, not the entire position)
            const tpCloseBtn = this.chart.svg.append('g')
                .attr('class', `tp-close-btn tp-${order.id}`)
                .attr('pointer-events', 'all')
                .style('cursor', 'pointer');
            
            const tpCloseBtnBg = tpCloseBtn.append('circle')
                .attr('r', 10)
                .attr('fill', '#22c55e')
                .attr('stroke', '#ffffff')
                .attr('stroke-width', 1.5)
                .style('pointer-events', 'all')
                .style('cursor', 'pointer');
            
            const tpCloseBtnText = tpCloseBtn.append('text')
                .attr('fill', '#ffffff')
                .attr('font-size', '14px')
                .attr('font-weight', '700')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .style('pointer-events', 'none')
                .text('×');
            
            // Close button click handler
            tpCloseBtn.on('click', (event) => {
                event.stopPropagation();
                event.preventDefault();
                if (confirm(`Remove Take Profit from order #${order.id}?`)) {
                    this.removeTakeProfit(order.id);
                }
            });
            
            // Hover effect for close button
            tpCloseBtn.on('mouseover', function() {
                tpCloseBtnBg.attr('fill', '#ffffff');
                tpCloseBtnText.attr('fill', '#22c55e');
            }).on('mouseout', function() {
                tpCloseBtnBg.attr('fill', '#22c55e');
                tpCloseBtnText.attr('fill', '#ffffff');
            });
            
            // Right side price box (green)
            const tpPriceBox = this.chart.svg.append('rect')
                .attr('class', `tp-price-box tp-${order.id}`)
                .attr('fill', '#22c55e')
                .attr('rx', 2)
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize');
            
            // Price text
            const tpPriceText = this.chart.svg.append('text')
                .attr('class', `tp-price-text tp-${order.id}`)
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '700')
                .attr('text-anchor', 'middle')
                .style('pointer-events', 'all')
                .style('cursor', 'ns-resize')
                .text(order.takeProfit.toFixed(5));
            
            // Make TP line draggable (pass all elements for full drag area)
            this.makeLineDraggable(tpLine, tpLabelBox, order, 'tp', {
                labelText: tpLabelText,
                priceBox: tpPriceBox,
                priceText: tpPriceText
            });
            
            tpLines.push({ 
                orderId: order.id, 
                line: tpLine, 
                labelBox: tpLabelBox, 
                labelText: tpLabelText,
                closeBtn: tpCloseBtn,
                priceBox: tpPriceBox,
                priceText: tpPriceText,
                type: 'TP' 
            });
        }
        
        // Draw Breakeven trigger line (orange) if enabled and not triggered yet
        if (order.autoBreakeven && order.breakevenSettings && !order.breakevenSettings.triggered && order.stopLoss) {
            console.log(`  🛡️ Drawing BE trigger line for order #${order.id} (triggered=${order.breakevenSettings.triggered})`);
            
            // Calculate BE trigger price
            const entryPrice = order.openPrice;
            let beTriggerPrice = 0;
            
            if (order.breakevenSettings.mode === 'pips') {
                // Pips mode - direct conversion
                const profitPrice = order.breakevenSettings.value * this.pipSize;
                beTriggerPrice = order.type === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            } else {
                // Amount mode
                const profitPips = order.breakevenSettings.value / (order.quantity * this.pipValuePerLot);
                const profitPrice = profitPips * this.pipSize;
                beTriggerPrice = order.type === 'BUY' 
                    ? entryPrice + profitPrice 
                    : entryPrice - profitPrice;
            }
            
            const beLine = this.chart.svg.append('line')
                .attr('class', `be-line be-${order.id}`)
                .attr('stroke', '#f59e0b')
                .attr('stroke-width', 1.5)
                .attr('stroke-dasharray', '4,3')
                .attr('opacity', 0.8)
                .style('cursor', 'ns-resize');
            
            // Left side label
            const beLabel = order.breakevenSettings.mode === 'pips' 
                ? `BE @ ${order.breakevenSettings.value}p`
                : `BE @ $${order.breakevenSettings.value}`;
            
            const beLabelBox = this.chart.svg.append('rect')
                .attr('class', `be-label-box be-${order.id}`)
                .attr('fill', '#f59e0b')
                .attr('rx', 2)
                .style('cursor', 'ns-resize');
            
            const beLabelText = this.chart.svg.append('text')
                .attr('class', `be-label-text be-${order.id}`)
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '600')
                .style('cursor', 'ns-resize')
                .text(beLabel);
            
            // Right side price box
            const bePriceBox = this.chart.svg.append('rect')
                .attr('class', `be-price-box be-${order.id}`)
                .attr('fill', '#f59e0b')
                .attr('rx', 2)
                .style('cursor', 'ns-resize');
            
            const bePriceText = this.chart.svg.append('text')
                .attr('class', `be-price-text be-${order.id}`)
                .attr('fill', '#ffffff')
                .attr('font-size', '11px')
                .attr('font-weight', '700')
                .attr('text-anchor', 'middle')
                .style('cursor', 'ns-resize')
                .text(beTriggerPrice.toFixed(5));
            
            // Make BE line draggable
            this.makeLineDraggable(beLine, beLabelBox, order, 'be');
            
            // Store BE line data
            if (!this.beLines) this.beLines = [];
            this.beLines.push({
                orderId: order.id,
                line: beLine,
                labelBox: beLabelBox,
                labelText: beLabelText,
                priceBox: bePriceBox,
                priceText: bePriceText,
                triggerPrice: beTriggerPrice,
                type: 'BE'
            });
        } else if (order.autoBreakeven && order.breakevenSettings && order.breakevenSettings.triggered) {
            console.log(`  ✅ Skipping BE line for order #${order.id} - already triggered (SL should be at entry: ${order.openPrice.toFixed(5)})`);
        }
        
        if (!this.slLines) this.slLines = [];
        if (!this.tpLines) this.tpLines = [];
        
        this.slLines.push(...slLines);
        this.tpLines.push(...tpLines);
        
        console.log(`✅ SL/TP lines created and added to arrays`);
        console.log(`   Total SL lines: ${this.slLines.length}, Total TP lines: ${this.tpLines.length}`);
        
        // Force a chart render which will position the lines automatically
        // (updateSLTPLines is called during render after scales are ready)
        if (this.chart && typeof this.chart.render === 'function') {
            this.chart.renderPending = true;
            this.chart.render();
            console.log('🎨 Chart render triggered - SL/TP lines will be positioned automatically');
        }
    }
    
    /**
     * Remove SL/TP lines from chart
     */
    removeSLTPLines(orderId) {
        // Remove SL lines
        if (this.slLines) {
            const slLine = this.slLines.find(sl => sl.orderId === orderId);
            if (slLine) {
                console.log(`   🧹 Removing SL line for order #${orderId}`);
                slLine.line.remove();
                if (slLine.labelBox) slLine.labelBox.remove();
                if (slLine.labelText) slLine.labelText.remove();
                if (slLine.closeBtn) slLine.closeBtn.remove();
                if (slLine.priceBox) slLine.priceBox.remove();
                if (slLine.priceText) slLine.priceText.remove();
                this.slLines = this.slLines.filter(sl => sl.orderId !== orderId);
            }
        }
        
        // Remove TP lines (may be multiple for multi-TP orders!)
        if (this.tpLines) {
            const tpLinesToRemove = this.tpLines.filter(tp => tp.orderId === orderId);
            if (tpLinesToRemove.length > 0) {
                console.log(`   🧹 Removing ${tpLinesToRemove.length} TP line(s) for order #${orderId}`);
                tpLinesToRemove.forEach(tpLine => {
                    if (tpLine.line) tpLine.line.remove();
                    if (tpLine.labelBox) tpLine.labelBox.remove();
                    if (tpLine.labelText) tpLine.labelText.remove();
                    if (tpLine.closeBtn) tpLine.closeBtn.remove();
                    if (tpLine.priceBox) tpLine.priceBox.remove();
                    if (tpLine.priceText) tpLine.priceText.remove();
                });
                this.tpLines = this.tpLines.filter(tp => tp.orderId !== orderId);
            }
        }
        
        // Remove BE lines
        if (this.beLines) {
            const beLine = this.beLines.find(be => be.orderId === orderId);
            if (beLine) {
                console.log(`   🧹 Removing BE line for order #${orderId}`);
                beLine.line.remove();
                if (beLine.labelBox) beLine.labelBox.remove();
                if (beLine.labelText) beLine.labelText.remove();
                if (beLine.priceBox) beLine.priceBox.remove();
                if (beLine.priceText) beLine.priceText.remove();
                this.beLines = this.beLines.filter(be => be.orderId !== orderId);
            }
        }
        
        console.log(`✅ All SL/TP/BE lines removed for order #${orderId}`);
    }
    
    /**
     * Remove only Stop Loss from order (keeps position open)
     */
    removeStopLoss(orderId) {
        // Find the order
        const order = this.openPositions.find(o => o.id === orderId);
        if (!order) {
            console.error(`Order #${orderId} not found`);
            return;
        }
        
        // Remove SL from order object
        order.stopLoss = null;
        
        // Remove SL line from chart
        if (this.slLines) {
            const slLine = this.slLines.find(sl => sl.orderId === orderId);
            if (slLine) {
                slLine.line.remove();
                if (slLine.labelBox) slLine.labelBox.remove();
                if (slLine.labelText) slLine.labelText.remove();
                if (slLine.closeBtn) slLine.closeBtn.remove();
                if (slLine.priceBox) slLine.priceBox.remove();
                if (slLine.priceText) slLine.priceText.remove();
                this.slLines = this.slLines.filter(sl => sl.orderId !== orderId);
            }
        }
        
        console.log(`✅ Stop Loss removed from order #${orderId}`);
        this.showNotification(`Stop Loss removed from order #${orderId}`, 'info');
    }
    
    /**
     * Remove only Take Profit from order (keeps position open)
     */
    removeTakeProfit(orderId) {
        // Find the order
        const order = this.openPositions.find(o => o.id === orderId);
        if (!order) {
            console.error(`Order #${orderId} not found`);
            return;
        }
        
        // Remove TP from order object
        order.takeProfit = null;
        
        // Remove TP line from chart
        if (this.tpLines) {
            const tpLine = this.tpLines.find(tp => tp.orderId === orderId);
            if (tpLine) {
                tpLine.line.remove();
                if (tpLine.labelBox) tpLine.labelBox.remove();
                if (tpLine.labelText) tpLine.labelText.remove();
                if (tpLine.closeBtn) tpLine.closeBtn.remove();
                if (tpLine.priceBox) tpLine.priceBox.remove();
                if (tpLine.priceText) tpLine.priceText.remove();
                this.tpLines = this.tpLines.filter(tp => tp.orderId !== orderId);
            }
        }
        
        console.log(`✅ Take Profit removed from order #${orderId}`);
        this.showNotification(`Take Profit removed from order #${orderId}`, 'info');
    }
    
    /**
     * Draw MFE/MAE markers on chart
     */
    drawMfeMaeMarkers(position) {
        console.log(`🎨 ==========================================`);
        console.log(`🎨 Drawing MFE/MAE markers for order #${position.id}`);
        console.log(`   Trade Type: ${position.type || position.direction}`);
        console.log(`   Entry Price: ${position.openPrice || position.entryPrice}`);
        console.log(`   MFE: ${position.mfe?.toFixed(5)} at time ${position.mfeTime ? new Date(position.mfeTime).toLocaleString() : 'unknown'}`);
        console.log(`   MAE: ${position.mae?.toFixed(5)} at time ${position.maeTime ? new Date(position.maeTime).toLocaleString() : 'unknown'}`);
        
        if (!this.chart) {
            console.error('❌ Chart object not found!');
            return;
        }
        
        if (!this.chart.svg) {
            console.error('❌ Chart SVG not found!');
            return;
        }
        
        if (!this.chart.scales) {
            console.error('❌ Chart scales not found!');
            return;
        }
        
        console.log(`✅ Chart SVG and scales are ready`);
        
        const markers = [];
        const yScale = this.chart.scales.yScale;
        const xScale = this.chart.scales.xScale;
        
        // Draw MFE marker (green circle - best price)
        const entryPrice = position.openPrice || position.entryPrice;
        console.log(`   Checking MFE: mfe=${position.mfe}, entry=${entryPrice}, mfeTime=${position.mfeTime}`);
        
        // Check if MFE differs from entry by more than 0.00001 (1 pip tolerance)
        if (position.mfe && position.mfeTime) {
            const mfeDiff = Math.abs(position.mfe - entryPrice);
            console.log(`   MFE difference from entry: ${mfeDiff}`);
            
            if (mfeDiff > 0.00001) {
                const mfeY = yScale(position.mfe);
                const mfeX = xScale(position.mfeTime);
                
                console.log(`   ✅ Drawing MFE at x=${mfeX}, y=${mfeY}`);
                
                // Determine arrow direction based on trade type
                const isBuy = (position.type || position.direction) === 'BUY';
                const arrowY = isBuy ? mfeY - 15 : mfeY + 15; // Arrow points UP for BUY (MFE is higher)
                
                // Arrow path (triangle pointing up or down)
                const arrowPath = isBuy 
                    ? `M ${mfeX} ${arrowY} L ${mfeX - 5} ${arrowY + 8} L ${mfeX + 5} ${arrowY + 8} Z`
                    : `M ${mfeX} ${arrowY} L ${mfeX - 5} ${arrowY - 8} L ${mfeX + 5} ${arrowY - 8} Z`;
                
                const mfeArrow = this.chart.svg.append('path')
                    .attr('class', `mfe-marker mfe-marker-${position.id}`)
                    .attr('d', arrowPath)
                    .attr('fill', '#22c55e')
                    .attr('opacity', 0.9);
                
                // Label with price
                const mfeLabel = this.chart.svg.append('text')
                    .attr('class', `mfe-label mfe-marker-${position.id}`)
                    .attr('x', mfeX)
                    .attr('y', isBuy ? arrowY - 5 : arrowY + 15)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#22c55e')
                    .attr('font-size', '10px')
                    .attr('font-weight', '600')
                    .text(`${position.mfe.toFixed(3)}`);
                
                markers.push({ 
                    orderId: position.id, 
                    type: 'MFE',
                    arrow: mfeArrow,
                    label: mfeLabel,
                    time: position.mfeTime,
                    price: position.mfe
                });
                
                console.log(`  ✅ MFE arrow drawn at ${position.mfe.toFixed(5)}`);
                console.log(`     Arrow element:`, mfeArrow);
                console.log(`     Label element:`, mfeLabel);
            } else {
                console.log(`  ⚠️ MFE difference too small (${mfeDiff}) or equal to entry`);
            }
        } else {
            console.log(`  ⚠️ MFE missing: mfe=${position.mfe}, mfeTime=${position.mfeTime}`);
        }
        
        // Draw MAE marker (red circle - worst price)
        console.log(`   Checking MAE: mae=${position.mae}, entry=${entryPrice}, maeTime=${position.maeTime}`);
        
        // Check if MAE differs from entry by more than 0.00001 (1 pip tolerance)
        if (position.mae && position.maeTime) {
            const maeDiff = Math.abs(position.mae - entryPrice);
            console.log(`   MAE difference from entry: ${maeDiff}`);
            
            if (maeDiff > 0.00001) {
                const maeY = yScale(position.mae);
                const maeX = xScale(position.maeTime);
                
                console.log(`   ✅ Drawing MAE at x=${maeX}, y=${maeY}`);
                
                // Determine arrow direction based on trade type (opposite of MFE)
                const isBuy = (position.type || position.direction) === 'BUY';
                const arrowY = isBuy ? maeY + 15 : maeY - 15; // Arrow points DOWN for BUY (MAE is lower)
                
                // Arrow path (triangle pointing down or up)
                const arrowPath = isBuy 
                    ? `M ${maeX} ${arrowY} L ${maeX - 5} ${arrowY - 8} L ${maeX + 5} ${arrowY - 8} Z`
                    : `M ${maeX} ${arrowY} L ${maeX - 5} ${arrowY + 8} L ${maeX + 5} ${arrowY + 8} Z`;
                
                const maeArrow = this.chart.svg.append('path')
                    .attr('class', `mae-marker mae-marker-${position.id}`)
                    .attr('d', arrowPath)
                    .attr('fill', '#ef4444')
                    .attr('opacity', 0.9);
                
                // Label with price
                const maeLabel = this.chart.svg.append('text')
                    .attr('class', `mae-label mae-marker-${position.id}`)
                    .attr('x', maeX)
                    .attr('y', isBuy ? arrowY + 15 : arrowY - 5)
                    .attr('text-anchor', 'middle')
                    .attr('fill', '#ef4444')
                    .attr('font-size', '10px')
                    .attr('font-weight', '600')
                    .text(`${position.mae.toFixed(3)}`);
                
                markers.push({ 
                    orderId: position.id, 
                    type: 'MAE',
                    arrow: maeArrow,
                    label: maeLabel,
                    time: position.maeTime,
                    price: position.mae
                });
                
                console.log(`  ✅ MAE arrow drawn at ${position.mae.toFixed(5)}`);
                console.log(`     Arrow element:`, maeArrow);
                console.log(`     Label element:`, maeLabel);
            } else {
                console.log(`  ⚠️ MAE difference too small (${maeDiff}) or equal to entry`);
            }
        } else {
            console.log(`  ⚠️ MAE missing: mae=${position.mae}, maeTime=${position.maeTime}`);
        }
        
        // Store markers
        this.mfeMaeMarkers = this.mfeMaeMarkers.concat(markers);
        console.log(`📊 Total MFE/MAE markers on chart: ${this.mfeMaeMarkers.length}`);
    }
    
    /**
     * Update SL/TP line positions
     */
    updateSLTPLines() {
        if (!this.chart.scales) {
            console.log('⚠️ updateSLTPLines: Scales not ready');
            return;
        }
        
        if (!this.slLines && !this.tpLines) {
            console.log('⚠️ updateSLTPLines: No lines to update');
            return;
        }
        
        console.log(`📍 updateSLTPLines: SL lines=${this.slLines?.length || 0}, TP lines=${this.tpLines?.length || 0}`);
        
        // Remove old Y-axis price highlights for SL/TP (pending target highlights are managed by positionPendingOrderTargets)
        this.chart.svg.selectAll('.y-axis-sl-highlight').remove();
        this.chart.svg.selectAll('.y-axis-tp-highlight').remove();
        this.chart.svg.selectAll('.y-axis-entry-highlight').remove();
        
        // Track unique prices for Y-axis highlights
        const yAxisHighlightPrices = { sl: new Set(), tp: new Set(), entry: new Set() };
        
        // Update SL lines - aggregate P&L for positions at same SL price
        if (this.slLines && this.slLines.length > 0) {
            console.log(`   Updating ${this.slLines.length} SL lines`);
            
            // Group positions by SL price to aggregate P&L
            const slPriceGroups = {};
            this.openPositions.forEach(pos => {
                if (pos.stopLoss) {
                    const priceKey = pos.stopLoss.toFixed(5);
                    if (!slPriceGroups[priceKey]) slPriceGroups[priceKey] = [];
                    slPriceGroups[priceKey].push(pos);
                }
            });
            
            // Track which SL prices have been updated (to avoid duplicate labels)
            const updatedSLPrices = new Set();
            
            this.slLines.forEach(({ orderId, line, labelBox, labelText, closeBtn, priceBox, priceText }, slIndex) => {
                const position = this.openPositions.find(p => p.id === orderId);
                if (!position || !position.stopLoss) {
                    console.log(`     ⚠️ Position #${orderId} has no SL: position=${!!position}, stopLoss=${position?.stopLoss}`);
                    return;
                }
                
                const priceKey = position.stopLoss.toFixed(5);
                const positionsAtThisSL = slPriceGroups[priceKey] || [position];
                
                // Calculate COMBINED P&L for ALL positions at this SL price
                let totalSlPnL = 0;
                positionsAtThisSL.forEach(pos => {
                    let priceDiff;
                    if (pos.type === 'BUY') {
                        priceDiff = pos.stopLoss - pos.openPrice;
                    } else {
                        priceDiff = pos.openPrice - pos.stopLoss;
                    }
                    const pipsMove = priceDiff / this.pipSize;
                    totalSlPnL += pipsMove * pos.quantity * this.pipValuePerLot;
                });
                
                // Only show label on the first line at this price level
                if (updatedSLPrices.has(priceKey)) {
                    // Hide duplicate labels - just update line position
                    if (labelBox) labelBox.style('display', 'none');
                    if (labelText) labelText.style('display', 'none');
                    if (priceBox) priceBox.style('display', 'none');
                    if (priceText) priceText.style('display', 'none');
                    if (closeBtn) closeBtn.style('display', 'none');
                } else {
                    updatedSLPrices.add(priceKey);
                    // Show combined P&L
                    const numPositions = positionsAtThisSL.length;
                    const labelPrefix = numPositions > 1 ? `SL (${numPositions}×)` : 'SL';
                    labelText.text(`${labelPrefix} , P&L: ${totalSlPnL >= 0 ? '+' : ''}$${totalSlPnL.toFixed(2)}`);
                    // Ensure label visible
                    if (labelBox) labelBox.style('display', null);
                    if (labelText) labelText.style('display', null);
                    if (closeBtn) closeBtn.style('display', null);
                    // HIDE inline price box - price is shown on Y-axis instead
                    if (priceBox) priceBox.style('display', 'none');
                    if (priceText) priceText.style('display', 'none');
                }
                
                const y = this.chart.scales.yScale(position.stopLoss);
                console.log(`     ✅ SL #${orderId}: price=${position.stopLoss.toFixed(5)}, y=${y.toFixed(2)}, totalP&L=${totalSlPnL.toFixed(2)}`);
                
                line
                    .attr('x1', 0)
                    .attr('x2', this.chart.w)
                    .attr('y1', y)
                    .attr('y2', y);
                
                // Position elements on the right side of the line (before Y-axis)
                if (labelText && closeBtn && labelBox) {
                    const boxHeight = 18;
                    const boxY = y - boxHeight / 2;
                    const spacing = 5;
                    const yAxisWidth = 70; // Space for Y-axis price highlight
                    
                    // Position close button (rightmost, before Y-axis area)
                    closeBtn.attr('transform', `translate(${this.chart.w - yAxisWidth - 15}, ${y})`);
                    
                    // Position label box to the left of close button
                    const labelBoxWidth = labelText.node().getBBox().width + 20;
                    const labelBoxX = this.chart.w - yAxisWidth - 30 - labelBoxWidth;
                    
                    labelBox
                        .attr('x', labelBoxX)
                        .attr('y', boxY)
                        .attr('width', labelBoxWidth)
                        .attr('height', boxHeight);
                    
                    labelText
                        .attr('x', labelBoxX + 10)
                        .attr('y', y + 4);
                }
                
                // Track this SL price for Y-axis highlight
                yAxisHighlightPrices.sl.add(position.stopLoss);
            });
            
            // Create Y-axis highlights for unique SL prices
            yAxisHighlightPrices.sl.forEach(slPrice => {
                this.drawYAxisPriceHighlight(slPrice, '#f23645', 'sl', 0);
            });
        }
        
        // Update TP lines - aggregate P&L for positions at same TP price
        if (this.tpLines && this.tpLines.length > 0) {
            console.log(`   Updating ${this.tpLines.length} TP lines`);
            
            // Group by TP price level to aggregate P&L
            const tpPriceGroups = {};
            this.openPositions.forEach(pos => {
                if (pos.tpTargets && pos.tpTargets.length > 0) {
                    pos.tpTargets.forEach((target, idx) => {
                        if (target.hit) return;
                        const priceKey = target.price.toFixed(5);
                        if (!tpPriceGroups[priceKey]) tpPriceGroups[priceKey] = { positions: [], totalPnL: 0, percentage: target.percentage, targetIndex: idx };
                        
                        // Calculate this position's P&L for this target
                        const targetQuantity = pos.quantity * (target.percentage / 100);
                        let priceDiff = pos.type === 'BUY' 
                            ? target.price - pos.openPrice 
                            : pos.openPrice - target.price;
                        const pipsMove = priceDiff / this.pipSize;
                        const pnl = pipsMove * targetQuantity * this.pipValuePerLot;
                        
                        tpPriceGroups[priceKey].totalPnL += pnl;
                        tpPriceGroups[priceKey].positions.push({ pos, target, pnl });
                    });
                } else if (pos.takeProfit) {
                    const priceKey = pos.takeProfit.toFixed(5);
                    if (!tpPriceGroups[priceKey]) tpPriceGroups[priceKey] = { positions: [], totalPnL: 0, percentage: 100, targetIndex: -1 };
                    
                    let priceDiff = pos.type === 'BUY' 
                        ? pos.takeProfit - pos.openPrice 
                        : pos.openPrice - pos.takeProfit;
                    const pipsMove = priceDiff / this.pipSize;
                    const pnl = pipsMove * pos.quantity * this.pipValuePerLot;
                    
                    tpPriceGroups[priceKey].totalPnL += pnl;
                    tpPriceGroups[priceKey].positions.push({ pos, target: null, pnl });
                }
            });
            
            // Track which TP prices have been updated
            const updatedTPPrices = new Set();
            
            this.tpLines.forEach(({ orderId, targetId, line, labelBox, labelText, closeBtn, priceBox, priceText }) => {
                const position = this.openPositions.find(p => p.id === orderId);
                if (!position) {
                    console.log(`     ⚠️ Position #${orderId} not found`);
                    return;
                }
                
                let tpPrice, labelTextContent;
                let targetIndex = -1;
                let percentage = 100;
                
                // Check if this is a multiple TP target
                if (targetId !== undefined && position.tpTargets && position.tpTargets.length > 0) {
                    let target = null;
                    for (let i = 0; i < position.tpTargets.length; i++) {
                        const t = position.tpTargets[i];
                        if (t.id === targetId || i === targetId) {
                            target = t;
                            targetIndex = i;
                            break;
                        }
                    }
                    
                    if (!target || target.hit) {
                        console.log(`     ⚠️ TP target #${targetId} not found or already hit for order #${orderId}`);
                        return;
                    }
                    
                    tpPrice = target.price;
                    percentage = target.percentage;
                } else if (position.takeProfit) {
                    tpPrice = position.takeProfit;
                } else {
                    console.log(`     ⚠️ Position #${orderId} has no TP`);
                    return;
                }
                
                const priceKey = tpPrice.toFixed(5);
                const groupData = tpPriceGroups[priceKey];
                
                // Only show label on first line at this price level
                if (updatedTPPrices.has(priceKey)) {
                    // Hide duplicate labels
                    if (labelBox) labelBox.style('display', 'none');
                    if (labelText) labelText.style('display', 'none');
                    if (priceBox) priceBox.style('display', 'none');
                    if (priceText) priceText.style('display', 'none');
                    if (closeBtn) closeBtn.style('display', 'none');
                } else {
                    updatedTPPrices.add(priceKey);
                    const numPositions = groupData ? groupData.positions.length : 1;
                    const totalPnL = groupData ? groupData.totalPnL : 0;
                    
                    if (targetIndex >= 0) {
                        const labelPrefix = numPositions > 1 ? `TP${targetIndex + 1} (${percentage.toFixed(0)}%, ${numPositions}×)` : `TP${targetIndex + 1} (${percentage.toFixed(0)}%)`;
                        labelTextContent = `${labelPrefix} , P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`;
                    } else {
                        const labelPrefix = numPositions > 1 ? `TP (${numPositions}×)` : 'TP';
                        labelTextContent = `${labelPrefix} , P&L: ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}`;
                    }
                    
                    if (labelText) labelText.text(labelTextContent);
                    // Ensure label visible
                    if (labelBox) labelBox.style('display', null);
                    if (labelText) labelText.style('display', null);
                    if (closeBtn) closeBtn.style('display', null);
                    // HIDE inline price box - price is shown on Y-axis instead
                    if (priceBox) priceBox.style('display', 'none');
                    if (priceText) priceText.style('display', 'none');
                }
                
                const y = this.chart.scales.yScale(tpPrice);
                console.log(`     ✅ TP #${orderId}${targetId !== undefined ? ` target ${targetId}` : ''}: price=${tpPrice.toFixed(5)}, y=${y.toFixed(2)}`);
                
                line
                    .attr('x1', 0)
                    .attr('x2', this.chart.w)
                    .attr('y1', y)
                    .attr('y2', y);
                
                // Position elements on the right side of the line (before Y-axis)
                if (labelText && labelBox) {
                    const boxHeight = 18;
                    const boxY = y - boxHeight / 2;
                    const yAxisWidth = 70; // Space for Y-axis price highlight
                    
                    // Position close button if it exists (rightmost, before Y-axis area)
                    if (closeBtn) {
                        closeBtn.attr('transform', `translate(${this.chart.w - yAxisWidth - 15}, ${y})`);
                    }
                    
                    // Position label box to the left of close button (or at right edge)
                    const labelBoxWidth = labelText.node().getBBox().width + 20;
                    const labelBoxX = closeBtn 
                        ? this.chart.w - yAxisWidth - 30 - labelBoxWidth
                        : this.chart.w - yAxisWidth - 10 - labelBoxWidth;
                    
                    labelBox
                        .attr('x', labelBoxX)
                        .attr('y', boxY)
                        .attr('width', labelBoxWidth)
                        .attr('height', boxHeight);
                    
                    labelText
                        .attr('x', labelBoxX + 10)
                        .attr('y', y + 4);
                }
                
                // Track this TP price for Y-axis highlight
                yAxisHighlightPrices.tp.add(tpPrice);
            });
            
            // Create Y-axis highlights for unique TP prices
            yAxisHighlightPrices.tp.forEach(tpPrice => {
                this.drawYAxisPriceHighlight(tpPrice, '#22c55e', 'tp', 0);
            });
        }
        
        // Entry prices are handled in updateOrderLines
        
        // Check if SL/TP lines are visible in DOM
        const slLinesInDom = document.querySelectorAll('.sl-line');
        const tpLinesInDom = document.querySelectorAll('.tp-line');
        console.log(`✅ SL/TP lines updated. DOM count: SL=${slLinesInDom.length}, TP=${tpLinesInDom.length}`);
    }
    
    /**
     * Update BE line positions
     */
    updateBELines() {
        if (!this.chart.scales) {
            return;
        }
        
        if (!this.beLines || this.beLines.length === 0) {
            return;
        }
        
        this.beLines.forEach(({ orderId, line, labelBox, labelText, priceBox, priceText, triggerPrice }) => {
            const y = this.chart.scales.yScale(triggerPrice);
            const boxHeight = 18;
            const boxY = y - boxHeight / 2;
            
            // Update line position
            line
                .attr('x1', 0)
                .attr('x2', this.chart.w)
                .attr('y1', y)
                .attr('y2', y);
            
            // Position left label
            const labelWidth = labelText.node().getBBox().width + 16;
            labelBox
                .attr('x', 10)
                .attr('y', boxY)
                .attr('width', labelWidth)
                .attr('height', boxHeight);
            
            labelText
                .attr('x', 10 + labelWidth / 2)
                .attr('y', y + 4);
            
            // Position right price box
            const priceWidth = 65;
            const priceX = this.chart.w - priceWidth - 10;
            
            priceBox
                .attr('x', priceX)
                .attr('y', boxY)
                .attr('width', priceWidth)
                .attr('height', boxHeight);
            
            priceText
                .attr('x', priceX + priceWidth / 2)
                .attr('y', y + 4);
        });
    }
    
    /**
     * Update order line positions
     */
    updateOrderLines() {
        if (!this.chart.scales) {
            console.log('⚠️ updateOrderLines: Scales not ready');
            return;
        }
        
        // Update trade markers (entry/exit)
        this.updateTradeMarkers();
        
        if (!this.orderLines || this.orderLines.length === 0) {
            console.log('⚠️ updateOrderLines: No lines to update');
            return;
        }
        
        console.log(`📍 updateOrderLines: Updating ${this.orderLines.length} order lines`);
        
        // Clean up old pending order entry highlights before recreating
        this.chart.svg.selectAll('.y-axis-pending-highlight').remove();
        
        this.orderLines.forEach(({ orderId, isPending, line, labelBox, labelText, arrow, priceBox, priceText, closeBtn }) => {
            // Check if it's a pending order or active position
            let price, orderData;
            
            if (isPending) {
                orderData = this.pendingOrders.find(p => p.id === orderId);
                if (!orderData) {
                    console.log(`   ⚠️ Pending order not found for #${orderId}`);
                    return;
                }
                price = orderData.entryPrice;
            } else {
                orderData = this.openPositions.find(p => p.id === orderId);
                if (!orderData) {
                    console.log(`   ⚠️ Position not found for order #${orderId}`);
                    return;
                }
                price = orderData.openPrice;
            }
            
            const y = this.chart.scales.yScale(price);
            
            console.log(`   ✅ ${isPending ? 'Pending' : 'Active'} Order #${orderId}: price=${price.toFixed(5)}, y=${y.toFixed(2)}, width=${this.chart.w}`);
            
            line
                .attr('x1', 0)
                .attr('x2', this.chart.w)
                .attr('y1', y)
                .attr('y2', y);
            
            // HIDE inline price box - price is shown on Y-axis instead
            if (priceBox) priceBox.style('display', 'none');
            if (priceText) priceText.style('display', 'none');
            
            // Position elements on the right side of the line (before Y-axis)
            // Match SL/TP pattern: include closeBtn in the conditional
            if (labelText && closeBtn && labelBox) {
                const boxHeight = 18;
                const boxY = y - boxHeight / 2;
                const yAxisWidth = 70; // Space for Y-axis price highlight
                
                // Position close button (rightmost, before Y-axis area)
                closeBtn.attr('transform', `translate(${this.chart.w - yAxisWidth - 15}, ${y})`);
                
                // Position label box to the left of close button
                const arrowWidth = arrow ? arrow.node().getBBox().width : 0;
                const labelBoxWidth = labelText.node().getBBox().width + arrowWidth + 20;
                const labelBoxX = this.chart.w - yAxisWidth - 30 - labelBoxWidth;
                
                labelBox
                    .attr('x', labelBoxX)
                    .attr('y', boxY)
                    .attr('width', labelBoxWidth)
                    .attr('height', boxHeight);
                
                labelText
                    .attr('x', labelBoxX + 10)
                    .attr('y', y + 4);
                
                // Position arrow if it exists (active orders only)
                if (arrow) {
                    arrow
                        .attr('x', labelBoxX + labelText.node().getBBox().width + 12)
                        .attr('y', y + 4);
                }
            }
            
            // Create Y-axis highlight for this order
            const highlightColor = isPending 
                ? (orderData.direction === 'BUY' ? '#2962ff' : '#f23645')
                : '#2962ff'; // Blue for active positions
            this.drawYAxisPriceHighlight(price, highlightColor, isPending ? 'pending' : 'entry', 0);
        });
        
        // Check if lines are visible in DOM
        const orderLinesInDom = document.querySelectorAll('.order-line');
        console.log(`✅ Order lines updated. DOM count: ${orderLinesInDom.length}`);
        
        // Update SL/TP lines for active orders
        this.updateSLTPLines();
        
        // Update BE lines for active orders
        this.updateBELines();
        
        // Update preview lines if they exist
        this.updatePreviewLinePositions();
        
        // Keep pending order targets aligned with latest dimensions
        this.positionPendingOrderTargets();
    }

    removeEntryMarker(orderId) {
        if (!this.entryMarkers || this.entryMarkers.length === 0) {
            return;
        }

        this.entryMarkers.forEach(markerData => {
            if (markerData.orderId !== orderId || !markerData.marker) {
                return;
            }

            const marker = markerData.marker;

            const priceBox = marker.select('[data-role="entry-price-box"]');
            if (!priceBox.empty()) {
                priceBox.remove();
            }

            const priceText = marker.select('[data-role="entry-price-text"]');
            if (!priceText.empty()) {
                priceText.remove();
            }

            const priceLine = marker.select('[data-role="entry-price-line"]');
            if (!priceLine.empty()) {
                priceLine.remove();
            }

            markerData.hasPriceElements = false;
        });
    }
    
    /**
     * Update positions panel
     */
    updatePositionsPanel() {
        console.log('🔄 updatePositionsPanel() called');
        
        // Ensure data arrays are initialized
        if (!this.pendingOrders) this.pendingOrders = [];
        if (!this.openPositions) this.openPositions = [];
        if (!this.closedPositions) this.closedPositions = [];
        if (!this.tradeJournal) this.tradeJournal = [];
        
        console.log('📊 Current data state:');
        console.log('   - Pending Orders:', this.pendingOrders.length);
        console.log('   - Open Positions:', this.openPositions.length);
        console.log('   - Closed Positions:', this.closedPositions.length);
        console.log('   - Trade Journal:', this.tradeJournal.length);
        
        // Update Details tab - Account info
        const balanceEl = document.getElementById('accountBalance');
        const initialBalanceEl = document.getElementById('initialBalance');
        const unrealizedPnLEl = document.getElementById('unrealizedPnL');
        const realizedPnLEl = document.getElementById('realizedPnL');
        
        if (balanceEl) {
            balanceEl.textContent = `$${this.balance.toFixed(2)}`;
        }
        
        if (initialBalanceEl) {
            initialBalanceEl.textContent = `$${this.initialBalance.toFixed(2)}`;
        }
        
        // Update bottom panel pending orders count in meta
        const bottomPendingCountMetaEl = document.getElementById('bottomPendingCountMeta');
        if (bottomPendingCountMetaEl) {
            bottomPendingCountMetaEl.textContent = this.pendingOrders.length;
        }

        // Update balance and P&L across all bottom panel tabs
        const balanceEls = ['replayMetaBalance', 'replayMetaBalance2'];
        const realizedEls = ['replayMetaRealized', 'replayMetaRealized2'];
        const unrealizedEls = ['replayMetaUnrealized', 'replayMetaUnrealized2'];
        
        balanceEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = `$${this.balance.toFixed(2)}`;
        });

        // Update pending orders list
        const pendingListEl = document.getElementById('pendingOrdersList');
        const noPendingMsgEl = document.getElementById('noPendingMsg');
        if (pendingListEl && noPendingMsgEl) {
            if (this.pendingOrders.length === 0) {
                pendingListEl.innerHTML = '';
                noPendingMsgEl.style.display = 'block';
            } else {
                noPendingMsgEl.style.display = 'none';
                pendingListEl.innerHTML = this.pendingOrders.map(order => {
                    const orderTypeLabel = order.orderType ? order.orderType.toUpperCase() : 'PENDING';
                    const direction = (order.direction || '—').toUpperCase();
                    const directionClass = direction === 'SELL' ? 'order-badge--direction-sell' : 'order-badge--direction-buy';
                    const entryPrice = typeof order.entryPrice === 'number' ? order.entryPrice.toFixed(5) : '—';
                    const quantity = typeof order.quantity === 'number' ? order.quantity.toFixed(2) : '—';
                    const placedTime = this.format24Hour(order.placedTime);
                    const sl = order.stopLoss ? `$${order.stopLoss.toFixed(5)}` : 'None';
                    const tp = order.takeProfit ? `$${order.takeProfit.toFixed(5)}` : 'None';
                    const risk = order.riskAmount ? `$${order.riskAmount.toFixed(2)}` : '—';
                    const autoBreakeven = order.autoBreakeven ? 'Enabled' : 'Disabled';

                    return `
                        <div class="order-card order-card--pending">
                            <div class="order-card__header">
                                <div class="order-card__title">
                                    <span class="order-badge order-badge--type">${orderTypeLabel}</span>
                                    <span class="order-badge ${directionClass}">${direction}</span>
                                    <span class="order-badge order-badge--status">Pending</span>
                                </div>
                                <div class="order-card__actions">
                                    <button class="order-btn" onclick="window.chart.orderManager.editPendingOrder(${order.id})">✏️ Edit</button>
                                    <button class="order-btn order-btn--destructive" onclick="window.chart.orderManager.cancelPendingOrder(${order.id})">🗑️ Cancel</button>
                                </div>
                            </div>
                            <div class="order-card__meta">
                                <span>Placed: <strong>${placedTime}</strong></span>
                                ${order.createdFromTool ? `<span>Source: <strong>${order.toolType || 'Drawing Tool'}</strong></span>` : ''}
                            </div>
                            <div class="order-card__metrics">
                                <span>Entry <strong>$${entryPrice}</strong></span>
                                <span>Quantity <strong>${quantity}</strong></span>
                                <span>Risk Target <strong>${risk}</strong></span>
                                <span>Auto Breakeven <strong>${autoBreakeven}</strong></span>
                            </div>
                            <div class="order-card__footer">
                                <div class="order-card__chips">
                                    <span class="order-chip">🛑 SL <strong>${sl}</strong></span>
                                    <span class="order-chip">🎯 TP <strong>${tp}</strong></span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Update bottom panel pending orders table
        const bottomPendingBodyEl = document.getElementById('bottomPendingOrdersBody');
        console.log('🔍 Bottom Pending Orders Body element:', bottomPendingBodyEl ? 'FOUND' : 'NOT FOUND');
        if (bottomPendingBodyEl) {
            console.log('📝 Updating bottom pending orders with', this.pendingOrders.length, 'orders');
            if (this.pendingOrders.length === 0) {
                bottomPendingBodyEl.innerHTML = `
                    <tr class="replay-empty-row">
                        <td colspan="10">
                            <div class="replay-tab-empty">
                                No pending orders. Place a limit or stop order to see it here.
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                bottomPendingBodyEl.innerHTML = this.pendingOrders.map((order, index) => {
                    const orderTypeLabel = order.orderType ? order.orderType.toUpperCase() : 'PENDING';
                    const direction = (order.direction || '—').toUpperCase();
                    const sideClass = direction === 'SELL' ? 'replay-badge--sell' : 'replay-badge--buy';
                    const entryPrice = typeof order.entryPrice === 'number' ? order.entryPrice.toFixed(5) : '—';
                    const quantity = typeof order.quantity === 'number' ? order.quantity.toFixed(2) : '—';
                    const placedTime = this.formatTimeOnly(order.placedTime);
                    const sl = order.stopLoss ? order.stopLoss.toFixed(5) : '—';
                    const tp = order.takeProfit ? order.takeProfit.toFixed(5) : '—';

                    return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${order.symbol || 'USD'}</td>
                            <td><span class="replay-badge ${sideClass}">${direction}</span></td>
                            <td class="replay-cell-number">${quantity}</td>
                            <td><span class="replay-badge">${orderTypeLabel}</span></td>
                            <td class="replay-cell-number">${entryPrice}</td>
                            <td class="replay-cell-number">${tp}</td>
                            <td class="replay-cell-number">${sl}</td>
                            <td>${placedTime}</td>
                            <td class="replay-cell-center">
                                <button class="order-btn order-btn--small" onclick="window.chart.orderManager.editPendingOrder(${order.id})" title="Edit">✏️</button>
                                <button class="order-btn order-btn--small order-btn--destructive" onclick="window.chart.orderManager.cancelPendingOrder(${order.id})" title="Cancel">🗑️</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Calculate unrealized P&L (from open positions)
        const unrealizedPnL = this.equity - this.balance;
        if (unrealizedPnLEl) {
            unrealizedPnLEl.textContent = `${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)}`;
            unrealizedPnLEl.classList.remove('metric-value--positive', 'metric-value--negative');
            if (unrealizedPnL > 0) {
                unrealizedPnLEl.classList.add('metric-value--positive');
            } else if (unrealizedPnL < 0) {
                unrealizedPnLEl.classList.add('metric-value--negative');
            }
        }
        
        // Calculate realized P&L (from closed trades)
        const realizedPnL = this.balance - this.initialBalance;
        if (realizedPnLEl) {
            realizedPnLEl.textContent = `${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`;
            realizedPnLEl.classList.remove('metric-value--positive', 'metric-value--negative');
            if (realizedPnL > 0) {
                realizedPnLEl.classList.add('metric-value--positive');
            } else if (realizedPnL < 0) {
                realizedPnLEl.classList.add('metric-value--negative');
            }
        }

        // Update realized P&L across all bottom panel tabs
        realizedEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = `${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`;
                el.classList.remove('metric-value--positive', 'metric-value--negative');
                if (realizedPnL > 0) {
                    el.classList.add('metric-value--positive');
                } else if (realizedPnL < 0) {
                    el.classList.add('metric-value--negative');
                }
            }
        });

        // Update unrealized P&L across all bottom panel tabs
        unrealizedEls.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.textContent = `${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)}`;
                el.classList.remove('metric-value--positive', 'metric-value--negative');
                if (unrealizedPnL > 0) {
                    el.classList.add('metric-value--positive');
                } else if (unrealizedPnL < 0) {
                    el.classList.add('metric-value--negative');
                }
            }
        });
        
        console.log(`📊 Panel Updated: Initial=$${this.initialBalance.toFixed(2)} | Balance=$${this.balance.toFixed(2)} | Equity=$${this.equity.toFixed(2)} | Unrealized=${unrealizedPnL >= 0 ? '+' : ''}$${unrealizedPnL.toFixed(2)} | Realized=${realizedPnL >= 0 ? '+' : ''}$${realizedPnL.toFixed(2)}`);
        
        // Update bottom panel positions count in meta
        const bottomPositionsCountMetaEl = document.getElementById('bottomPositionsCountMeta');
        if (bottomPositionsCountMetaEl) {
            bottomPositionsCountMetaEl.textContent = this.openPositions.length;
        }

        // Update positions list
        const listEl = document.getElementById('openPositionsList');
        const noMsgEl = document.getElementById('noPositionsMsg');
        
        if (listEl && noMsgEl) {
            if (this.openPositions.length === 0) {
                listEl.innerHTML = '';
                noMsgEl.style.display = 'block';
            } else {
                noMsgEl.style.display = 'none';
            
            listEl.innerHTML = this.openPositions.map(pos => {
                const pnl = Number.isFinite(pos.unrealizedPnL) ? pos.unrealizedPnL : 0;
                const basis = pos.riskAmount && pos.riskAmount > 0
                    ? pos.riskAmount
                    : (pos.openPrice * pos.quantity) || 1;
                const pnlPercent = ((pnl / basis) * 100) || 0;
                const pnlClass = pnl > 0 ? 'order-value--profit' : pnl < 0 ? 'order-value--loss' : '';
                const directionClass = pos.type === 'SELL' ? 'order-badge--direction-sell' : 'order-badge--direction-buy';
                const pnlChipClass = pnl > 0 ? 'order-chip order-chip--positive' : pnl < 0 ? 'order-chip order-chip--negative' : 'order-chip';
                const openTime = this.format24Hour(pos.openTime);
                const autoBreakeven = pos.autoBreakeven ? 'Enabled' : 'Disabled';
                const breakevenMode = pos.breakevenSettings ? pos.breakevenSettings.mode.toUpperCase() : '—';
                
                // Check if this position is part of a scaled trade
                const scaledInfo = this.getScaledTradeInfo(pos);
                const isScaled = scaledInfo && scaledInfo.entries.length > 1;
                const scalingBadge = isScaled ? `<span class="order-badge" style="background: #f59e0b; color: #000;">📊 SCALED ${scaledInfo.entries.length}x</span>` : '';
                const scalingMetrics = isScaled ? `
                    <div style="background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); border-radius: 4px; padding: 8px; margin-top: 8px;">
                        <div style="color: #f59e0b; font-size: 11px; font-weight: 600; margin-bottom: 4px;">
                            📊 Scaled Position Group #${scaledInfo.groupId}
                        </div>
                        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                            <span style="font-size: 10px; color: rgba(255,255,255,0.7);">Entries: <strong style="color: #fff;">${scaledInfo.entries.length}</strong></span>
                            <span style="font-size: 10px; color: rgba(255,255,255,0.7);">Avg Entry: <strong style="color: #fff;">$${scaledInfo.avgEntry.toFixed(5)}</strong></span>
                            <span style="font-size: 10px; color: rgba(255,255,255,0.7);">Total Qty: <strong style="color: #fff;">${scaledInfo.totalQuantity.toFixed(2)}</strong></span>
                        </div>
                    </div>
                ` : '';

                return `
                    <div class="order-card order-card--open ${pnl >= 0 ? 'order-card--profit' : 'order-card--loss'}">
                        <div class="order-card__header">
                            <div class="order-card__title">
                                <span class="order-badge order-badge--type">MARKET</span>
                                <span class="order-badge ${directionClass}">${pos.type}</span>
                                <span class="order-badge order-badge--status">Open</span>
                                ${scalingBadge}
                            </div>
                            <div class="order-card__actions">
                                <button class="order-btn order-btn--destructive" onclick="window.chart.orderManager.closePosition(${pos.id})">✨ Close Position</button>
                            </div>
                        </div>

                        <div class="order-card__meta">
                            <span>Opened: <strong>${openTime}</strong></span>
                            ${pos.createdFromTool ? `<span>Source: <strong>${pos.toolType || 'Drawing Tool'}</strong></span>` : ''}
                        </div>
                        
                        ${scalingMetrics}

                        ${pos.entryScreenshot ? `
                            <div class="order-card__screenshot" onclick="window.chart.orderManager.showScreenshotPreview('${pos.entryScreenshot}', 'Entry Screenshot - Order #${pos.id}')">
                                <img src="${pos.entryScreenshot}" alt="Entry Screenshot for Order ${pos.id}">
                                <div class="order-card__screenshot-caption">Click to enlarge</div>
                            </div>
                        ` : ''}

                        <div class="order-card__metrics">
                            <span>Entry <strong>$${pos.openPrice.toFixed(5)}</strong></span>
                            <span>Quantity <strong>${pos.quantity.toFixed(2)}</strong></span>
                            <span>Stop Loss <strong>${pos.stopLoss ? '$' + pos.stopLoss.toFixed(5) : 'None'}</strong></span>
                            <span>Take Profit <strong>${pos.takeProfit ? '$' + pos.takeProfit.toFixed(5) : 'None'}</strong></span>
                            <span>Auto Breakeven <strong>${autoBreakeven}</strong></span>
                            <span>Breakeven Mode <strong>${breakevenMode}</strong></span>
                        </div>

                        <div class="order-card__footer">
                            <div class="order-card__chips">
                                <span class="order-chip">Position ID <strong>#${pos.id}</strong></span>
                                <span class="order-chip">Risk Target <strong>${pos.riskAmount ? '$' + pos.riskAmount.toFixed(2) : '—'}</strong></span>
                                <span class="${pnlChipClass}">Unrealized P&amp;L <strong class="${pnlClass}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent.toFixed(2)}%)</strong></span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
            }
        }

        // Update bottom panel open positions table
        const bottomPositionsBodyEl = document.getElementById('bottomOpenPositionsBody');
        console.log('🔍 Bottom Open Positions Body element:', bottomPositionsBodyEl ? 'FOUND' : 'NOT FOUND');
        if (bottomPositionsBodyEl) {
            console.log('📝 Updating bottom open positions with', this.openPositions.length, 'positions');
            if (this.openPositions.length === 0) {
                bottomPositionsBodyEl.innerHTML = `
                    <tr class="replay-empty-row">
                        <td colspan="10">
                            <div class="replay-tab-empty">
                                No open positions. Use BUY or SELL buttons to open a position.
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                bottomPositionsBodyEl.innerHTML = this.openPositions.map((pos, index) => {
                    const pnl = Number.isFinite(pos.unrealizedPnL) ? pos.unrealizedPnL : 0;
                    const pnlClass = pnl > 0 ? 'order-value--profit' : pnl < 0 ? 'order-value--loss' : '';
                    const sideClass = pos.type === 'SELL' ? 'replay-badge--sell' : 'replay-badge--buy';
                    const currentPrice = this.chart?.latestCandle?.close || this.chart?.data?.[this.chart?.data?.length - 1]?.close || 0;
                    const quantity = pos.quantity ? pos.quantity.toFixed(2) : '—';
                    const entryPrice = pos.openPrice ? pos.openPrice.toFixed(5) : '—';
                    const currentPriceStr = currentPrice ? currentPrice.toFixed(5) : '—';
                    const sl = pos.stopLoss ? pos.stopLoss.toFixed(5) : '—';
                    const tp = pos.takeProfit ? pos.takeProfit.toFixed(5) : '—';

                    return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${pos.symbol || 'USD'}</td>
                            <td><span class="replay-badge ${sideClass}">${pos.type}</span></td>
                            <td class="replay-cell-number">${quantity}</td>
                            <td class="replay-cell-number">${entryPrice}</td>
                            <td class="replay-cell-number">${currentPriceStr}</td>
                            <td class="replay-cell-number ${pnlClass}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</td>
                            <td class="replay-cell-number">${tp}</td>
                            <td class="replay-cell-number">${sl}</td>
                            <td class="replay-cell-center">
                                <button class="order-btn order-btn--small order-btn--destructive" onclick="window.chart.orderManager.closePosition(${pos.id})" title="Close">✨</button>
                            </td>
                        </tr>
                    `;
                }).join('');
            }
        }

        // Update "All Trades" tab - combines pending, open, and closed
        const allTradesBodyEl = document.getElementById('allTradesBody');
        console.log('🔍 All Trades Tab - Element found:', !!allTradesBodyEl);
        console.log('🔍 Pending Orders:', this.pendingOrders ? this.pendingOrders.length : 'UNDEFINED');
        console.log('🔍 Open Positions:', this.openPositions ? this.openPositions.length : 'UNDEFINED');
        console.log('🔍 Trade Journal:', this.tradeJournal ? this.tradeJournal.length : 'UNDEFINED');
        console.log('🔍 Closed Positions:', this.closedPositions ? this.closedPositions.length : 'UNDEFINED');
        if (allTradesBodyEl) {
            const allTrades = [];
            
            // Add pending orders
            if (this.pendingOrders && Array.isArray(this.pendingOrders)) {
                this.pendingOrders.forEach(order => {
                allTrades.push({
                    type: 'pending',
                    id: order.id,
                    symbol: order.symbol || 'USD',
                    direction: order.direction || '—',
                    quantity: order.quantity,
                    orderType: order.orderType,
                    entryPrice: order.entryPrice,
                    currentPrice: null,
                    pnl: null,
                    stopLoss: order.stopLoss,
                    takeProfit: order.takeProfit,
                    time: order.placedTime,
                    order: order
                });
                });
            }
            
            // Add open positions
            if (this.openPositions && Array.isArray(this.openPositions)) {
                this.openPositions.forEach(pos => {
                const currentPrice = this.chart?.latestCandle?.close || this.chart?.data?.[this.chart?.data?.length - 1]?.close || 0;
                allTrades.push({
                    type: 'open',
                    id: pos.id,
                    symbol: pos.symbol || 'USD',
                    direction: pos.type,
                    quantity: pos.quantity,
                    orderType: 'MARKET',
                    entryPrice: pos.openPrice,
                    currentPrice: currentPrice,
                    pnl: pos.unrealizedPnL || 0,
                    stopLoss: pos.stopLoss,
                    takeProfit: pos.takeProfit,
                    time: pos.openTime,
                    position: pos
                });
                });
            }
            
            // Add closed positions (from trade journal)
            if (this.tradeJournal && Array.isArray(this.tradeJournal)) {
                this.tradeJournal.forEach(trade => {
                    if (trade.status === 'closed') {
                        allTrades.push({
                            type: 'closed',
                            id: trade.id,
                            symbol: trade.symbol || 'USD',
                            direction: trade.type,
                            quantity: trade.quantity,
                            orderType: 'MARKET',
                            entryPrice: trade.openPrice,
                            currentPrice: trade.closePrice,
                            pnl: trade.realizedPnL || 0,
                            stopLoss: trade.stopLoss,
                            takeProfit: trade.takeProfit,
                            time: trade.closeTime || trade.openTime,
                            trade: trade
                        });
                    }
                });
            }
            
            // Update meta counts
            const totalTradesEl = document.getElementById('replayMetaTotalTrades');
            const pendingAllEl = document.getElementById('replayMetaPendingAll');
            const openAllEl = document.getElementById('replayMetaOpenAll');
            const closedAllEl = document.getElementById('replayMetaClosedAll');
            const balanceAllEl = document.getElementById('replayMetaBalanceAll');
            
            if (totalTradesEl) totalTradesEl.textContent = allTrades.length;
            if (pendingAllEl) pendingAllEl.textContent = this.pendingOrders ? this.pendingOrders.length : 0;
            if (openAllEl) openAllEl.textContent = this.openPositions ? this.openPositions.length : 0;
            if (closedAllEl) {
                const closedCount = this.tradeJournal ? this.tradeJournal.filter(t => t.status === 'closed').length : 0;
                closedAllEl.textContent = closedCount;
            }
            if (balanceAllEl) balanceAllEl.textContent = `$${this.balance.toFixed(2)}`;
            
            console.log('🔍 All Trades array length:', allTrades.length);
            console.log('🔍 All Trades data:', allTrades);
            
            if (allTrades.length === 0) {
                allTradesBodyEl.innerHTML = `
                    <tr class="replay-empty-row">
                        <td colspan="13">
                            <div class="replay-tab-empty">
                                No trades yet. Place orders or open positions to see them here.
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                // Sort by time (newest first)
                allTrades.sort((a, b) => (b.time || 0) - (a.time || 0));
                
                allTradesBodyEl.innerHTML = allTrades.map((trade, index) => {
                    const statusBadge = trade.type === 'pending' ? '<span class="replay-badge" style="background:#fbbf24;">PENDING</span>' :
                                       trade.type === 'open' ? '<span class="replay-badge" style="background:#3b82f6;">OPEN</span>' :
                                       '<span class="replay-badge" style="background:#6b7280;">CLOSED</span>';
                    
                    const sideClass = trade.direction === 'SELL' || trade.direction === 'sell' ? 'replay-badge--sell' : 'replay-badge--buy';
                    const direction = (trade.direction || '—').toUpperCase();
                    const orderType = trade.orderType ? trade.orderType.toUpperCase() : '—';
                    const quantity = trade.quantity ? trade.quantity.toFixed(2) : '—';
                    const entryPrice = trade.entryPrice ? trade.entryPrice.toFixed(5) : '—';
                    const currentPrice = trade.currentPrice ? trade.currentPrice.toFixed(5) : '—';
                    const tp = trade.takeProfit ? trade.takeProfit.toFixed(5) : '—';
                    const sl = trade.stopLoss ? trade.stopLoss.toFixed(5) : '—';
                    const time = this.format24Hour(trade.time);
                    
                    let pnlDisplay = '—';
                    let pnlClass = '';
                    if (trade.pnl !== null && trade.pnl !== undefined) {
                        pnlDisplay = `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`;
                        pnlClass = trade.pnl > 0 ? 'order-value--profit' : trade.pnl < 0 ? 'order-value--loss' : '';
                    }
                    
                    let actions = '';
                    if (trade.type === 'pending') {
                        actions = `
                            <button class="order-btn order-btn--small" onclick="window.chart.orderManager.editPendingOrder(${trade.id})" title="Edit">✏️</button>
                            <button class="order-btn order-btn--small order-btn--destructive" onclick="window.chart.orderManager.cancelPendingOrder(${trade.id})" title="Cancel">🗑️</button>
                        `;
                    } else if (trade.type === 'open') {
                        actions = `
                            <button class="order-btn order-btn--small order-btn--destructive" onclick="window.chart.orderManager.closePosition(${trade.id})" title="Close">✨</button>
                        `;
                    }
                    
                    return `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${statusBadge}</td>
                            <td>${trade.symbol}</td>
                            <td><span class="replay-badge ${sideClass}">${direction}</span></td>
                            <td class="replay-cell-number">${quantity}</td>
                            <td><span class="replay-badge">${orderType}</span></td>
                            <td class="replay-cell-number">${entryPrice}</td>
                            <td class="replay-cell-number">${currentPrice}</td>
                            <td class="replay-cell-number ${pnlClass}">${pnlDisplay}</td>
                            <td class="replay-cell-number">${tp}</td>
                            <td class="replay-cell-number">${sl}</td>
                            <td>${time}</td>
                            <td class="replay-cell-center">${actions}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        // Update HISTORY TAB (4th tab) - from tradeJournal
        const replayPositionsBodyEl = document.getElementById('replayPositionsBody');
        const replayMetaOpenCount = document.getElementById('replayMetaOpenCount');
        const replayMetaClosedCount = document.getElementById('replayMetaClosedCount');
        
        console.log('🔍 History Tab Body element:', replayPositionsBodyEl ? 'FOUND' : 'NOT FOUND');
        
        if (replayPositionsBodyEl) {
            console.log('📝 Updating History tab with', this.tradeJournal.length, 'closed trades');
            
            if (this.tradeJournal.length === 0) {
                replayPositionsBodyEl.innerHTML = `
                    <tr class="replay-empty-row">
                        <td colspan="12">
                            <div class="replay-tab-empty">
                                No closed positions yet. Once trades are executed, they will appear here.
                            </div>
                        </td>
                    </tr>
                `;
            } else {
                const reversedJournal = this.tradeJournal.slice().reverse();
                replayPositionsBodyEl.innerHTML = reversedJournal.map((trade, index) => {
                    const tradeId = trade.tradeId || trade.id;
                    const direction = trade.direction || trade.type;
                    const sideClass = direction === 'SELL' ? 'replay-badge--sell' : 'replay-badge--buy';
                    const quantity = trade.quantity || 0;
                    const status = trade.status || 'CLOSED';
                    const statusClass = status === 'CLOSED' ? 'replay-badge--closed' : 'replay-badge--open';
                    const openTime = this.format24Hour(trade.openTime);
                    const closeTime = this.format24Hour(trade.closeTime);
                    const entryPrice = trade.entryPrice || trade.openPrice || 0;
                    const exitPrice = trade.exitPrice || trade.closePrice || 0;
                    const pnl = trade.netPnL || trade.pnl || 0;
                    const pnlClass = pnl > 0 ? 'order-value--profit' : pnl < 0 ? 'order-value--loss' : '';
                    const tags = trade.tags && trade.tags.length > 0 ? trade.tags.join(', ') : '—';
                    
                    // Entries column: show number of entries (1 for regular, 2+ for scaled)
                    const numberOfEntries = trade.numberOfEntries || 1;
                    const entriesDisplay = numberOfEntries > 1 
                        ? `<span style="background: #f59e0b; color: #000; padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 12px;">${numberOfEntries}</span>`
                        : `<span style="color: #94a3b8;">${numberOfEntries}</span>`;

                    return `
                        <tr style="cursor: pointer;" onclick="window.chart.orderManager.showTradeDetailsFromBottom(${index})">
                            <td>${this.tradeJournal.length - index}</td>
                            <td>${trade.symbol || 'USD'}</td>
                            <td><span class="replay-badge ${sideClass}">${direction}</span></td>
                            <td class="replay-cell-number">${quantity.toFixed(2)}</td>
                            <td class="replay-cell-center">${entriesDisplay}</td>
                            <td><span class="replay-badge ${statusClass}">${status}</span></td>
                            <td>${openTime}</td>
                            <td>${closeTime}</td>
                            <td class="replay-cell-number">${entryPrice.toFixed(5)}</td>
                            <td class="replay-cell-number">${exitPrice.toFixed(5)}</td>
                            <td class="replay-cell-number ${pnlClass}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</td>
                            <td class="replay-cell-center">${tags}</td>
                        </tr>
                    `;
                }).join('');
            }
        }
        
        // Update History tab meta counts
        if (replayMetaOpenCount) {
            replayMetaOpenCount.textContent = this.openPositions.length;
        }
        if (replayMetaClosedCount) {
            replayMetaClosedCount.textContent = this.tradeJournal.length;
        }
        
        console.log('✅ updatePositionsPanel() completed successfully');
        console.log('   📊 All 4 tabs synchronized:');
        console.log('      1. All Trades: ', (this.pendingOrders?.length || 0) + (this.openPositions?.length || 0) + (this.tradeJournal?.length || 0), 'total');
        console.log('      2. Pending Orders:', this.pendingOrders?.length || 0);
        console.log('      3. Open Positions:', this.openPositions?.length || 0);
        console.log('      4. History:', this.tradeJournal?.length || 0);
        
        // Update scaling checkbox availability when positions change
        this.updateScalingCheckboxAvailability();
    }
    
    /**
     * Show positions panel
     */
    showPositionsPanel() {
        const panel = document.getElementById('tradingPanel');
        const iconBtn = document.getElementById('tradingIconBtn');
        
        if (panel && !panel.classList.contains('visible')) {
            // Close other panels
            const objectTreePanel = document.getElementById('objectTreePanel');
            const objectTreeBtn = document.getElementById('objectTreeIconBtn');
            if (objectTreePanel) objectTreePanel.classList.remove('visible');
            if (objectTreeBtn) objectTreeBtn.classList.remove('active');
            
            // Open trading panel
            panel.classList.add('visible');
            if (iconBtn) iconBtn.classList.add('active');
        }
    }
    
    /**
     * Switch between tabs
     */
    switchTab(tab) {
        this.currentTab = tab;
        
        // Update tab buttons
        const detailsTab = document.getElementById('tradingDetailsTab');
        const journalTab = document.getElementById('tradingJournalTab');
        const detailsContent = document.getElementById('tradingDetailsContent');
        const journalContent = document.getElementById('tradingJournalContent');
        
        if (tab === 'details') {
            if (detailsTab) detailsTab.classList.add('active');
            if (journalTab) journalTab.classList.remove('active');
            if (detailsContent) detailsContent.style.display = 'block';
            if (journalContent) journalContent.style.display = 'none';
        } else {
            if (detailsTab) detailsTab.classList.remove('active');
            if (journalTab) journalTab.classList.add('active');
            if (detailsContent) detailsContent.style.display = 'none';
            if (journalContent) journalContent.style.display = 'block';
            
            // Update trade history when switching to journal tab
            console.log('🔄 Switching to Journal tab - calling updateJournalTab()');
            this.updateJournalTab();
        }
    }
    
    /**
     * Get trading statistics
     */
    getStats() {
        const totalTrades = this.closedPositions.length;
        const winningTrades = this.closedPositions.filter(p => p.pnl > 0).length;
        const losingTrades = this.closedPositions.filter(p => p.pnl < 0).length;
        
        const totalProfit = this.closedPositions
            .filter(p => p.pnl > 0)
            .reduce((sum, p) => sum + p.pnl, 0);
        
        const totalLoss = this.closedPositions
            .filter(p => p.pnl < 0)
            .reduce((sum, p) => sum + Math.abs(p.pnl), 0);
        
        const netPnL = totalProfit - totalLoss;
        const winRate = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;
        
        return {
            totalTrades,
            winningTrades,
            losingTrades,
            totalProfit,
            totalLoss,
            netPnL,
            winRate,
            currentBalance: this.balance,
            currentEquity: this.equity
        };
    }
    
    /**
     * Create notification container
     */
    createNotificationContainer() {
        if (document.getElementById('orderNotifications')) return;
        
        const container = document.createElement('div');
        container.id = 'orderNotifications';
        container.style.cssText = `
            position: fixed;
            top: 70px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }
    
    /**
     * Capture current protection settings
     */
    captureProtectionSettings() {
        return {
            breakeven: {
                enabled: document.getElementById('autoBreakevenToggle')?.checked || false,
                mode: this.breakevenMode || 'pips',
                pipsValue: parseFloat(document.getElementById('breakevenPips')?.value || 10),
                amountValue: parseFloat(document.getElementById('breakevenAmount')?.value || 50),
                pipOffset: parseFloat(document.getElementById('breakevenPipOffset')?.value || 0)
            },
            trailing: {
                enabled: document.getElementById('trailingSLToggle')?.checked || false,
                activateMode: this.trailingActivateMode || 'trail-rr',
                rrValue: parseFloat(document.getElementById('trailingActivateRR')?.value || 1.5),
                pipsValue: parseFloat(document.getElementById('trailingActivatePips')?.value || 10),
                stepSize: parseFloat(document.getElementById('trailingStepSize')?.value || 4)
            },
            multipleTP: {
                enabled: document.getElementById('multipleTPToggle')?.checked || false,
                numberOfTargets: parseInt(document.getElementById('numTPTargets')?.value || 2),
                targets: this.tpTargets ? this.tpTargets.map(t => ({
                    price: t.price,
                    percentage: t.percentage
                })) : []
            }
        };
    }
    
    /**
     * Apply protection settings
     */
    applyProtectionSettings(setting) {
        // Apply breakeven settings
        const beToggle = document.getElementById('autoBreakevenToggle');
        if (beToggle) beToggle.checked = setting.breakeven.enabled;
        
        this.breakevenMode = setting.breakeven.mode;
        const pipsInput = document.getElementById('breakevenPips');
        if (pipsInput) pipsInput.value = setting.breakeven.pipsValue;
        const amountInput = document.getElementById('breakevenAmount');
        if (amountInput) amountInput.value = setting.breakeven.amountValue;
        const pipOffset = document.getElementById('breakevenPipOffset');
        if (pipOffset) pipOffset.value = setting.breakeven.pipOffset;
        
        // Apply trailing settings
        const trailToggle = document.getElementById('trailingSLToggle');
        if (trailToggle) trailToggle.checked = setting.trailing.enabled;
        
        this.trailingActivateMode = setting.trailing.activateMode;
        document.getElementById('trailingActivateRR').value = setting.trailing.rrValue;
        document.getElementById('trailingActivatePips').value = setting.trailing.pipsValue;
        document.getElementById('trailingStepSize').value = setting.trailing.stepSize;
        
        // Update UI to show correct mode tabs and inputs
        const bePipsInput = document.getElementById('breakevenPipsInput');
        const beAmountInput = document.getElementById('breakevenAmountInput');
        if (setting.breakeven.mode === 'pips') {
            if (bePipsInput) bePipsInput.style.display = 'flex';
            if (beAmountInput) beAmountInput.style.display = 'none';
        } else {
            if (bePipsInput) bePipsInput.style.display = 'none';
            if (beAmountInput) beAmountInput.style.display = 'flex';
        }
        
        const trailRRInput = document.getElementById('trailingActivateRRInput');
        const trailPipsInput = document.getElementById('trailingActivatePipsInput');
        if (setting.trailing.activateMode === 'trail-rr') {
            if (trailRRInput) trailRRInput.style.display = 'flex';
            if (trailPipsInput) trailPipsInput.style.display = 'none';
        } else {
            if (trailRRInput) trailRRInput.style.display = 'none';
            if (trailPipsInput) trailPipsInput.style.display = 'flex';
        }
        
        // Update tab styling
        document.querySelectorAll('.breakeven-mode-tab').forEach(t => {
            const tabMode = t.getAttribute('data-mode');
            if (tabMode === setting.breakeven.mode) {
                t.style.background = '#7c3aed';
                t.style.color = '#fff';
                t.style.border = 'none';
            } else {
                t.style.background = 'transparent';
                t.style.color = '#787b86';
                t.style.border = '1px solid #2a2e39';
            }
        });
        
        // Show/hide settings panels
        const beSettings = document.getElementById('breakevenSettings');
        const trailSettings = document.getElementById('trailingSLSettings');
        if (beSettings) beSettings.classList.toggle('is-hidden', !setting.breakeven.enabled);
        if (trailSettings) trailSettings.classList.toggle('is-hidden', !setting.trailing.enabled);
        
        // Apply Multiple TP settings
        if (setting.multipleTP) {
            const multipleTPToggle = document.getElementById('multipleTPToggle');
            if (multipleTPToggle) multipleTPToggle.checked = setting.multipleTP.enabled;
            
            const multipleTPSettings = document.getElementById('multipleTPSettings');
            if (multipleTPSettings) multipleTPSettings.classList.toggle('is-hidden', !setting.multipleTP.enabled);
            
            if (setting.multipleTP.enabled) {
                // Set number of targets
                const numTPInput = document.getElementById('numTPTargets');
                if (numTPInput) numTPInput.value = setting.multipleTP.numberOfTargets;
                
                // Initialize TP targets with saved data
                if (setting.multipleTP.targets && setting.multipleTP.targets.length > 0) {
                    this.tpTargets = setting.multipleTP.targets.map((t, idx) => ({
                        id: idx + 1,
                        price: t.price,
                        percentage: t.percentage
                    }));
                    this.renderTPTargets();
                } else {
                    this.initializeTPTargets();
                }
            }
        }
        
        // Update preview lines
        this.updatePreviewLines();
    }
    
    /**
     * Load saved protection settings into dropdown
     */
    loadSavedProtectionSettings() {
        const select = document.getElementById('savedProtectionSettings');
        if (!select) return;
        
        const saved = JSON.parse(localStorage.getItem('protectionSettings') || '[]');
        
        // Clear existing options except first one
        select.innerHTML = '<option value="">-- Select Saved Setting --</option>';
        
        // Add saved settings
        saved.forEach(setting => {
            const option = document.createElement('option');
            option.value = setting.name;
            option.textContent = setting.name;
            select.appendChild(option);
        });
    }
    
    /**
     * Open modal to create new protection setting
     */
    openProtectionSettingsModal() {
        // Create modal overlay
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        // Create modal content
        const content = document.createElement('div');
        content.style.cssText = `
            background: #131722;
            border: 1px solid rgba(255,255,255,0.1);
            border-radius: 8px;
            padding: 24px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        `;
        
        content.innerHTML = `
            <h3 style="margin: 0 0 20px 0; font-size: 16px; color: #fff; font-weight: 600;">
                ⚙️ Create Protection Setting
            </h3>
            
            <!-- Preset Name -->
            <div style="margin-bottom: 20px;">
                <label style="display: block; font-size: 11px; color: #9ca3af; margin-bottom: 6px;">Setting Name</label>
                <input type="text" id="modalPresetName" placeholder="e.g., My Scalping Strategy" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 8px; font-size: 12px; color: #fff;">
            </div>
            
            <!-- Breakeven Section -->
            <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <span style="font-size: 12px; font-weight: 600; color: #fff;">🛡️ Auto Breakeven</span>
                    <label class="toggle-switch" style="transform: scale(0.8);">
                        <input type="checkbox" id="modalBreakevenToggle">
                        <span class="toggle-switch__track"></span>
                        <span class="toggle-switch__thumb"></span>
                    </label>
                </div>
                <div id="modalBreakevenSettings" style="display: none;">
                    <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                        <button class="modal-be-mode-tab" data-mode="pips" style="flex: 1; padding: 6px; font-size: 10px; background: #7c3aed; border: none; color: #fff; border-radius: 4px; cursor: pointer;">Pips</button>
                        <button class="modal-be-mode-tab" data-mode="amount" style="flex: 1; padding: 6px; font-size: 10px; background: transparent; border: 1px solid #2a2e39; color: #787b86; border-radius: 4px; cursor: pointer;">Amount $</button>
                    </div>
                    <div id="modalBreakevenPipsInput" style="display: flex;">
                        <input type="number" id="modalBreakevenPips" value="10" min="1" step="1" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; font-size: 11px; color: #fff;">
                        <span style="padding: 6px 10px; font-size: 10px; color: #9ca3af;">Pips</span>
                    </div>
                    <div id="modalBreakevenAmountInput" style="display: none;">
                        <input type="number" id="modalBreakevenAmount" value="50" min="1" step="1" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; font-size: 11px; color: #fff;">
                        <span style="padding: 6px 10px; font-size: 10px; color: #9ca3af;">$</span>
                    </div>
                </div>
            </div>
            
            <!-- Trailing SL Section -->
            <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 16px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <span style="font-size: 12px; font-weight: 600; color: #fff;">📊 Trailing Stop Loss</span>
                    <label class="toggle-switch" style="transform: scale(0.8);">
                        <input type="checkbox" id="modalTrailingToggle">
                        <span class="toggle-switch__track"></span>
                        <span class="toggle-switch__thumb"></span>
                    </label>
                </div>
                <div id="modalTrailingSettings" style="display: none;">
                    <label style="display: block; font-size: 10px; color: #9ca3af; margin-bottom: 4px;">Activate At</label>
                    <div style="display: flex; gap: 6px; margin-bottom: 8px;">
                        <button class="modal-trail-mode-tab" data-mode="trail-rr" style="flex: 1; padding: 6px; font-size: 10px; background: #7c3aed; border: none; color: #fff; border-radius: 4px; cursor: pointer;">R:R</button>
                        <button class="modal-trail-mode-tab" data-mode="trail-pips" style="flex: 1; padding: 6px; font-size: 10px; background: transparent; border: 1px solid #2a2e39; color: #787b86; border-radius: 4px; cursor: pointer;">Pips</button>
                    </div>
                    <div id="modalTrailingRRInput" style="display: flex; margin-bottom: 8px;">
                        <input type="number" id="modalTrailingRR" value="1.5" min="0.1" step="0.1" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; font-size: 11px; color: #fff;">
                        <span style="padding: 6px 10px; font-size: 10px; color: #9ca3af;">RR</span>
                    </div>
                    <div id="modalTrailingPipsInput" style="display: none; margin-bottom: 8px;">
                        <input type="number" id="modalTrailingPips" value="10" min="1" step="1" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; font-size: 11px; color: #fff;">
                        <span style="padding: 6px 10px; font-size: 10px; color: #9ca3af;">Pips</span>
                    </div>
                    <label style="display: block; font-size: 10px; color: #9ca3af; margin-bottom: 4px;">Step Size</label>
                    <div style="display: flex;">
                        <input type="number" id="modalTrailingStep" value="4" min="1" step="1" style="flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; font-size: 11px; color: #fff;">
                        <span style="padding: 6px 10px; font-size: 10px; color: #9ca3af;">Pips</span>
                    </div>
                </div>
            </div>
            
            <!-- Multiple TP Section -->
            <div style="background: rgba(255,255,255,0.02); border-radius: 6px; padding: 16px; margin-bottom: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <span style="font-size: 12px; font-weight: 600; color: #fff;">🎯 Multiple Take Profits</span>
                    <label class="toggle-switch" style="transform: scale(0.8);">
                        <input type="checkbox" id="modalMultipleTPToggle">
                        <span class="toggle-switch__track"></span>
                        <span class="toggle-switch__thumb"></span>
                    </label>
                </div>
                <div id="modalMultipleTPSettings" style="display: none;">
                    <label style="display: block; font-size: 10px; color: #9ca3af; margin-bottom: 4px;">Number of Targets</label>
                    <input type="number" id="modalNumTPTargets" value="3" min="2" max="10" step="1" style="width: 100%; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 6px; font-size: 11px; color: #fff;">
                </div>
            </div>
            
            <!-- Buttons -->
            <div style="display: flex; gap: 10px;">
                <button id="modalCancelBtn" style="flex: 1; padding: 10px; font-size: 12px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #fff; border-radius: 4px; cursor: pointer;">
                    Cancel
                </button>
                <button id="modalSaveBtn" style="flex: 1; padding: 10px; font-size: 12px; background: rgba(34, 197, 94, 0.2); border: 1px solid rgba(34, 197, 94, 0.4); color: #22c55e; border-radius: 4px; cursor: pointer; font-weight: 600;">
                    💾 Save Setting
                </button>
            </div>
        `;
        
        modal.appendChild(content);
        document.body.appendChild(modal);
        
        // Modal state
        let modalBeMode = 'pips';
        let modalTrailMode = 'trail-rr';
        
        // Toggle handlers
        document.getElementById('modalBreakevenToggle').onchange = (e) => {
            document.getElementById('modalBreakevenSettings').style.display = e.target.checked ? 'block' : 'none';
        };
        
        document.getElementById('modalTrailingToggle').onchange = (e) => {
            document.getElementById('modalTrailingSettings').style.display = e.target.checked ? 'block' : 'none';
        };
        
        document.getElementById('modalMultipleTPToggle').onchange = (e) => {
            document.getElementById('modalMultipleTPSettings').style.display = e.target.checked ? 'block' : 'none';
        };
        
        // Breakeven mode tabs
        document.querySelectorAll('.modal-be-mode-tab').forEach(tab => {
            tab.onclick = () => {
                const mode = tab.getAttribute('data-mode');
                modalBeMode = mode;
                
                document.querySelectorAll('.modal-be-mode-tab').forEach(t => {
                    if (t.getAttribute('data-mode') === mode) {
                        t.style.background = '#7c3aed';
                        t.style.color = '#fff';
                        t.style.border = 'none';
                    } else {
                        t.style.background = 'transparent';
                        t.style.color = '#787b86';
                        t.style.border = '1px solid #2a2e39';
                    }
                });
                
                if (mode === 'pips') {
                    document.getElementById('modalBreakevenPipsInput').style.display = 'flex';
                    document.getElementById('modalBreakevenAmountInput').style.display = 'none';
                } else {
                    document.getElementById('modalBreakevenPipsInput').style.display = 'none';
                    document.getElementById('modalBreakevenAmountInput').style.display = 'flex';
                }
            };
        });
        
        // Trailing mode tabs
        document.querySelectorAll('.modal-trail-mode-tab').forEach(tab => {
            tab.onclick = () => {
                const mode = tab.getAttribute('data-mode');
                modalTrailMode = mode;
                
                document.querySelectorAll('.modal-trail-mode-tab').forEach(t => {
                    if (t.getAttribute('data-mode') === mode) {
                        t.style.background = '#7c3aed';
                        t.style.color = '#fff';
                        t.style.border = 'none';
                    } else {
                        t.style.background = 'transparent';
                        t.style.color = '#787b86';
                        t.style.border = '1px solid #2a2e39';
                    }
                });
                
                if (mode === 'trail-rr') {
                    document.getElementById('modalTrailingRRInput').style.display = 'flex';
                    document.getElementById('modalTrailingPipsInput').style.display = 'none';
                } else {
                    document.getElementById('modalTrailingRRInput').style.display = 'none';
                    document.getElementById('modalTrailingPipsInput').style.display = 'flex';
                }
            };
        });
        
        // Cancel button
        document.getElementById('modalCancelBtn').onclick = () => {
            modal.remove();
        };
        
        // Save button
        document.getElementById('modalSaveBtn').onclick = () => {
            const name = document.getElementById('modalPresetName').value.trim();
            if (!name) {
                this.showNotification('⚠️ Please enter a setting name', 'warning');
                return;
            }
            
            const setting = {
                name: name,
                breakeven: {
                    enabled: document.getElementById('modalBreakevenToggle').checked,
                    mode: modalBeMode,
                    pipsValue: parseFloat(document.getElementById('modalBreakevenPips').value || 10),
                    amountValue: parseFloat(document.getElementById('modalBreakevenAmount').value || 50),
                    pipOffset: 0
                },
                trailing: {
                    enabled: document.getElementById('modalTrailingToggle').checked,
                    activateMode: modalTrailMode,
                    rrValue: parseFloat(document.getElementById('modalTrailingRR').value || 1.5),
                    pipsValue: parseFloat(document.getElementById('modalTrailingPips').value || 10),
                    stepSize: parseFloat(document.getElementById('modalTrailingStep').value || 4)
                },
                multipleTP: {
                    enabled: document.getElementById('modalMultipleTPToggle').checked,
                    numberOfTargets: parseInt(document.getElementById('modalNumTPTargets').value || 3),
                    targets: []
                }
            };
            
            let saved = JSON.parse(localStorage.getItem('protectionSettings') || '[]');
            
            // Check if name already exists
            const existingIndex = saved.findIndex(s => s.name === setting.name);
            if (existingIndex >= 0) {
                if (!confirm(`Setting "${setting.name}" already exists. Overwrite?`)) return;
                saved[existingIndex] = setting;
            } else {
                saved.push(setting);
            }
            
            localStorage.setItem('protectionSettings', JSON.stringify(saved));
            this.loadSavedProtectionSettings();
            this.showNotification(`💾 Protection setting "${setting.name}" saved!`, 'success');
            modal.remove();
        };
        
        // Focus name input
        setTimeout(() => {
            document.getElementById('modalPresetName')?.focus();
        }, 100);
    }
    
    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const container = document.getElementById('orderNotifications');
        if (!container) return;
        
        const notification = document.createElement('div');
        notification.style.cssText = `
            background: ${type === 'success' ? 'rgba(34, 197, 94, 0.95)' : 
                         type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 
                         type === 'warning' ? 'rgba(245, 158, 11, 0.95)' : 
                         'rgba(59, 130, 246, 0.95)'};
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            animation: slideIn 0.3s ease-out;
            pointer-events: auto;
            min-width: 280px;
            max-width: 400px;
        `;
        notification.textContent = message;
        
        // Add animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes slideIn {
                from {
                    transform: translateX(400px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            @keyframes slideOut {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(400px);
                    opacity: 0;
                }
            }
        `;
        if (!document.getElementById('notificationStyles')) {
            style.id = 'notificationStyles';
            document.head.appendChild(style);
        }
        
        container.appendChild(notification);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease-in';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 4000);
    }
    
    /**
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     * PROFESSIONAL TRAILING STOP LOSS SYSTEM
     * NinjaTrader-style automatic trailing with activation threshold
     * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     */
    
    /**
     * Initialize step-based trailing SL with activation threshold
     */
    initializeTrailingSL() {
        const trailingEnabled = document.getElementById('trailingSLToggle')?.checked;
        if (!trailingEnabled) {
            this.stopTrailingSL();
            return;
        }
        
        const entryPrice = parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        const slPrice = parseFloat(document.getElementById('slPrice')?.value || 0);
        
        if (!entryPrice || !slPrice) {
            console.warn('⚠️ Entry and SL prices required for trailing');
            return;
        }
        
        // Get activation settings
        const activateMode = this.trailingActivateMode || 'trail-rr';
        let activationThreshold;
        
        if (activateMode === 'trail-rr') {
            const activateRR = parseFloat(document.getElementById('trailingActivateRR')?.value || 1);
            const risk = Math.abs(entryPrice - slPrice);
            const reward = risk * activateRR;
            
            if (this.orderSide === 'BUY') {
                activationThreshold = entryPrice + reward;
            } else {
                activationThreshold = entryPrice - reward;
            }
        } else {
            // trail-pips mode
            const activatePips = parseFloat(document.getElementById('trailingActivatePips')?.value || 10);
            const pipDistance = activatePips * this.pipSize;
            
            if (this.orderSide === 'BUY') {
                activationThreshold = entryPrice + pipDistance;
            } else {
                activationThreshold = entryPrice - pipDistance;
            }
        }
        
        // Get step size in pips
        const stepPips = parseFloat(document.getElementById('trailingStepSize')?.value || 4);
        const stepSize = stepPips * this.pipSize;
        
        // Initialize trailing state for step-based system with activation
        this.trailingState = {
            isActive: false,  // Not active until threshold reached
            activated: false,  // Track if activation happened
            entryPrice: entryPrice,
            originalSL: slPrice,
            currentSL: slPrice,
            activationThreshold: activationThreshold,
            activateMode: activateMode,
            stepSize: stepSize,
            stepPips: stepPips,
            currentStep: 0,  // Number of steps moved
            orderSide: this.orderSide,
            lastUpdate: Date.now()
        };
        
        console.log('🎯 Step-based Trailing SL initialized:', {
            entry: entryPrice.toFixed(5),
            initialSL: slPrice.toFixed(5),
            activationThreshold: activationThreshold.toFixed(5),
            stepSize: `${stepPips} pips`,
            mode: activateMode,
            side: this.orderSide
        });
        
        // Update visual indicator (waiting state)
        this.updateTrailingIndicator(false);
        
        // Start monitoring price
        this.startPriceMonitoring();
    }
    
    /**
     * Start monitoring current price for trailing updates
     */
    startPriceMonitoring() {
        // Stop any existing monitor
        this.stopPriceMonitoring();
        
        // Monitor price every 500ms
        this.priceMonitorInterval = setInterval(() => {
            this.updateTrailingSL();
        }, 500);
        
        console.log('👁️ Price monitoring started for trailing SL');
    }
    
    /**
     * Stop price monitoring
     */
    stopPriceMonitoring() {
        if (this.priceMonitorInterval) {
            clearInterval(this.priceMonitorInterval);
            this.priceMonitorInterval = null;
            console.log('👁️ Price monitoring stopped');
        }
    }
    
    /**
     * Update step-based trailing SL with activation check
     */
    updateTrailingSL() {
        if (!this.trailingState || !this.chart) return;
        
        // Get current price from last candle
        const data = this.chart.data;
        if (!data || data.length === 0) return;
        
        const lastCandle = data[data.length - 1];
        const currentPrice = lastCandle.close;
        
        const { entryPrice, originalSL, currentSL, activationThreshold, stepSize, stepPips, currentStep, orderSide, activated } = this.trailingState;
        
        // Check if we should activate trailing
        if (!activated) {
            let shouldActivate = false;
            
            if (orderSide === 'BUY') {
                shouldActivate = currentPrice >= activationThreshold;
            } else {
                shouldActivate = currentPrice <= activationThreshold;
            }
            
            if (shouldActivate) {
                this.trailingState.activated = true;
                this.trailingState.isActive = true;
                
                // Show activation notification
                this.showNotification('🎯 Trailing SL Activated! Now trails in steps.', 'success');
                console.log(`✅ Trailing activated! Price: ${currentPrice.toFixed(5)}, Threshold: ${activationThreshold.toFixed(5)}`);
                
                // Update visual indicator
                this.updateTrailingIndicator(true);
            } else {
                // Not activated yet - update waiting status
                const profitDistance = orderSide === 'BUY' ? currentPrice - entryPrice : entryPrice - currentPrice;
                this.updateTrailingStatusDetails(0, profitDistance / this.pipSize, false);
                return;
            }
        }
        
        // If trailing is active, apply step-based logic
        if (this.trailingState.isActive) {
            // Calculate profit from ACTIVATION THRESHOLD (not from entry!)
            let profitFromActivation;
            if (orderSide === 'BUY') {
                profitFromActivation = currentPrice - activationThreshold;
            } else {
                profitFromActivation = activationThreshold - currentPrice;
            }
            
            // Calculate how many steps of profit we've reached since activation
            const stepsReached = Math.floor(profitFromActivation / stepSize);
            
            // Only update if we've reached a new step level
            if (stepsReached > currentStep && stepsReached > 0) {
                // Calculate new SL position to maintain original risk distance
                let newSL;
                if (orderSide === 'BUY') {
                    const originalRisk = entryPrice - originalSL;
                    newSL = activationThreshold + (stepsReached * stepSize) - originalRisk;
                } else {
                    const originalRisk = originalSL - entryPrice;
                    newSL = activationThreshold - (stepsReached * stepSize) + originalRisk;
                }
                
                // Update state
                this.trailingState.currentSL = newSL;
                this.trailingState.currentStep = stepsReached;
                this.trailingState.lastUpdate = Date.now();
                
                // Update the SL input field
                const slInput = document.getElementById('slPrice');
                if (slInput) {
                    slInput.value = newSL.toFixed(5);
                }
                
                // Update preview lines
                this.updatePreviewLines();
                
                // Recalculate risk/reward
                this.calculateAdvancedRiskReward();
                
                // Show notification
                this.showNotification(`📈 SL moved to Step ${stepsReached} (+${stepsReached * stepPips} pips)`, 'success');
                
                console.log(`📈 Step Trailing: ${currentSL.toFixed(5)} → ${newSL.toFixed(5)} (Step ${currentStep} → ${stepsReached})`);
            }
            
            // Update status details (show profit from activation, not entry)
            this.updateTrailingStatusDetails(stepsReached, profitFromActivation / this.pipSize, true);
        }
    }
    
    /**
     * Update trailing indicator visual state
     */
    updateTrailingIndicator(isActive) {
        const hint = document.querySelector('#trailingSLSettings .order-hint');
        const statusBox = document.getElementById('trailingStatus');
        
        if (!hint || !statusBox) return;
        
        if (isActive) {
            statusBox.style.display = 'block';
            statusBox.style.borderLeftColor = '#22c55e';
            statusBox.querySelector('span').textContent = '📊';
            statusBox.querySelector('div > div:first-child').textContent = 'Step Trailing Active';
            statusBox.querySelector('div > div:first-child').style.color = '#22c55e';
            
            // Update hint based on step size
            const stepPips = this.trailingState?.stepPips || 4;
            hint.textContent = `SL moves up by ${stepPips} pips each time price moves +${stepPips} pips`;
            hint.style.color = '#22c55e';
            hint.style.fontWeight = '500';
        } else {
            statusBox.style.display = 'none';
            
            const stepPips = parseFloat(document.getElementById('trailingStepSize')?.value || 4);
            hint.textContent = `SL moves up by ${stepPips} pips each time price moves +${stepPips} pips`;
            hint.style.color = '#787b86';
            hint.style.fontWeight = '400';
        }
    }
    
    /**
     * Update status details with current progress
     */
    updateTrailingStatusDetails(currentSteps, profitPips, isActivated) {
        const statusDetails = document.getElementById('trailingStatusDetails');
        if (!statusDetails || !this.trailingState) return;
        
        const { stepPips, activationThreshold, entryPrice, orderSide, activateMode } = this.trailingState;
        
        if (!isActivated) {
            // Show waiting for activation message
            const thresholdPips = Math.abs(activationThreshold - entryPrice) / this.pipSize;
            const remainingPips = thresholdPips - Math.abs(profitPips);
            
            if (activateMode === 'trail-rr') {
                const rr = parseFloat(document.getElementById('trailingActivateRR')?.value || 1);
                statusDetails.textContent = `Reach ${rr}:1 R:R (${Math.ceil(remainingPips)} pips) to activate`;
            } else {
                statusDetails.textContent = `+${Math.ceil(remainingPips)} pips to activate`;
            }
        } else {
            // Show step progress
            const nextStepPips = (currentSteps + 1) * stepPips;
            const pipsToNext = nextStepPips - profitPips;
            
            if (currentSteps > 0) {
                statusDetails.textContent = `Step ${currentSteps} reached | Next: +${Math.ceil(pipsToNext)} pips`;
            } else {
                statusDetails.textContent = `Activated! Next step: +${Math.ceil(pipsToNext)} pips`;
            }
        }
    }
    
    /**
     * Stop trailing SL system
     */
    stopTrailingSL() {
        this.stopPriceMonitoring();
        this.trailingState = {
            isActive: false,
            highestProfit: 0,
            currentSL: null,
            activationThreshold: null,
            trailDistance: 0,
            lastUpdate: null
        };
        this.updateTrailingIndicator(false);
    }
    
    /**
     * Reset trailing when entry or SL changes
     */
    resetTrailingOnPriceChange() {
        if (this.trailingState.isActive) {
            console.log('🔄 Resetting trailing due to price change');
            this.stopTrailingSL();
            
            // Re-initialize if still enabled
            const trailingEnabled = document.getElementById('trailingSLToggle')?.checked;
            if (trailingEnabled) {
                this.initializeTrailingSL();
            }
        }
    }
    
    /**
     * Check and warn if both BE systems are enabled
     * Call this when either Auto BE or Trailing Stop toggle changes
     */
    checkBESystemConflict() {
        const autoBeEnabled = document.getElementById('autoBreakevenToggle')?.checked || false;
        const trailingEnabled = document.getElementById('trailingSLToggle')?.checked || false;
        
        const warningBox = document.getElementById('beSystemWarning');
        
        if (autoBeEnabled && trailingEnabled) {
            // Both enabled - show warning
            console.warn(`⚠️ Both Auto Breakeven AND Trailing Stop are enabled!`);
            console.warn(`💡 Only the one that reaches its target FIRST will activate.`);
            console.warn(`💡 For predictable behavior, enable only ONE at a time.`);
            
            if (warningBox) {
                warningBox.style.display = 'block';
                warningBox.innerHTML = `
                    <div style="background: rgba(255, 165, 0, 0.1); border: 1px solid rgba(255, 165, 0, 0.3); border-radius: 4px; padding: 8px; margin-top: 8px;">
                        <div style="color: #ffa500; font-size: 11px; font-weight: 600; margin-bottom: 4px;">
                            ⚠️ Conflicting Breakeven Systems
                        </div>
                        <div style="color: rgba(255, 255, 255, 0.7); font-size: 10px; line-height: 1.4;">
                            Both Auto BE and Trailing Stop are enabled. Only the one that triggers FIRST will activate.
                            <br><strong>Tip:</strong> Enable only ONE for predictable behavior.
                        </div>
                    </div>
                `;
            }
            
            return true; // Conflict exists
        } else {
            // No conflict - hide warning
            if (warningBox) {
                warningBox.style.display = 'none';
                warningBox.innerHTML = '';
            }
            return false; // No conflict
        }
    }
    
    /**
     * ═══════════════════════════════════════════════════════════════
     * POSITION SCALING SYSTEM
     * ═══════════════════════════════════════════════════════════════
     * Group multiple entries at same candle/time into one scaled trade
     * Like scaling into a position: 3 entries = 1 trade with avg entry
     */
    
    // ═══════════════════════════════════════════════════════════════════════════
    // POSITION SCALING SYSTEM - Clean Implementation
    // ═══════════════════════════════════════════════════════════════════════════
    
    /**
     * Apply scaling to an order - call this when order becomes active
     * Works for both market orders and executed pending orders
     * 
     * @param {Object} order - The order to potentially scale
     * @returns {Object|null} - Scaled trade group if scaling occurred, null otherwise
     */
    applyScaling(order) {
        console.log(`\n📊 ═══ SCALING: Order #${order.id} ═══`);
        
        // Safety check
        if (!order || !order.id) {
            console.log('   ❌ Invalid order');
            return null;
        }
        
        // Find existing open position with same direction (excluding this order)
        const existingPositions = this.openPositions.filter(pos => 
            pos.id !== order.id && 
            pos.type === order.type && 
            pos.status === 'OPEN'
        );
        
        console.log(`   Direction: ${order.type}`);
        console.log(`   Existing ${order.type} positions: ${existingPositions.length}`);
        
        if (existingPositions.length === 0) {
            // No existing position - this order becomes first in a potential group
            const groupId = this.tradeGroupIdCounter++;
            order.tradeGroupId = groupId;
            
            this.scaledTrades.set(groupId, {
                groupId: groupId,
                entries: [order],
                side: order.type,
                openTime: order.openTime,
                totalQuantity: order.quantity,
                avgEntry: order.openPrice,
                status: 'OPEN'
            });
            
            console.log(`   ✅ Created new group #${groupId} (first entry)`);
            return null; // First entry, no scaling yet
        }
        
        // Found existing position - group together
        const existingPos = existingPositions[0];
        const groupId = existingPos.tradeGroupId || this.tradeGroupIdCounter++;
        
        // Set group ID on new order
        order.tradeGroupId = groupId;
        
        // Get or create the group
        let group = this.scaledTrades.get(groupId);
        if (!group) {
            // Existing position didn't have a group - create one with it
            existingPos.tradeGroupId = groupId;
            group = {
                groupId: groupId,
                entries: [existingPos],
                side: existingPos.type,
                openTime: existingPos.openTime,
                totalQuantity: existingPos.quantity,
                avgEntry: existingPos.openPrice,
                status: 'OPEN'
            };
            this.scaledTrades.set(groupId, group);
        }
        
        // Add new order to group
        group.entries.push(order);
        
        // Recalculate weighted average
        let totalCost = 0, totalQty = 0;
        group.entries.forEach(e => {
            totalCost += e.openPrice * e.quantity;
            totalQty += e.quantity;
        });
        group.totalQuantity = totalQty;
        group.avgEntry = totalCost / totalQty;
        
        // ═══ COPY TP TARGETS FROM EXISTING POSITION ═══
        // So scaled positions get their own partial close markers like split entries
        if (existingPos.tpTargets && existingPos.tpTargets.length > 0 && !order.tpTargets) {
            // Deep clone the TP targets for this new position
            order.tpTargets = existingPos.tpTargets.map(tp => ({
                id: tp.id,
                price: tp.price,
                percentage: tp.percentage,
                hit: false // Reset hit status for new position
            }));
            console.log(`   📊 Copied ${order.tpTargets.length} TP targets from existing position`);
        }
        
        // Copy SL if new order doesn't have one
        if (existingPos.stopLoss && !order.stopLoss) {
            order.stopLoss = existingPos.stopLoss;
            console.log(`   🛑 Copied SL from existing position: ${order.stopLoss.toFixed(5)}`);
        }
        
        // Copy single TP if new order doesn't have one (for non-multiple TP setups)
        if (existingPos.takeProfit && !order.takeProfit && !order.tpTargets) {
            order.takeProfit = existingPos.takeProfit;
            console.log(`   🎯 Copied TP from existing position: ${order.takeProfit.toFixed(5)}`);
        }
        
        // Copy other relevant settings
        if (existingPos.riskAmount && !order.riskAmount) {
            order.riskAmount = existingPos.riskAmount;
        }
        if (existingPos.originalRiskAmount && !order.originalRiskAmount) {
            order.originalRiskAmount = existingPos.originalRiskAmount;
        }
        
        // Draw SL/TP lines for the new scaled position if it inherited them
        if ((order.stopLoss || order.takeProfit || order.tpTargets) && !order._slTPLinesDrawn) {
            console.log(`   📈 Drawing SL/TP lines for scaled position #${order.id}`);
            this.drawSLTPLines(order);
            order._slTPLinesDrawn = true;
        }
        
        console.log(`   ✅ SCALED with position #${existingPos.id}`);
        console.log(`   Group #${groupId}: ${group.entries.length} entries`);
        console.log(`   Total Qty: ${totalQty.toFixed(2)} lots`);
        console.log(`   Avg Entry: ${group.avgEntry.toFixed(5)}`);
        
        return group;
    }
    
    /**
     * Check if a closed position completes a scaled group
     * If all entries closed, marks group as CLOSED and returns true
     * 
     * @param {Object} position - The position that just closed
     * @returns {boolean} - True if this was the last entry and group is now complete
     */
    checkScaledGroupComplete(position) {
        if (!position.tradeGroupId) {
            return false; // Not part of a group
        }
        
        const group = this.scaledTrades.get(position.tradeGroupId);
        if (!group) {
            return false;
        }
        
        // Check if ALL entries in the group are now closed
        const allClosed = group.entries.every(entry => entry.status === 'CLOSED');
        
        if (allClosed) {
            group.status = 'CLOSED';
            
            // Calculate total P&L
            group.totalPnL = group.entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
            
            console.log(`\n📊 ═══ SCALED GROUP #${group.groupId} COMPLETE ═══`);
            console.log(`   Entries: ${group.entries.length}`);
            console.log(`   Total P&L: $${group.totalPnL.toFixed(2)}`);
            
            return true;
        }
        
        console.log(`📊 Position #${position.id} closed, but group #${group.groupId} still has open entries`);
        return false;
    }
    
    /**
     * Get scaled trade info for a position
     */
    getScaledTradeInfo(order) {
        if (!order.tradeGroupId) return null;
        return this.scaledTrades.get(order.tradeGroupId);
    }
    
    /**
     * Legacy function name - redirects to checkScaledGroupComplete
     */
    closeScaledPosition(groupId) {
        const group = this.scaledTrades.get(groupId);
        if (!group) return;
        
        const allClosed = group.entries.every(e => e.status === 'CLOSED');
        if (allClosed) {
            group.status = 'CLOSED';
            group.totalPnL = group.entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
        }
    }
    
    /**
     * DEBUG: Check scaling state
     */
    debugScaling() {
        console.log('═══════════════════════════════════════');
        console.log('📊 SCALING DEBUG');
        console.log('═══════════════════════════════════════');
        console.log('enablePositionScaling:', this.enablePositionScaling);
        console.log('scaleNextOrder:', this.scaleNextOrder);
        console.log('');
        console.log('Open Positions:', this.openPositions.length);
        this.openPositions.forEach(p => {
            console.log(`  #${p.id} ${p.type} ${p.status} qty:${p.quantity} groupId:${p.tradeGroupId || 'NONE'}`);
        });
        console.log('');
        console.log('Scaled Trade Groups:', this.scaledTrades.size);
        this.scaledTrades.forEach((trade, groupId) => {
            console.log(`  Group #${groupId}:`);
            console.log(`    Status: ${trade.status}`);
            console.log(`    Entries: ${trade.entries.length}`);
            trade.entries.forEach((e, i) => {
                console.log(`      [${i}] #${e.id} ${e.type} ${e.status} qty:${e.quantity}`);
            });
            console.log(`    Total Qty: ${trade.totalQuantity}`);
            console.log(`    Avg Entry: ${trade.avgEntry?.toFixed(5) || 'N/A'}`);
        });
        console.log('');
        console.log('Last 3 Journal Entries:');
        const last3 = this.tradeJournal.slice(-3);
        last3.forEach(t => {
            console.log(`  #${t.id} ${t.direction} qty:${t.quantity} entries:${t.numberOfEntries || 1} pnl:$${t.pnl?.toFixed(2) || 'N/A'}`);
        });
        console.log('═══════════════════════════════════════');
    }
    
    /**
     * Toggle position scaling on/off
     */
    togglePositionScaling(enabled) {
        this.enablePositionScaling = enabled;
        localStorage.setItem('enablePositionScaling', enabled);
        console.log(`📊 Position Scaling: ${enabled ? 'ENABLED ✓' : 'DISABLED ✗'}`);
        
        if (!enabled) {
            this.scaledTrades.clear();
            this.tradeGroupIdCounter = 1;
        }
    }
    
    /**
     * Get all scaled trades for display
     */
    getScaledTrades(includeOpenOnly = false) {
        const trades = Array.from(this.scaledTrades.values());
        if (includeOpenOnly) {
            return trades.filter(t => t.status === 'OPEN');
        }
        return trades;
    }
    
    /**
     * Create aggregate journal entry for a scaled trade group
     */
    createAggregateJournalEntry(scaledInfo, exitScreenshot = null) {
        const totalPnL = scaledInfo.totalPnL || scaledInfo.entries.reduce((sum, e) => sum + (e.pnl || 0), 0);
        const totalRisk = scaledInfo.entries.reduce((sum, e) => sum + (e.riskAmount || 0), 0);
        const avgEntry = scaledInfo.avgEntry;
        const totalQty = scaledInfo.totalQuantity;
        
        // Use first entry's data for metadata
        const firstEntry = scaledInfo.entries[0];
        const lastEntry = scaledInfo.entries[scaledInfo.entries.length - 1];
        const firstOpenDate = new Date(firstEntry.openTime);
        const lastCloseDate = new Date(lastEntry.closeTime);
        const totalHoldingMs = lastEntry.closeTime - firstEntry.openTime;
        const totalHoldingHours = (totalHoldingMs / (1000 * 60 * 60)).toFixed(2);
        
        // Calculate aggregate MFE/MAE
        const bestMFE = Math.max(...scaledInfo.entries.map(e => e.mfe || e.openPrice));
        const worstMAE = Math.min(...scaledInfo.entries.map(e => e.mae || e.openPrice));
        
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        return {
            id: scaledInfo.groupId,
            tradeId: scaledInfo.groupId,
            type: scaledInfo.side,
            direction: scaledInfo.side,
            symbol: firstEntry.symbol || 'USD',
            quantity: totalQty,
            openPrice: avgEntry,
            closePrice: lastEntry.closePrice,
            entryPrice: avgEntry,
            exitPrice: lastEntry.closePrice,
            openTime: firstEntry.openTime,
            closeTime: lastEntry.closeTime,
            entryDate: firstOpenDate.toISOString(),
            exitDate: lastCloseDate.toISOString(),
            pnl: totalPnL,
            netPnL: totalPnL,
            realizedPnL: totalPnL,
            stopLoss: firstEntry.stopLoss,
            takeProfit: firstEntry.takeProfit,
            closeType: lastEntry.closeType || 'MANUAL',
            status: 'closed',
            // Entry screenshots - collect from ALL entries
            entryScreenshot: firstEntry.entryScreenshot || null, // Primary for backward compatibility
            entryScreenshots: scaledInfo.entries
                .filter(e => e.entryScreenshot)
                .map(e => ({
                    orderId: e.id,
                    screenshot: e.entryScreenshot,
                    openPrice: e.openPrice,
                    openTime: e.openTime
                })),
            exitScreenshot: exitScreenshot,
            mfe: bestMFE,
            mae: worstMAE,
            mfeTime: firstEntry.mfeTime,
            maeTime: firstEntry.maeTime,
            highestPrice: Math.max(...scaledInfo.entries.map(e => e.highestPrice || e.openPrice)),
            lowestPrice: Math.min(...scaledInfo.entries.map(e => e.lowestPrice || e.openPrice)),
            rMultiple: totalRisk > 0 ? (totalPnL / totalRisk).toFixed(2) : '0.00',
            riskAmount: totalRisk,
            riskPerTrade: totalRisk,
            rewardToRiskRatio: totalRisk > 0 ? ((totalPnL / totalRisk)).toFixed(2) : '0.00',
            holdingTimeHours: parseFloat(totalHoldingHours),
            holdingTimeMs: totalHoldingMs,
            holdingTimeDays: (totalHoldingMs / (1000 * 60 * 60 * 24)).toFixed(2),
            dayOfWeek: dayNames[firstOpenDate.getDay()],
            hourOfEntry: firstOpenDate.getHours(),
            hourOfExit: lastCloseDate.getHours(),
            month: monthNames[firstOpenDate.getMonth()],
            year: firstOpenDate.getFullYear(),
            preTradeNotes: firstEntry.preTradeNotes || null,
            postTradeNotes: null,
            tags: [],
            rulesFollowed: null,
            savedAt: Date.now(),
            // SCALED TRADE SPECIFIC DATA
            isScaledTrade: true,
            scaledEntries: scaledInfo.entries.map(e => ({
                id: e.id,
                quantity: e.quantity,
                openPrice: e.openPrice,
                closePrice: e.closePrice,
                pnl: e.pnl,
                openTime: e.openTime,
                closeTime: e.closeTime,
                entryScreenshot: e.entryScreenshot || null
            })),
            scaledGroupId: scaledInfo.groupId,
            numberOfEntries: scaledInfo.entries.length
        };
    }
}

// Export for use in main chart
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrderManager;
}
