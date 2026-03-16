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
    }

    getState() {
        return {
            orders: this.orders,
            openPositions: this.openPositions,
            closedPositions: this.closedPositions,
            pendingOrders: this.pendingOrders,
            balance: this.balance,
            equity: this.equity
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
        this.pendingOrders.push(order);
        this.orders.push(order);
        this.emit('order:pending', order);
        return order;
    }

    registerOpenOrder(order) {
        if (!order) return order;
        this.openPositions.push(order);
        this.orders.push(order);
        this.emit('order:opened', order);
        return order;
    }

    registerClosedPosition(position) {
        if (!position) return position;
        this.closedPositions.push(position);
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
