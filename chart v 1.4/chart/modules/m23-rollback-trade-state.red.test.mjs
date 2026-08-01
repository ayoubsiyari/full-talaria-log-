/**
 * M23 REPLAY ROLLBACK TRADE-STATE — deterministic RED oracle.
 * Cross-links: Rayan #1/#3/#6b; TAL-01937.
 *
 * Adopted contract: rolling back past an executed trade
 *   1) prompts for confirmation
 *   2) on confirm: permanently cancels (never auto-reactivates / resurrects open)
 *   3) going forward again requires placing a new order manually
 *
 * Hypothesis REFUTED (not adopted): trade state keyed to wall-clock or insertion
 * order rather than replay timeline — tip cut path already uses bar timestamps
 * (candle.t / _effectiveTradeEntryMs); the bug is resurrectOpen policy + missing confirm.
 *
 * Kill-switch: __TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1 (truthy ⇒ tip control)
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m23-rollback-trade-state.red.test.mjs"
 *
 * RED (GATE-01 under kill preload):
 *   node --require path/to/preload.cjs --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m23-rollback-trade-state.red.test.mjs"
 *   preload.cjs sets globalThis.__TALARIA_M23_KILL_PRELOADED = true and window kill flag.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
global.window = global.window || {};
global.document = global.document || {
    querySelectorAll: () => [],
    getElementById: () => null,
    querySelector: () => null,
};
const OrderManager = require(process.env.TALARIA_M23_ORDER_MANAGER_PATH || './order-manager.js');
const ReplaySystem = require(process.env.TALARIA_M23_REPLAY_SYSTEM_PATH || './replay-system.js');

const KILL = '__TALARIA_DISABLE_M23_ROLLBACK_TRADE_CANCEL_V1';
const FILL_TIME = 1_721_600_060_000;
const CLOSE_TIME = FILL_TIME + 60_000;
const MID_CUT = FILL_TIME + 30_000;
const BEFORE_FILL_CUT = FILL_TIME - 30_000;

function findRepoRoot(start) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
        if (fs.existsSync(path.join(dir, 'docs', 'plan3'))
            && fs.existsSync(path.join(dir, 'chart v 1.4'))) {
            return dir;
        }
        const up = path.dirname(dir);
        if (up === dir) break;
        dir = up;
    }
    return path.resolve(start, '../../..');
}
const REPO_ROOT = findRepoRoot(__dirname);

function executedClosedTrade(id = 23) {
    return {
        id,
        status: 'CLOSED',
        orderType: 'market',
        direction: 'BUY',
        type: 'BUY',
        openPrice: 100,
        openTime: FILL_TIME,
        entryMarkerTimeMs: FILL_TIME,
        closeTime: CLOSE_TIME,
        closePrice: 105,
        closeType: 'TP',
        pnl: 500,
        realizedPnL: 500,
        quantity: 1,
        originalQuantity: 1,
        ticker: 'EURUSD',
        symbol: 'EUR/USD',
        sourceFileId: 'qa-eurusd',
    };
}

function managerFixture(extra = {}) {
    const manager = Object.create(OrderManager.prototype);
    const closed = extra.closedPositions || [executedClosedTrade()];
    const journal = (extra.tradeJournal != null)
        ? extra.tradeJournal
        : closed.map((t) => ({ ...structuredClone(t), tradeId: t.id, netPnL: t.pnl }));

    manager.pendingOrders = extra.pendingOrders || [];
    manager.openPositions = extra.openPositions || [];
    manager.closedPositions = closed;
    manager.tradeJournal = journal;
    manager.orderService = {
        pendingOrders: structuredClone(manager.pendingOrders),
        openPositions: structuredClone(manager.openPositions),
        closedPositions: manager.closedPositions,
        journalEntries: structuredClone(journal),
        addJournalEntries(rows) { this.journalEntries = structuredClone(rows); },
    };
    manager.chart = null;
    manager.scaledTrades = new Map();
    manager.splitTrades = new Map();
    manager.initialBalance = 10_000;
    manager.balance = 10_000 + closed.reduce((s, t) => s + (Number(t.pnl) || 0), 0);
    manager.equity = manager.balance;
    manager.entryMarkers = [{ id: 'm-entry' }];
    manager.exitMarkers = [{ id: 'm-exit' }];
    manager.partialCloseMarkers = [];
    manager.tradeConnectors = [{ id: 'm-arrow' }];
    manager.orderLines = [];
    manager.splitGroupAvgLines = [];
    manager.multiTPAvgLines = [];
    manager.slLines = [];
    manager.tpLines = [];
    manager.beLines = [];
    manager.pendingTargetLines = [];
    manager.mfeMaeMarkers = [];

    for (const name of [
        'cancelPendingOrder', 'removeOrderLine', 'removeSLTPLines',
        'removeEntryMarker', 'persistJournal', 'updatePositions',
        '_syncReplayHeaderStatsFromAccount', '_resetPanelForNewOrder',
        'updatePositionsPanel', 'updateJournalTab', 'showNotification',
        '_invalidateM19MarkerDeltaCache',
    ]) manager[name] = () => {};
    manager._collectLayoutCharts = () => [];
    manager._m19CommitJournalArray = (rows) => { manager.tradeJournal = rows; };
    manager.recomputeAccountFromJournal = OrderManager.prototype.recomputeAccountFromJournal;
    manager._normalizeMarkerTimestamp = OrderManager.prototype._normalizeMarkerTimestamp
        || ((t) => Number(t));
    manager._replayCutoffMs = OrderManager.prototype._replayCutoffMs;
    manager._effectiveTradeEntryMs = OrderManager.prototype._effectiveTradeEntryMs;
    manager._effectiveTradeExitMs = OrderManager.prototype._effectiveTradeExitMs;
    manager._classifyTradeAtReplayCutoff = OrderManager.prototype._classifyTradeAtReplayCutoff;
    manager._resurrectClosedPositionForReplayCut = OrderManager.prototype._resurrectClosedPositionForReplayCut;
    manager._replayCutWouldCancelExecutedTrades = OrderManager.prototype._replayCutWouldCancelExecutedTrades;
    manager._m23RollbackTradeCancelV1Enabled = OrderManager.prototype._m23RollbackTradeCancelV1Enabled;
    manager.forceCloseAllOrders = OrderManager.prototype.forceCloseAllOrders;

    return manager;
}

function transactionalState(manager) {
    return {
        pending: manager.pendingOrders.length,
        open: manager.openPositions.length,
        closed: manager.closedPositions.length,
        journal: manager.tradeJournal.length,
        openStatus: manager.openPositions[0]?.status ?? null,
        openId: manager.openPositions[0]?.id ?? null,
        balance: manager.balance,
        entryMarkers: manager.entryMarkers.length,
        exitMarkers: manager.exitMarkers.length,
        connectors: manager.tradeConnectors.length,
    };
}

function readOm() {
    return fs.readFileSync(path.join(__dirname, 'order-manager.js'), 'utf8');
}
function readRs() {
    return fs.readFileSync(path.join(__dirname, 'replay-system.js'), 'utf8');
}
function readHomeOm() {
    return fs.readFileSync(
        path.join(REPO_ROOT, 'homepage/public/chart/modules/order-manager.js'),
        'utf8',
    );
}
function readHomeRs() {
    return fs.readFileSync(
        path.join(REPO_ROOT, 'homepage/public/chart/modules/replay-system.js'),
        'utf8',
    );
}

// ─── Static anchors / hypothesis refute ───────────────────────────────────

test('M23 flag + permanent-cancel gate are wired (chart + homepage)', () => {
    for (const [label, om, rs] of [
        ['chart', readOm(), readRs()],
        ['homepage', readHomeOm(), readHomeRs()],
    ]) {
        assert.match(om, new RegExp(KILL), `${label} OM declares kill switch`);
        assert.match(om, /_m23RollbackTradeCancelV1Enabled/, `${label} OM helper`);
        assert.match(om, /resurrectOpen' && !permanentCancel/, `${label} OM gates resurrect`);
        assert.match(om, /!permanentCancel && entry != null && entry < cutoffMs/,
            `${label} OM gates open preserve`);
        assert.match(rs, /_replayCutWouldCancelExecutedTrades/, `${label} RS confirms before cut`);
        assert.match(rs, /confirmedTradeCancel/, `${label} RS confirm re-entry`);
        assert.match(rs, /Cancel executed trades\?/, `${label} RS confirm copy`);
        // Hypothesis refute: cut keys off bar timestamps, not Date.now()/insertion order.
        assert.match(rs, /Number\.isFinite\(candle\.t\) \? candle\.t : ts/,
            `${label} RS cut uses candle.t`);
        assert.match(rs, /_findLastRawIndexStrictlyBefore/,
            `${label} RS playhead from bar timeline`);
        assert.match(om, /entryMarkerTimeMs/,
            `${label} OM trade times use entry marker / openTime`);
        assert.doesNotMatch(
            rs.slice(rs.indexOf('applyReplayCutToWallClock'), rs.indexOf('applyReplayCutToWallClock') + 2500),
            /orderCutoff\s*=\s*Date\.now\s*\(/,
            `${label} orderCutoff must not use wall-clock Date.now`,
        );
    }
});

test('hypothesis REFUTED: cut path is bar-timeline keyed (not wall-clock/insertion)', () => {
    const rs = readRs();
    const start = rs.indexOf('Rewind replay to a bar-timestamp cut point');
    assert.ok(start > 0, 'JSDoc must record bar-timeline cut keying');
    const body = rs.slice(start, start + 3600);
    assert.match(body, /candle\.t \/ replay bar times/i);
    assert.match(body, /candle\.t/);
    assert.match(body, /_findLastRawIndexStrictlyBefore/);
    assert.doesNotMatch(body, /orderCutoff\s*=\s*Date\.now\s*\(/);
});

// ─── Product cells ────────────────────────────────────────────────────────

test('CONTROL (kill): mid-trade cut resurrects open (tip behaviour)', () => {
    global.window = { [KILL]: true };
    const manager = managerFixture();

    manager.forceCloseAllOrders(MID_CUT);

    assert.deepEqual(transactionalState(manager), {
        pending: 0,
        open: 1,
        closed: 0,
        journal: 0,
        openStatus: 'OPEN',
        openId: 23,
        balance: 10_000,
        entryMarkers: 0,
        exitMarkers: 0,
        connectors: 0,
    });
});

test('RED: mid-trade cut permanently cancels — no resurrect', () => {
    global.window = {};
    const manager = managerFixture();

    manager.forceCloseAllOrders(MID_CUT);

    assert.deepEqual(transactionalState(manager), {
        pending: 0,
        open: 0,
        closed: 0,
        journal: 0,
        openStatus: null,
        openId: null,
        balance: 10_000,
        entryMarkers: 0,
        exitMarkers: 0,
        connectors: 0,
    }, 'Rayan #1/#3/#6b: never auto-reactivate as open');
});

test('RED: open leg at cut is permanently cancelled (not preserved)', () => {
    global.window = {};
    const open = {
        ...executedClosedTrade(41),
        status: 'OPEN',
        closeTime: undefined,
        closePrice: undefined,
        closeType: undefined,
        pnl: undefined,
        realizedPnL: undefined,
    };
    delete open.closeTime;
    delete open.closePrice;
    const manager = managerFixture({
        closedPositions: [],
        openPositions: [open],
        tradeJournal: [],
    });
    manager.balance = 10_000;

    manager.forceCloseAllOrders(MID_CUT);

    assert.equal(manager.openPositions.length, 0);
    assert.equal(manager.closedPositions.length, 0);
    assert.equal(manager.tradeJournal.length, 0);
});

test('RED: keepClosed trades before cut are preserved; PnL reconciles', () => {
    global.window = {};
    const early = {
        ...executedClosedTrade(7),
        openTime: FILL_TIME - 120_000,
        entryMarkerTimeMs: FILL_TIME - 120_000,
        closeTime: FILL_TIME - 60_000,
        pnl: 200,
        realizedPnL: 200,
    };
    const mid = executedClosedTrade(23);
    const manager = managerFixture({
        closedPositions: [early, mid],
        tradeJournal: [
            { ...structuredClone(early), tradeId: 7, netPnL: 200 },
            { ...structuredClone(mid), tradeId: 23, netPnL: 500 },
        ],
    });

    manager.forceCloseAllOrders(MID_CUT);

    assert.equal(manager.closedPositions.length, 1);
    assert.equal(manager.closedPositions[0].id, 7);
    assert.equal(manager.tradeJournal.length, 1);
    assert.equal(manager.openPositions.length, 0);
    assert.equal(manager.balance, 10_200);
});

test('RED: markers/arrows cleared after permanent cancel (TAL-01937)', () => {
    global.window = {};
    const manager = managerFixture();
    assert.ok(manager.entryMarkers.length && manager.exitMarkers.length && manager.tradeConnectors.length);

    manager.forceCloseAllOrders(MID_CUT);

    assert.equal(manager.entryMarkers.length, 0);
    assert.equal(manager.exitMarkers.length, 0);
    assert.equal(manager.tradeConnectors.length, 0);
    assert.equal(manager.partialCloseMarkers.length, 0);
});

test('RED: forward after cancel cannot reactivate the trade', () => {
    global.window = {};
    const manager = managerFixture();
    manager.forceCloseAllOrders(MID_CUT);
    const snap = transactionalState(manager);

    // Simulate forward / refresh re-applying the empty owners — no resurrection path.
    manager.forceCloseAllOrders(FILL_TIME + 45_000);
    assert.deepEqual(transactionalState(manager), snap);
    assert.equal(manager.openPositions.length, 0);
    assert.equal(manager.closedPositions.length, 0);
});

test('RED: cut path prompts; cancel aborts; confirm applies permanent cancel', () => {
    global.window = {};
    const manager = managerFixture();
    const prompts = [];
    manager._confirmInChart = (opts) => {
        prompts.push(opts);
    };

    const rs = Object.create(ReplaySystem.prototype);
    rs.isBackNavigationAllowed = () => true;
    rs.isActive = true;
    rs.isPlaying = false;
    rs.fullRawData = [
        { t: FILL_TIME - 60_000 },
        { t: FILL_TIME },
        { t: MID_CUT },
        { t: CLOSE_TIME },
    ];
    rs.sessionStartIndex = 0;
    rs.currentIndex = 3;
    rs._findLastRawIndexStrictlyBefore = ReplaySystem.prototype._findLastRawIndexStrictlyBefore
        || function (data, cutAtMs) {
            for (let i = data.length - 1; i >= 0; i--) {
                if (data[i].t < cutAtMs) return i;
            }
            return -1;
        };
    rs.updateChartData = () => {};
    rs.updateTimeDisplay = () => {};
    rs._flushReplayStateToSession = () => {};
    rs.chart = {
        normalizeTimestampMs: (t) => Number(t),
        orderManager: manager,
        data: rs.fullRawData.map((b) => ({ ...b })),
    };

    const blocked = rs.applyReplayCutToWallClock(MID_CUT, { candleIndex: 2 });
    assert.equal(blocked, false, 'must await confirm');
    assert.equal(prompts.length, 1);
    assert.match(String(prompts[0].title || ''), /cancel/i);
    assert.equal(manager.closedPositions.length, 1, 'abort leaves trades intact');

    // User dismisses — no onConfirm → still intact
    assert.equal(manager.openPositions.length, 0);
    assert.equal(manager.closedPositions.length, 1);

    // Confirm path
    prompts[0].onConfirm();
    assert.equal(manager.closedPositions.length, 0);
    assert.equal(manager.openPositions.length, 0);
    assert.equal(manager.tradeJournal.length, 0);
    assert.equal(manager.balance, 10_000);
});

test('CONTROL (kill): cut path does not prompt', () => {
    global.window = { [KILL]: true };
    const manager = managerFixture();
    let prompted = 0;
    manager._confirmInChart = () => { prompted += 1; };

    const rs = Object.create(ReplaySystem.prototype);
    rs.isBackNavigationAllowed = () => true;
    rs.isActive = true;
    rs.isPlaying = false;
    rs.fullRawData = [
        { t: FILL_TIME - 60_000 },
        { t: FILL_TIME },
        { t: MID_CUT },
        { t: CLOSE_TIME },
    ];
    rs.sessionStartIndex = 0;
    rs.currentIndex = 3;
    rs._findLastRawIndexStrictlyBefore = function (data, cutAtMs) {
        for (let i = data.length - 1; i >= 0; i--) {
            if (data[i].t < cutAtMs) return i;
        }
        return -1;
    };
    rs.updateChartData = () => {};
    rs.updateTimeDisplay = () => {};
    rs._flushReplayStateToSession = () => {};
    rs.chart = {
        normalizeTimestampMs: (t) => Number(t),
        orderManager: manager,
        data: rs.fullRawData.map((b) => ({ ...b })),
    };

    const ok = rs.applyReplayCutToWallClock(MID_CUT, { candleIndex: 2 });
    assert.equal(ok, true);
    assert.equal(prompted, 0);
    assert.equal(manager.openPositions.length, 1);
    assert.equal(manager.openPositions[0].status, 'OPEN');
});

test('unrelated pending before cut is preserved under permanent cancel', () => {
    global.window = {};
    const pending = {
        id: 88,
        status: 'PENDING',
        placedTime: BEFORE_FILL_CUT - 60_000,
        ticker: 'GBPUSD',
        quantity: 1,
    };
    const manager = managerFixture({ pendingOrders: [pending] });
    manager.orderService.pendingOrders = [structuredClone(pending)];
    manager.cancelPendingOrder = (id) => {
        manager.pendingOrders = manager.pendingOrders.filter((p) => p.id !== id);
        manager.orderService.pendingOrders = manager.orderService.pendingOrders
            .filter((p) => p.id !== id);
    };

    manager.forceCloseAllOrders(MID_CUT);

    assert.equal(manager.pendingOrders.length, 1);
    assert.equal(manager.pendingOrders[0].id, 88);
    assert.equal(manager.openPositions.length, 0);
    assert.equal(manager.closedPositions.length, 0);
});

// ─── Mutants ──────────────────────────────────────────────────────────────

test('mutant: ungated resurrectOpen under default must die', () => {
    const om = readOm();
    // Must not resurrect without consulting permanentCancel / kill helper.
    assert.match(om, /kind === 'resurrectOpen' && !permanentCancel/);
    assert.doesNotMatch(
        om,
        /kind === 'resurrectOpen'\) \{\s*resurrectedOpen\.push/,
        'resurrect must stay behind !permanentCancel',
    );
});

test('mutant: kill polarity inverted dies', () => {
    global.window = {};
    const manager = managerFixture();
    // Default (absent) must cancel, not resurrect.
    manager.forceCloseAllOrders(MID_CUT);
    assert.equal(manager.openPositions.length, 0);

    global.window = { [KILL]: true };
    const control = managerFixture();
    control.forceCloseAllOrders(MID_CUT);
    assert.equal(control.openPositions.length, 1, 'kill must restore resurrect');
});

test('mutant: confirm bypass without flag dies', () => {
    global.window = {};
    const manager = managerFixture();
    manager._confirmInChart = () => {
        throw new Error('confirm UI must run when trades would cancel');
    };
    const rs = Object.create(ReplaySystem.prototype);
    rs.isBackNavigationAllowed = () => true;
    rs.isActive = true;
    rs.isPlaying = false;
    rs.fullRawData = [{ t: FILL_TIME - 60_000 }, { t: FILL_TIME }, { t: MID_CUT }];
    rs.sessionStartIndex = 0;
    rs.currentIndex = 2;
    rs._findLastRawIndexStrictlyBefore = () => 0;
    rs.updateChartData = () => {};
    rs._flushReplayStateToSession = () => {};
    rs.chart = {
        normalizeTimestampMs: (t) => Number(t),
        orderManager: manager,
        data: [{ t: FILL_TIME - 60_000 }, { t: FILL_TIME }, { t: MID_CUT }],
    };

    assert.throws(
        () => rs.applyReplayCutToWallClock(MID_CUT, { candleIndex: 2 }),
        /confirm UI must run/,
    );
    assert.equal(manager.closedPositions.length, 1);
});

test('GATE-01: default-on permanent cancel must fail when kill is preloaded', () => {
    const killPreloaded = global.__TALARIA_M23_KILL_PRELOADED === true
        || global.window?.[KILL] === true;
    if (!killPreloaded) {
        global.window = {};
        const manager = managerFixture();
        manager.forceCloseAllOrders(MID_CUT);
        assert.equal(manager.openPositions.length, 0, 'fix ON must permanently cancel');
        return;
    }
    global.window = { [KILL]: true };
    const manager = managerFixture();
    manager.forceCloseAllOrders(MID_CUT);
    assert.equal(
        manager.openPositions.length,
        0,
        'EXPECTED RED under kill preload: resurrect must not run when fix is default-on',
    );
});
