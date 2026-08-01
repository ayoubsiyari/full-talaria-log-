import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

const chartOrderManagerPath = path.join(repoRoot, 'chart v 1.4/chart/modules/order-manager.js');
const homeOrderManagerPath = path.join(repoRoot, 'homepage/public/chart/modules/order-manager.js');

function installDom() {
    global.window = {
        __TALARIA_DISABLE_N5_MONEY_PATH_COLLISION_V1: false,
        propFirmTracker: null,
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        location: { href: 'http://local.test/chart?sessionId=n5' },
    };
    global.document = {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        createElement: () => ({
            style: {},
            classList: { add() {}, remove() {}, contains: () => false },
            setAttribute() {},
            appendChild() {},
            addEventListener() {},
            remove() {},
        }),
        addEventListener() {},
        body: { appendChild() {} },
    };
    global.CustomEvent = class {
        constructor(type, init = {}) {
            this.type = type;
            this.detail = init.detail;
        }
    };
    global.requestAnimationFrame = (fn) => {
        if (typeof fn === 'function') fn();
        return 1;
    };
    global.cancelAnimationFrame = () => {};
    global.setTimeout = () => 0;
    global.clearTimeout = () => {};
    global.userStorage = {
        _m: new Map(),
        getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
        setItem(k, v) { this._m.set(k, String(v)); },
        removeItem(k) { this._m.delete(k); },
    };
}

installDom();
const OrderManager = require('./order-manager.js');

function read(file) {
    return fs.readFileSync(file, 'utf8');
}

function makePosition(id) {
    const openPrice = 100 + id;
    return {
        id,
        tradeId: id,
        type: 'BUY',
        direction: 'BUY',
        ticker: 'EURUSD',
        symbol: 'EURUSD',
        quantity: 1,
        originalQuantity: 1,
        openPrice,
        entryPrice: openPrice,
        stopLoss: openPrice - 1,
        takeProfit: openPrice + 2,
        openTime: 1_700_000_000_000 + id * 60_000,
        riskAmount: 100,
        originalRiskAmount: 100,
        balance_at_creation: 100_000,
        tpTargets: [{ id: 'tp1', price: openPrice + 2, percentage: 100, hit: false }],
    };
}

function makeManager({ reenter = false } = {}) {
    const durableQueue = [];
    const hotQueue = [];
    const om = Object.create(OrderManager.prototype);
    Object.assign(om, {
        pendingOrders: [],
        openPositions: [],
        closedPositions: [],
        orders: [],
        tradeJournal: [],
        scaledTrades: new Map(),
        splitTrades: new Map(),
        balance: 100_000,
        initialBalance: 100_000,
        equity: 100_000,
        unrealizedPnL: 0,
        _journalProvenance: 'locally-authored',
        chart: {
            data: [{ t: 1_700_000_000_000 }],
            getActiveTradingSessionId: () => 'n5-session',
            scheduleSessionStateSave: (patch) => hotQueue.push(patch),
            queueCriticalSessionStateSave: (patch) => durableQueue.push(patch),
        },
        orderService: {
            openPositions: [],
            closedPositions: [],
            emit() {},
            addJournalEntries() {},
            recomputeSharedMarginState() {},
        },
        __n5DurableQueue: durableQueue,
        __n5HotQueue: hotQueue,
        __n5Reentered: new Set(),
        __n5ReenterEnabled: reenter,
    });

    const noop = () => {};
    Object.assign(om, {
        getCurrentCandle() { return { t: 1_700_000_500_000, close: 0 }; },
        _evalCandleForPosition(_position, candle) { return candle; },
        _positionTicker(position) { return position.ticker || position.symbol || 'EURUSD'; },
        _getActiveTicker() { return 'EURUSD'; },
        _isPositionForActiveChart() { return true; },
        _collectLayoutCharts() { return [this.chart]; },
        _positionTickerMatchesChartSymbol() { return true; },
        _exitMarkerAnchorTimeMsFromClose(_chart, closeTime) { return closeTime; },
        estimateOpenLegPnLSlice(position, closePrice, quantity) {
            const diff = position.type === 'SELL'
                ? position.openPrice - closePrice
                : closePrice - position.openPrice;
            return diff * quantity * 100;
        },
        _roundTripCommissionForLots() { return 0; },
        _applyRealizedPnLToBalance(pnl) {
            this.balance += pnl;
            this.equity = this.balance;
            if (this.__n5ReenterEnabled && this.__n5ActiveClose && !this.__n5Reentered.has(this.__n5ActiveClose.id)) {
                const active = this.__n5ActiveClose;
                this.__n5Reentered.add(active.id);
                this.closePositionAtPrice(active.id, active.closePrice, active.hitType);
            }
        },
        _freezeInTradeExcursionSnapshot: noop,
        _syncOrderServiceOpenAfterClose(orderId) {
            this.orderService.openPositions = this.openPositions.filter((p) => p.id !== orderId);
            this.orderService.closedPositions = this.closedPositions;
        },
        _m20A1ScheduleRetainedSweep: noop,
        _cancelPendingOrdersInSplitGroup: noop,
        _rebuildSplitTradeGroupFromPositions() { return null; },
        _reconcileSplitGroupEntriesFromPositions: noop,
        _splitGroupHasAnyOpenLeg() { return false; },
        _scheduleSplitGroupSiblingPromotion: noop,
        _ensurePendingTargetsSurvive: noop,
        _journalCloseTypeLabel(_position, hitType) { return hitType || 'MANUAL'; },
        _computePlannedRRAtEntry() { return null; },
        _computeBlendedRR() { return null; },
        _enrichJournalEntryForPersistence: noop,
        _getSessionDefaultTradeSetup() { return null; },
        _m19ExcursionSampleCount() { return 3; },
        buildPerInstrumentStats() { return {}; },
        groupJournalByTicker() {
            return { EURUSD: this.tradeJournal.slice() };
        },
        _m20A1GroupRowsByTicker(rows) {
            return { EURUSD: rows.slice() };
        },
        _m19PersistTrimV1Enabled() { return false; },
        _m19CloneJournalForHotSessionPersist() {
            return this.tradeJournal.slice();
        },
        _m20A1PayloadRefsEnabled() { return false; },
        _hasUnresolvedM20A1Refs() { return { unresolved: 0 }; },
        _buildRuntimeOrderPersistPatch() { return { open_positions: [], pending_orders: [] }; },
        persistRuntimeOrderState: noop,
        drawExitMarker: noop,
        drawPartialCloseMarker: noop,
        removeOrderLine: noop,
        removeSLTPLines: noop,
        removeMultiTPAvgLine: noop,
        removeEntryMarker: noop,
        removeMfeMaeMarkers: noop,
        removeSplitGroupAvgLine: noop,
        _cleanupOrderVisualsAfterClose: noop,
        updatePositionsPanel: noop,
        updateJournalTab: noop,
        showTradeJournalModal: noop,
        showNotification: noop,
        playOrderSound: noop,
        _refreshOpenPositionSlTpAfterPartialTpClose: noop,
        _calculatePositionPnL() { return 0; },
        getMarketConfig() { return { minSize: 0.01 }; },
        _multiTpAllActiveTargetsHit() { return false; },
    });
    return om;
}

