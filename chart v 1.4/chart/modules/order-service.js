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

        this.contractSize = 10000;

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
            free_margin: this.balance * 30,
            total_buying_power: this.balance * 30,
            per_instrument_stats: {},
            post_exit_trades: [],
            archived_trades: [],
            equity_curve: []
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

    loadSessionState(session) {
        if (!session) return;
        if (session.startBalance) {
            const startBalance = parseFloat(session.startBalance);
            if (Number.isFinite(startBalance)) {
                this.balance = startBalance;
                this.initialBalance = startBalance;
                this.equity = startBalance;
            }
        }
        const leverageFromSession = Number.parseFloat(session.leverageNumber || session.leverage || 30);
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
        this.recomputeSharedMarginState();
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
        const map = this.multiInstrumentSession.instruments;
        if (normKey && map[normKey]) {
            return map[normKey];
        }
        if (rawKey && map[rawKey]) {
            return map[rawKey];
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
        const leverage = Number.parseFloat(this.multiInstrumentSession.leverage) || 30;
        const instrument = this.getInstrumentSettings(order.ticker || order.symbol, {
            contractSize: this.contractSize
        });
        const qty = Math.abs(Number.parseFloat(order.quantity) || 0);
        const contractSize = Number.parseFloat(instrument.contract_size || instrument.contractSize || this.contractSize || 100000);
        const notional = qty * contractSize;
        return leverage > 0 ? notional / leverage : notional;
    }

    recomputeSharedMarginState() {
        // Milestone 8.5: do NOT reduce margin for hedged long/short pairs in v1.
        // Every open position consumes full margin independently.
        const usedMargin = this.openPositions.reduce((sum, position) => sum + this.estimateTradeMargin(position), 0);
        this.multiInstrumentSession.used_margin = usedMargin;
        this.multiInstrumentSession.current_time = Date.now();
        this.multiInstrumentSession.total_buying_power = this.balance * (Number.parseFloat(this.multiInstrumentSession.leverage) || 30);
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
