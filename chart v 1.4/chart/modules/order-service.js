function _orderMcRestoreDedupeV1Enabled() {
    return typeof window === 'undefined' || !window.__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1;
}

class OrderService {
    constructor({ chart, replaySystem, eventBus }) {
        this.chart = chart;
        this.replaySystem = replaySystem;
        this.eventBus = eventBus;

        this.orders = [];
        this.openPositions = [];
        this.closedPositions = [];
        this.pendingOrders = [];
        this.orderIdCounter = 1;

        this.balance = 10000;
        this.initialBalance = 10000;
        this.equity = 10000;

        this.contractSize = 100000; // standard FX lot; per-instrument overrides via session/registry

        this.positionSizeMode = 'risk-usd';
        this.breakevenMode = 'rr';
        this.mfeMaeTrackingHours = 4;

        this.tradeJournal = [];
        this.mfeMaeTrackingPositions = [];

        this.orderSide = 'BUY';
        this.orderType = 'market';
        this.symbolPrecision = 5;

        this.listeners = [];
        this.multiInstrumentSession = this.createDefaultMultiInstrumentSession();
    }

    createDefaultMultiInstrumentSession() {
        const now = Date.now();
        return {
            session_id: null,
            account_currency: 'USD',
            leverage: 30,
            margin_call_level: 100,
            stop_out_level: 50,
            max_risk_per_trade_pct: null,
            instruments: {},
            current_time: now,
            session_time: now,
            used_margin: 0,
            free_margin: this.balance,
            total_buying_power: this.balance * 30,
            per_instrument_stats: {},
            post_exit_trades: [],
            archived_trades: [],
            equity_curve: [],
            futuresMargins: {},
            costLeverageByAsset: {}
        };
    }

    getState() {
        return {
            orders: this.orders,
            openPositions: this.openPositions,
            closedPositions: this.closedPositions,
            pendingOrders: this.pendingOrders,
            balance: this.balance,
            equity: this.equity,
            multiInstrumentSession: this.multiInstrumentSession
        };
    }

    _parseSessionLeverage(session) {
        if (!session || typeof session !== 'object') return 30;
        const fromNumber = Number.parseFloat(session.leverageNumber);
        if (Number.isFinite(fromNumber) && fromNumber > 0) return fromNumber;
        const text = String(session.leverage || '');
        const match = text.match(/(\d+)\s*:\s*(\d+)/);
        if (match) {
            const lev = Number.parseFloat(match[2]);
            if (Number.isFinite(lev) && lev > 0) return lev;
        }
        const direct = Number.parseFloat(text);
        return Number.isFinite(direct) && direct > 0 ? direct : 30;
    }

    loadSessionState(session) {
        if (!session) return;
        const raw = session.startBalance ?? session.balance;
        if (raw !== undefined && raw !== null && raw !== '') {
            const startBalance = parseFloat(raw);
            if (Number.isFinite(startBalance) && startBalance > 0) {
                this.initialBalance = startBalance;
                // Current balance/equity are owned by OrderManager.recomputeAccountFromJournal().
            }
        }
        const leverageFromSession = this._parseSessionLeverage(session);
        if (Number.isFinite(leverageFromSession) && leverageFromSession > 0) {
            this.multiInstrumentSession.leverage = leverageFromSession;
        }
        if (session.session_id || session.sessionId) {
            this.multiInstrumentSession.session_id = session.session_id || session.sessionId;
        }
        if (session.account_currency) {
            this.multiInstrumentSession.account_currency = String(session.account_currency).toUpperCase();
        }
        if (Number.isFinite(Number.parseFloat(session.margin_call_level))) {
            this.multiInstrumentSession.margin_call_level = Number.parseFloat(session.margin_call_level);
        }
        if (Number.isFinite(Number.parseFloat(session.stop_out_level))) {
            this.multiInstrumentSession.stop_out_level = Number.parseFloat(session.stop_out_level);
        }
        if (session.max_risk_per_trade_pct !== undefined && session.max_risk_per_trade_pct !== null && session.max_risk_per_trade_pct !== '') {
            const maxRisk = Number.parseFloat(session.max_risk_per_trade_pct);
            this.multiInstrumentSession.max_risk_per_trade_pct = Number.isFinite(maxRisk) ? maxRisk : null;
        }
        this.setSessionInstruments(session.instruments || session.symbols || []);
        // Per-contract futures day/overnight margins + per-asset leverage from session trading costs UI.
        try {
            const tc = session.trading_costs && typeof session.trading_costs === 'object'
                ? session.trading_costs
                : null;
            const fm = tc && tc.futuresMargins && typeof tc.futuresMargins === 'object'
                ? tc.futuresMargins
                : null;
            this.multiInstrumentSession.futuresMargins = fm ? { ...fm } : {};
            const costs = tc && tc.costs && typeof tc.costs === 'object' ? tc.costs : null;
            this.multiInstrumentSession.costLeverageByAsset = costs ? { ...costs } : {};
        } catch (_e) {
            this.multiInstrumentSession.futuresMargins = {};
            this.multiInstrumentSession.costLeverageByAsset = {};
        }
        this.recomputeSharedMarginState();
    }