function closeOnceWithCollision(om, position, closePrice) {
    om.openPositions.push(position);
    om.orders.push(position);
    om.orderService.openPositions = om.openPositions;
    om.__n5ActiveClose = { id: position.id, closePrice, hitType: 'TP' };
    try {
        om.closePositionAtPrice(position.id, closePrice, 'TP');
        om.closePositionAtPrice(position.id, closePrice, 'TP');
    } finally {
        om.__n5ActiveClose = null;
    }
}

function runDoubleCloseScenario({ disableFix = false } = {}) {
    window.__TALARIA_DISABLE_N5_MONEY_PATH_COLLISION_V1 = disableFix;
    const om = makeManager({ reenter: true });
    const expected = [];
    for (let id = 1; id <= 100; id++) {
        const position = makePosition(id);
        const closePrice = position.openPrice + 1;
        expected.push({
            id,
            entryPrice: position.openPrice,
            exitPrice: closePrice,
            pnl: 100,
        });
        closeOnceWithCollision(om, position, closePrice);
    }
    const expectedPnl = expected.reduce((sum, row) => sum + row.pnl, 0);
    return {
        om,
        expected,
        expectedPnl,
        balanceDelta: om.balance - om.initialBalance,
        rows: om.tradeJournal.map((row) => ({
            id: row.id,
            entryPrice: row.entryPrice,
            exitPrice: row.exitPrice,
            pnl: row.pnl,
        })),
    };
}

test('N5 real close path: 100 double-closes keep exact journal rows, values, and balance', () => {
    const result = runDoubleCloseScenario();
    assert.equal(result.rows.length, 100);
    assert.deepEqual(result.rows, result.expected);
    assert.equal(result.balanceDelta, result.expectedPnl);
    assert.equal(result.om.closedPositions.length, 100);
});

test('N5 mutant-red: disabling product close idempotency over-credits real balance', () => {
    const result = runDoubleCloseScenario({ disableFix: true });
    assert.equal(result.rows.length, 100, 'journal upsert masks the duplicate row symptom');
    assert.notEqual(result.balanceDelta, result.expectedPnl,
        'product mutant must fail exact money values even when row count is masked');
    assert.equal(result.balanceDelta, result.expectedPnl * 2);
});

test('N5 real durable queue: reload-during-save cannot mutate queued rows by reference', () => {
    window.__TALARIA_DISABLE_N5_MONEY_PATH_COLLISION_V1 = false;
    const om = makeManager();
    om.tradeJournal = [
        { id: 1, tradeId: 1, ticker: 'EURUSD', pnl: 25, status: 'closed' },
        { id: 2, tradeId: 2, ticker: 'EURUSD', pnl: -5, status: 'closed' },
    ];

    om.persistJournal();
    assert.equal(om.__n5DurableQueue.length, 1);
    const queued = om.__n5DurableQueue[0];

    om.tradeJournal[0].pnl = 9999;
    om.tradeJournal.push({ id: 3, tradeId: 3, ticker: 'EURUSD', pnl: 42, status: 'closed' });

    assert.deepEqual(queued.journal.map((row) => ({ id: row.id, pnl: row.pnl })), [
        { id: 1, pnl: 25 },
        { id: 2, pnl: -5 },
    ]);
    assert.deepEqual(queued.journal_by_ticker.EURUSD.map((row) => ({ id: row.id, pnl: row.pnl })), [
        { id: 1, pnl: 25 },
        { id: 2, pnl: -5 },
    ]);
});

test('N5 mutant-red: disabling durable snapshot lets queued rows mutate by reference', () => {
    window.__TALARIA_DISABLE_N5_MONEY_PATH_COLLISION_V1 = true;
    const om = makeManager();
    om.tradeJournal = [
        { id: 1, tradeId: 1, ticker: 'EURUSD', pnl: 25, status: 'closed' },
    ];

    om.persistJournal();
    const queued = om.__n5DurableQueue[0];
    om.tradeJournal[0].pnl = 9999;

    assert.equal(queued.journal[0].pnl, 9999,
        'product mutant must expose queued durable rows mutating after save time');
});

test('N5 mirrors stay byte-identical for order-manager', () => {
    assert.equal(read(homeOrderManagerPath), read(chartOrderManagerPath));
});