    /**
     * Parse leverage from number, "1:500", or plain "500".
     * @returns {number|null}
     */
    _parseLeverageValue(raw) {
        if (raw == null || raw === '') return null;
        if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
        const text = String(raw);
        const match = text.match(/(\d+)\s*:\s*(\d+)/);
        if (match) {
            const lev = Number.parseFloat(match[2]);
            return Number.isFinite(lev) && lev > 0 ? lev : null;
        }
        const direct = Number.parseFloat(text);
        return Number.isFinite(direct) && direct > 0 ? direct : null;
    }

    /**
     * Resolve asset-class leverage for a ticker (Forex 1:500, Futures 1:20, …).
     * Prefer trading_costs.costs[asset].leverage, else session leverage.
     */
    _resolveLeverageForTicker(ticker, assetType) {
        let costs = this.multiInstrumentSession?.costLeverageByAsset;
        if (!costs || typeof costs !== 'object' || !Object.keys(costs).length) {
            try {
                const sess = (typeof window !== 'undefined'
                    && (window.backtestingSession || this.chart?.backtestingSession)) || null;
                const fromSess = sess?.trading_costs?.costs;
                if (fromSess && typeof fromSess === 'object') {
                    costs = fromSess;
                    this.multiInstrumentSession.costLeverageByAsset = { ...fromSess };
                }
            } catch (_e) { /* ignore */ }
        }
        let bucket = 'Forex';
        const t = String(assetType || '').toLowerCase();
        if (t === 'futures') bucket = 'Futures';
        else if (t === 'stocks' || t === 'equity' || t === 'equities') bucket = 'Stocks';
        else if (t === 'crypto') bucket = 'Crypto';
        else if (!t && ticker) {
            // Infer from known futures roots when registry type missing.
            if (this._defaultFuturesDayMarginUsd(ticker) != null) bucket = 'Futures';
        }
        if (costs && typeof costs === 'object') {
            const row = costs[bucket];
            const fromCosts = this._parseLeverageValue(row && row.leverage);
            if (fromCosts != null) return fromCosts;
        }
        const sessionLev = this._parseLeverageValue(this.multiInstrumentSession?.leverage);
        if (sessionLev != null) return sessionLev;
        // Retail-style defaults by asset class when session has no leverage.
        if (bucket === 'Futures') return 20;
        if (bucket === 'Stocks') return 5;
        if (bucket === 'Crypto') return 20;
        return 100;
    }

    /**
     * Resolve session futuresMargins row for a ticker (e.g. NQ_continuous → NQ).
     * @returns {{ dayMargin: number|null, overnightMargin: number|null }|null}
     */
    _lookupFuturesMarginRow(ticker) {
        let map = this.multiInstrumentSession?.futuresMargins;
        if (!map || typeof map !== 'object' || !Object.keys(map).length) {
            try {
                const sess = (typeof window !== 'undefined'
                    && (window.backtestingSession || this.chart?.backtestingSession)) || null;
                const fm = sess?.trading_costs?.futuresMargins;
                if (fm && typeof fm === 'object' && Object.keys(fm).length) {
                    map = fm;
                    // Cache for subsequent margin checks in this session.
                    this.multiInstrumentSession.futuresMargins = { ...fm };
                }
            } catch (_e) {
                map = null;
            }
        }
        if (!map || typeof map !== 'object') return null;
        return this._lookupFuturesMarginRowFromMap(map, ticker);
    }

    _lookupFuturesMarginRowFromMap(map, ticker) {
        if (!map || !ticker) return null;
        const mce = typeof window !== 'undefined' ? window.marketCalcEngine : null;
        const resolve = mce && typeof mce._resolveRegistryKey === 'function'
            ? (s) => mce._resolveRegistryKey(s)
            : (s) => String(s || '').replace(/[/\-_\s]/g, '').toUpperCase();
        const candidates = [
            resolve(ticker),
            String(ticker || '').toUpperCase(),
            String(ticker || '').replace(/[/\-_\s]/g, '').toUpperCase(),
        ];
        // Also try bare segments (NQ from NQ_continuous_1min).
        String(ticker || '').split(/[/\-_.\s]+/).forEach((seg) => {
            const u = String(seg || '').toUpperCase();
            if (u.length >= 2) candidates.push(u);
        });
        for (const key of candidates) {
            if (!key || !map[key]) continue;
            const row = map[key];
            if (!row || typeof row !== 'object') continue;
            const day = Number.parseFloat(row.dayMargin ?? row.day_margin);
            const overnight = Number.parseFloat(row.overnightMargin ?? row.overnight_margin);
            return {
                dayMargin: Number.isFinite(day) && day > 0 ? day : null,
                overnightMargin: Number.isFinite(overnight) && overnight > 0 ? overnight : null,
            };
        }
        return null;
    }

    /**
     * Built-in day margins (USD/contract) matching BacktestNewSessionModal defaults.
     * Used when the session has no futuresMargins row (e.g. trading costs off).
     */
    _defaultFuturesDayMarginUsd(ticker) {
        const defaults = {
            NQ: 1000, MNQ: 100,
            ES: 500, MES: 50,
            YM: 500, MYM: 50,
            RTY: 500, M2K: 50,
            CL: 1000, MCL: 100,
            GC: 1500, MGC: 150,
            SI: 2000, NG: 500,
        };
        const mce = typeof window !== 'undefined' ? window.marketCalcEngine : null;
        const resolve = mce && typeof mce._resolveRegistryKey === 'function'
            ? (s) => mce._resolveRegistryKey(s)
            : (s) => String(s || '').replace(/[/\-_\s]/g, '').toUpperCase();
        const key = resolve(ticker);
        if (key && defaults[key] != null) return defaults[key];
        // Bare root (NQ from NQ_continuous_…)
        const segs = String(ticker || '').split(/[/\-_.\s]+/);
        for (const seg of segs) {
            const u = String(seg || '').toUpperCase();
            if (defaults[u] != null) return defaults[u];
        }
        return null;
    }

    /**
     * Per-contract futures margin from session config (day margin preferred for replay).
     * @returns {number|null} USD per contract, or null if not configured
     */
    _futuresPerContractMarginUsd(ticker) {
        const row = this._lookupFuturesMarginRow(ticker);
        if (row) {
            // Intraday/replay sessions use day margin; overnight is the exchange-style hold margin.
            if (row.dayMargin != null) return row.dayMargin;
            if (row.overnightMargin != null) return row.overnightMargin;
        }
        return this._defaultFuturesDayMarginUsd(ticker);
    }

    setSessionInstruments(instrumentsInput = []) {
        const normalized = {};
        if (Array.isArray(instrumentsInput)) {
            instrumentsInput.forEach((row) => {
                if (!row) return;
                const ticker = String(row.ticker || row.symbol || row.symbolName || '').toUpperCase();
                if (!ticker) return;
                normalized[ticker] = { ...row, ticker };
            });
        } else if (instrumentsInput && typeof instrumentsInput === 'object') {
            Object.keys(instrumentsInput).forEach((key) => {
                const raw = instrumentsInput[key];
                if (!raw) return;
                const ticker = String(raw.ticker || key).toUpperCase();
                normalized[ticker] = { ...raw, ticker };
            });
        }
        this.multiInstrumentSession.instruments = normalized;
    }

    getInstrumentSettings(ticker, fallback = {}) {
        const rawKey = String(ticker || '').toUpperCase();
        const normKey = rawKey.replace(/\//g, '');
        const session = this.multiInstrumentSession;
        const map = session && session.instruments && typeof session.instruments === 'object'
            ? session.instruments
            : null;
        if (map) {
            if (normKey && map[normKey]) {
                return map[normKey];
            }
            if (rawKey && map[rawKey]) {
                return map[rawKey];
            }
        }
        return {
            ticker: normKey || rawKey || 'UNKNOWN',
            contract_size: fallback.contractSize || 100000,
            pip_size: fallback.pipSize || 0.0001,
            pip_value_per_lot: fallback.pipValuePerLot || 10,
            commission_per_lot_per_side: fallback.commissionPerLotPerSide || 0,
            spread_pips: fallback.spreadPips || 0
        };
    }

    estimateTradeMargin(order) {
        if (!order) return 0;
        const ticker = String(order.ticker || order.symbol || '').toUpperCase();
        const instrument = this.getInstrumentSettings(ticker, {
            contractSize: this.contractSize
        });
        const qty = Math.abs(Number.parseFloat(order.quantity) || 0);
        if (!(qty > 0)) return 0;

        let entry = Number.parseFloat(order.entryPrice ?? order.entry_price ?? order.current_price ?? 0);
        if (!(entry > 0) && typeof document !== 'undefined') {
            entry = Number.parseFloat(document.getElementById('orderEntryPrice')?.value || 0);
        }

        const mce = typeof window !== 'undefined' ? window.marketCalcEngine : null;
        let assetType = '';
        let registryKey = '';
        let registryContractSize = null;
        if (mce && ticker) {
            try {
                const resolve =
                    typeof mce._resolveRegistryKey === 'function'
                        ? mce._resolveRegistryKey.bind(mce)
                        : (s) => String(s || '').replace(/[/\-_\s]/g, '').toUpperCase();
                registryKey = resolve(ticker);
                const specs = mce._registry && mce._registry[registryKey];
                if (specs && specs.type) assetType = String(specs.type);
                if (specs && Number.isFinite(Number.parseFloat(specs.contractSize))) {
                    registryContractSize = Number.parseFloat(specs.contractSize);
                }
            } catch (_e) {
                assetType = '';
            }
        }

        const isFutures = assetType === 'futures'
            || (assetType === '' && this._defaultFuturesDayMarginUsd(ticker) != null);

        // Futures: exchange-style initial margin per contract (day margin from session UI).
        if (isFutures) {
            const perContract = this._futuresPerContractMarginUsd(ticker);
            if (perContract != null && Number.isFinite(perContract) && perContract > 0) {
                return perContract * qty;
            }
        }

        const leverage = this._resolveLeverageForTicker(ticker, assetType || (isFutures ? 'futures' : 'forex'));

        // Prefer market-calc engine (quote-type-aware FX, crypto, stocks, futures fallback).
        if (mce && typeof mce.calcMargin === 'function' && registryKey) {
            try {
                const fallbackType = assetType || (isFutures ? 'futures' : 'forex');
                const mm = mce.calcMargin(entry, qty, registryKey, fallbackType, leverage);
                if (Number.isFinite(mm) && mm > 0) return mm;
            } catch (_e) { /* fall through */ }
        }

        // Manual fallbacks matching retail notional / leverage when engine unavailable.
        const contractSize = Number.parseFloat(
            instrument.contract_size
            || instrument.contractSize
            || registryContractSize
            || this.contractSize
            || 100000
        );
        if (!(contractSize > 0) || !(leverage > 0)) return 0;

        if (assetType === 'crypto' || assetType === 'stocks') {
            if (!(entry > 0)) return 0;
            return (entry * qty * (assetType === 'stocks' ? 1 : contractSize)) / leverage;
        }

        // FX: if we only know it's USD-base from instrument/registry name heuristics, skip price.
        const norm = registryKey || ticker.replace(/[/\-_\s]/g, '');
        const usdBase = /^(USD)[A-Z]{3}$/.test(norm) || /^(USDJPY|USDCAD|USDCHF|USDCNH|USDHKD)$/.test(norm);
        if (usdBase) {
            return (qty * contractSize) / leverage;
        }
        if (!(entry > 0)) {
            // Without a mark price, use base notional (conservative for USD-quoted majors ~parity).
            return (qty * contractSize) / leverage;
        }
        return (entry * qty * contractSize) / leverage;
    }

    recomputeSharedMarginState() {
        // Milestone 8.5: do NOT reduce margin for hedged long/short pairs in v1.
        // Every open position consumes full margin independently.
        const usedMargin = this.openPositions.reduce((sum, position) => sum + this.estimateTradeMargin(position), 0);
        this.multiInstrumentSession.used_margin = usedMargin;
        this.multiInstrumentSession.current_time = Date.now();
        const levForBuyingPower = this._parseLeverageValue(this.multiInstrumentSession.leverage) || 100;
        this.multiInstrumentSession.total_buying_power = this.balance * levForBuyingPower;
        this.multiInstrumentSession.free_margin = this.equity - usedMargin;
        if (!Array.isArray(this.multiInstrumentSession.equity_curve)) {
            this.multiInstrumentSession.equity_curve = [];
        }
        this.emit('account:margin-updated', {
            used_margin: this.multiInstrumentSession.used_margin,
            free_margin: this.multiInstrumentSession.free_margin,
            total_buying_power: this.multiInstrumentSession.total_buying_power
        });
    }

    setSymbolPrecision(precision) {
        if (Number.isInteger(precision) && precision > 0) {
            this.symbolPrecision = precision;
        }
    }

    addJournalEntries(entries = []) {
        if (!Array.isArray(entries)) return;
        this.tradeJournal = entries.slice();
        this.emit('journal:updated', this.tradeJournal);
    }

    setMfeMaeTrackingHours(hours) {
        if (!Number.isFinite(hours) || hours <= 0) return;
        this.mfeMaeTrackingHours = hours;
        this.emit('settings:mfe-mae', hours);
    }

    setRiskMode(mode) {
        if (!['risk-usd', 'risk-percent'].includes(mode)) return;
        this.positionSizeMode = mode;
        this.emit('settings:risk-mode', mode);
    }

    setBreakevenMode(mode) {
        if (!['rr', 'amount'].includes(mode)) return;
        this.breakevenMode = mode;
        this.emit('settings:breakeven-mode', mode);
    }

    formatPrice(value, precision = this.symbolPrecision) {
        const numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric)) {
            return (0).toFixed(precision);
        }
        return numeric.toFixed(precision);
    }

    formatQuantity(value) {
        const numeric = Number.parseFloat(value);
        if (!Number.isFinite(numeric)) {
            return '0';
        }
        const absValue = Math.abs(numeric);
        if (absValue >= 100) return numeric.toFixed(0);
        if (absValue >= 10) return numeric.toFixed(1);
        return Math.round(numeric * 100) % 100 === 0 ? numeric.toFixed(0) : numeric.toFixed(2);
    }

    createOrderId() {
        return this.orderIdCounter++;
    }

    getCurrentCandle() {
        if (!this.replaySystem || !this.replaySystem.chart) return null;
        return this.replaySystem.chart.getCurrentCandle
            ? this.replaySystem.chart.getCurrentCandle()
            : null;
    }

    previewOrder({ side, entryPrice, quantity, stopLoss, takeProfit, riskAmount }) {
        const payload = {
            side,
            entryPrice,
            quantity,
            stopLoss,
            takeProfit,
            riskAmount
        };

        this.emit('order:preview', payload);
        return payload;
    }

    registerPendingOrder(order) {
        if (!order) return order;
        if (_orderMcRestoreDedupeV1Enabled() && order.id != null) {
            const dup = this.pendingOrders.some((o) => o && o.id === order.id);
            if (dup) return this.pendingOrders.find((o) => o && o.id === order.id);
        }
        if (!order.symbol && this.chart && this.chart.currentSymbol) {
            order.symbol = String(this.chart.currentSymbol).replace('/', '').toUpperCase();
        }
        if (!order.ticker && order.symbol) order.ticker = String(order.symbol).toUpperCase();
        if (!order.sourceFileId && this.chart && this.chart.currentFileId != null && String(this.chart.currentFileId) !== '') {
            order.sourceFileId = String(this.chart.currentFileId);
        }
        if (this.chart && this.chart.orderManager && typeof this.chart.orderManager.attachStrategyVariablesToOrder === 'function') {
            this.chart.orderManager.attachStrategyVariablesToOrder(order);
        }
        this.pendingOrders.push(order);
        this.orders.push(order);
        this.emit('order:pending', order);
        return order;
    }

    registerOpenOrder(order) {
        if (!order) return order;
        if (_orderMcRestoreDedupeV1Enabled() && order.id != null) {
            const dup = this.openPositions.some((o) => o && o.id === order.id);
            if (dup) return this.openPositions.find((o) => o && o.id === order.id);
        }
        if (!order.symbol && this.chart && this.chart.currentSymbol) {
            order.symbol = String(this.chart.currentSymbol).replace('/', '').toUpperCase();
        }
        if (!order.ticker && order.symbol) order.ticker = String(order.symbol).toUpperCase();
        if (!order.sourceFileId && this.chart && this.chart.currentFileId != null && String(this.chart.currentFileId) !== '') {
            order.sourceFileId = String(this.chart.currentFileId);
        }
        if (order.ticker && !order.instrument_settings) {
            order.instrument_settings = this.getInstrumentSettings(order.ticker);
        }
        if (!Number.isFinite(Number.parseFloat(order.initialStopLoss)) && Number.isFinite(Number.parseFloat(order.stopLoss))) {
            order.initialStopLoss = Number.parseFloat(order.stopLoss);
        }
        if (!Number.isFinite(Number.parseFloat(order.initialTakeProfit)) && Number.isFinite(Number.parseFloat(order.takeProfit))) {
            order.initialTakeProfit = Number.parseFloat(order.takeProfit);
        }
        if (!Array.isArray(order.bar_close_r)) order.bar_close_r = [];
        if (!Array.isArray(order.bar_high_r)) order.bar_high_r = [];
        if (!Array.isArray(order.bar_low_r)) order.bar_low_r = [];
        if (!Array.isArray(order.post_exit_bar_close_r)) order.post_exit_bar_close_r = [];
        if (!Array.isArray(order.post_exit_bar_high_r)) order.post_exit_bar_high_r = [];
        if (!Array.isArray(order.post_exit_bar_low_r)) order.post_exit_bar_low_r = [];
        if (this.chart && this.chart.orderManager && typeof this.chart.orderManager.attachStrategyVariablesToOrder === 'function') {
            this.chart.orderManager.attachStrategyVariablesToOrder(order);
        }
        this.openPositions.push(order);
        this.orders.push(order);
        this.recomputeSharedMarginState();
        this.emit('order:opened', order);
        return order;
    }

    registerClosedPosition(position) {
        if (!position) return position;
        if (!position.ticker && position.symbol) position.ticker = String(position.symbol).toUpperCase();
        this.closedPositions.push(position);
        this.recomputeSharedMarginState();
        this.emit('order:closed', position);
        return position;
    }

    removePendingOrder(orderId) {
        const index = this.pendingOrders.findIndex(o => o.id === orderId);
        if (index === -1) return null;
        const [order] = this.pendingOrders.splice(index, 1);
        this.emit('order:pending-removed', order);
        return order;
    }

    updateBalances(pnlDelta = 0) {
        if (!Number.isFinite(pnlDelta)) return;
        this.balance += pnlDelta;
        this.equity = this.balance;
        this.recomputeSharedMarginState();
        this.emit('account:updated', { balance: this.balance, equity: this.equity });
    }

    submitOrder(request) {
        if (!request) return null;

        const enriched = {
            ...request,
            id: this.createOrderId(),
            status: request.orderType === 'market' ? 'OPEN' : 'PENDING',
            openTime: request.timestamp || Date.now()
        };

        if (enriched.status === 'OPEN') {
            this.registerOpenOrder(enriched);
        } else {
            this.registerPendingOrder(enriched);
        }

        this.emit('order:submitted', enriched);
        return enriched;
    }

    updatePositions(currentCandle) {
        if (!currentCandle) {
            currentCandle = this.getCurrentCandle();
        }
        if (!currentCandle) return;

        this.emit('order:update-tick', currentCandle);
        // Detailed PnL logic will remain in legacy manager until migration completes.
    }

    closePosition(orderId, closeContext = {}) {
        const positionIndex = this.openPositions.findIndex(p => p.id === orderId);
        if (positionIndex === -1) return null;

        const position = this.openPositions[positionIndex];
        const closed = { ...position, ...closeContext, status: 'CLOSED' };

        this.openPositions.splice(positionIndex, 1);
        this.registerClosedPosition(closed);

        if (Number.isFinite(closed.pnl)) {
            this.updateBalances(closed.pnl);
        }

        return closed;
    }

    emit(eventName, payload) {
        if (!this.eventBus) return;
        this.eventBus.emit(eventName, payload);
    }
}

if (typeof window !== 'undefined') {
    window.OrderService = OrderService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrderService;
}
