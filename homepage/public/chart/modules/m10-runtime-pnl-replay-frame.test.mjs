/**
 * L3-M10 Failure A — host-owned coalesced runtime P&L fan-out on Play.
 *
 * Executable production-path chain (not regex-only):
 *   ReplaySystem → __multichartManagerBroadcastReplay → one host schedule()
 *   fanCount > 0 and identical for 2-panel vs 4-panel layouts
 *   kill-switch → fanCount = 0
 *
 * GREEN:
 *   node --test "chart v 1.4/chart/modules/m10-runtime-pnl-replay-frame.test.mjs"
 *
 * RED-again:
 *   TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1=1 node --test ...
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
    buildHostOrderStoreSnapshot,
    buildHostRuntimePnlSnapshot,
    createHostPnlFanoutScheduler,
    fanOutHostOrderSnapshotToIframes,
    runReplaySystemManagerPnlChain,
    scheduleHostPnlFromReplayFrame,
} from './order-host-store.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BRIDGE = path.resolve(__dirname, '../multichart-prod/panel-cmd-bridge.js');
const GRID = path.resolve(__dirname, '../../talaria-design/src/MultichartGrid.jsx');
const MANAGER = path.resolve(__dirname, '../multichart-prod/multichart-manager.js');
const REPLAY = path.resolve(__dirname, 'replay-system.js');
const KILL = process.env.TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1 === '1';

function fakeTimers() {
    const queue = [];
    let now = 0;
    return {
        now: () => now,
        setTimeout(fn, ms) {
            const id = { fn, at: now + Number(ms || 0) };
            queue.push(id);
            return id;
        },
        clearTimeout(id) {
            const i = queue.indexOf(id);
            if (i >= 0) queue.splice(i, 1);
        },
        advance(ms) {
            now += ms;
            const due = queue.filter((t) => t.at <= now).sort((a, b) => a.at - b.at);
            for (const t of due) {
                const i = queue.indexOf(t);
                if (i >= 0) queue.splice(i, 1);
                t.fn();
            }
        },
    };
}

function makeManagerCharts(panelIds) {
    const map = new Map();
    for (const id of panelIds) {
        map.set(id, { id, ready: true, host: id === 'A', frame: id === 'A' ? null : {} });
    }
    return map;
}

test('iframe bridge does not emit order-pnl-tick on replayFrame', () => {
    const bridge = fs.readFileSync(BRIDGE, 'utf8');
    const frameStart = bridge.indexOf("case 'replayFrame'");
    const frameEnd = bridge.indexOf("case 'replayPlay'", frameStart);
    const frameCase = bridge.slice(frameStart, frameEnd > 0 ? frameEnd : frameStart + 400);
    assert.equal(frameCase.includes('order-pnl-tick'), false);
    assert.equal(frameCase.includes('postOrderPnlTick'), false);
});

test('manager fast path owns host P&L schedule (ReplaySystem connected)', () => {
    const mgr = fs.readFileSync(MANAGER, 'utf8');
    assert.match(mgr, /M10_HOST_PNL_FROM_MANAGER_FASTPATH_V1/);
    assert.match(mgr, /__multichartScheduleHostPnlFanout/);
    const fnStart = mgr.indexOf('__multichartManagerBroadcastReplay');
    assert.ok(fnStart >= 0);
    const body = mgr.slice(fnStart, fnStart + 1800);
    assert.match(body, /__multichartScheduleHostPnlFanout/);
    assert.match(body, /__TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1/);

    const replay = fs.readFileSync(REPLAY, 'utf8');
    // ReplaySystem prefers manager path (no CustomEvent when manager exists).
    assert.match(replay, /__multichartManagerBroadcastReplay/);
    const prefer = replay.indexOf("typeof window.__multichartManagerBroadcastReplay === 'function'");
    assert.ok(prefer >= 0);

    const grid = fs.readFileSync(GRID, 'utf8');
    assert.match(grid, /createHostPnlFanoutScheduler/);
    assert.match(grid, /__multichartScheduleHostPnlFanout/);
    const tickIdx = grid.indexOf('order-pnl-tick');
    assert.ok(tickIdx >= 0);
    const tickHandler = grid.slice(tickIdx, tickIdx + 500);
    assert.equal(/updatePositions/.test(tickHandler), false);
});

test('ReplaySystem → manager fast path → host scheduler: fanCount>0 identical for 2/4 panels', () => {
    const timers2 = fakeTimers();
    const timers4 = fakeTimers();
    const two = runReplaySystemManagerPnlChain({
        panelIds: ['A', 'B'],
        frames: 12,
        isPlaying: true,
        kill: KILL,
        coalesceMs: 50,
        setTimeout: timers2.setTimeout,
        clearTimeout: timers2.clearTimeout,
        requestAnimationFrame: (fn) => timers2.setTimeout(fn, 16),
        advanceTimers: timers2.advance,
    });
    const four = runReplaySystemManagerPnlChain({
        panelIds: ['A', 'B', 'C', 'D'],
        frames: 12,
        isPlaying: true,
        kill: KILL,
        coalesceMs: 50,
        setTimeout: timers4.setTimeout,
        clearTimeout: timers4.clearTimeout,
        requestAnimationFrame: (fn) => timers4.setTimeout(fn, 16),
        advanceTimers: timers4.advance,
    });

    if (KILL) {
        assert.equal(two.counts.fanCount, 0, 'kill: fanCount=0 (2-panel)');
        assert.equal(four.counts.fanCount, 0, 'kill: fanCount=0 (4-panel)');
        assert.equal(two.counts.scheduleCount, 0);
        assert.equal(four.counts.scheduleCount, 0);
        assert.equal(two.applyCount, 0);
        assert.equal(four.applyCount, 0);
        return;
    }

    assert.ok(two.rafScheduleCount > 0, 'manager path schedules via rAF');
    assert.ok(two.rafFlushCount > 0, 'rAF flush executes');
    assert.ok(two.counts.fanCount > 0, 'fanCount must be > 0');
    assert.equal(two.counts.fanCount, four.counts.fanCount, 'fanCount identical for 2 vs 4 panels');
    assert.equal(two.counts.scheduleCount, four.counts.scheduleCount, 'scheduleCount identical');
    assert.ok(two.counts.fanCount <= two.counts.scheduleCount);
    // Peers receive replayFrame; host schedule count stays panel-independent.
    assert.equal(two.frameCmdCount, two.peerPanelCount * two.counts.scheduleCount);
    assert.equal(four.frameCmdCount, four.peerPanelCount * four.counts.scheduleCount);
    assert.ok(two.applyCalls.every((c) => c.cmd === 'applyOrderSnapshot' && c.runtimeOnly === true));
    assert.ok(four.applyCalls.every((c) => c.cmd === 'applyOrderSnapshot' && c.runtimeOnly === true));
    assert.equal(two.applyCount, two.counts.fanCount * two.peerPanelCount);
    assert.equal(four.applyCount, four.counts.fanCount * four.peerPanelCount);
});

test('actual manager __multichartManagerBroadcastReplay executes rAF → scheduler', () => {
    if (KILL) {
        assert.ok(true, 'skipped under kill');
        return;
    }
    const mgrSrc = fs.readFileSync(MANAGER, 'utf8');
    const blockStart = mgrSrc.indexOf('var _mcReplayCoalescedDetail = null;');
    const blockEnd = mgrSrc.indexOf('})(typeof window !== \'undefined\' ? window : globalThis);', blockStart);
    assert.ok(blockStart >= 0 && blockEnd > blockStart, 'manager broadcast block located');
    const block = mgrSrc.slice(blockStart, blockEnd);

    const rafQueue = [];
    let scheduleHits = 0;
    const frameCmds = [];
    const global = {
        requestAnimationFrame(fn) {
            rafQueue.push(fn);
            return rafQueue.length;
        },
        chart: {
            orderManager: {
                openPositions: [{ id: 1, unrealizedPnL: 1.5 }],
                pendingOrders: [],
            },
        },
        __multichartScheduleHostPnlFanout() {
            scheduleHits += 1;
        },
        __multichartManagerRef: {
            charts: new Map([
                ['A', { id: 'A', host: true, frame: null }],
                ['B', { id: 'B', host: false, frame: {} }],
            ]),
            sendCommandNoReply(id, cmd, payload) {
                frameCmds.push({ id, cmd, isPlaying: !!(payload && payload.isPlaying) });
            },
        },
    };

    // Execute the production manager function body against our mock global.
    // eslint-disable-next-line no-new-func
    new Function('global', `${block}`)(global);
    assert.equal(typeof global.__multichartManagerBroadcastReplay, 'function');

    for (let i = 0; i < 8; i++) {
        global.__multichartManagerBroadcastReplay({
            timestamp: 1_700_000_000_000 + i * 1000,
            isPlaying: true,
            currentIndex: i,
        });
    }
    assert.ok(rafQueue.length >= 1, 'manager coalesces onto rAF');
    assert.equal(scheduleHits, 0, 'scheduler must not run before rAF flush');
    while (rafQueue.length) rafQueue.shift()();
    assert.ok(scheduleHits >= 1, 'rAF flush invokes __multichartScheduleHostPnlFanout');
    assert.ok(frameCmds.some((c) => c.id === 'B' && c.cmd === 'replayFrame'));
});

test('scheduleHostPnlFromReplayFrame respects kill + isPlaying + live orders', () => {
    let n = 0;
    const schedule = () => { n += 1; };
    assert.equal(scheduleHostPnlFromReplayFrame(
        { timestamp: 1, isPlaying: true },
        { kill: true, openPositions: [{ id: 1 }], schedule },
    ), false);
    assert.equal(n, 0);
    assert.equal(scheduleHostPnlFromReplayFrame(
        { timestamp: 1, isPlaying: false },
        { openPositions: [{ id: 1 }], schedule },
    ), false);
    assert.equal(scheduleHostPnlFromReplayFrame(
        { timestamp: 1, isPlaying: true },
        { openPositions: [], pendingOrders: [], schedule },
    ), false);
    assert.equal(scheduleHostPnlFromReplayFrame(
        { timestamp: 1, isPlaying: true },
        { openPositions: [{ id: 1 }], schedule },
    ), true);
    assert.equal(n, 1);
});

test('runtimeOnly apply preserves structural shape (no full rebuild flag)', () => {
    const calls = [];
    const chart = {
        orderManager: {
            openPositions: [{ id: 7, openPrice: 1.2, unrealizedPnL: 12.5, ticker: 'EURUSD' }],
            pendingOrders: [],
            closedPositions: [],
            tradeJournal: [],
            orders: [],
        },
        getActiveTradingSessionId: () => null,
    };
    fanOutHostOrderSnapshotToIframes({
        managerCharts: makeManagerCharts(['A', 'B']),
        runCommand: (cmd, args) => { calls.push({ cmd, args }); },
        chart,
        versionHolder: { current: 0 },
        runtimeOnly: true,
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].args.runtimeOnly, true);
    assert.equal(calls[0].args.snapshot.openPositions[0].unrealizedPnL, 12.5);
});

test('runtimeOnly payload stays bounded with a huge journal (no heavy clones)', () => {
    const hugeShot = `data:image/png;base64,${'A'.repeat(80_000)}`;
    const journal = [];
    for (let i = 0; i < 400; i++) {
        journal.push({
            id: 10_000 + i,
            symbol: 'EURUSD',
            entryScreenshot: hugeShot,
            exitScreenshot: hugeShot,
            excursions: Array.from({ length: 200 }, (_, j) => ({ t: j, mfe: j, mae: -j })),
            pnl: i,
        });
    }
    const om = {
        openPositions: [{
            id: 7,
            ticker: 'EURUSD',
            openPrice: 1.2,
            unrealizedPnL: 12.5,
            quantity: 1,
            type: 'BUY',
            entryScreenshot: hugeShot,
            excursions: Array.from({ length: 500 }, (_, j) => ({ t: j, px: 1.2 + j * 0.00001 })),
        }],
        pendingOrders: [],
        closedPositions: journal.slice(0, 80),
        tradeJournal: journal,
        orders: journal.map((j) => ({ id: j.id, symbol: 'EURUSD' })),
        balance: 10000,
        equity: 10012.5,
        initialBalance: 10000,
        orderIdCounter: 999,
        tradeGroupIdCounter: 9,
    };
    const full = buildHostOrderStoreSnapshot(om, 'sess', 1, {
        win: { __TALARIA_CHART_BUILD_ID: '20260722b99' },
    });
    const slim = buildHostRuntimePnlSnapshot(om, 'sess', 1);
    const fullBytes = JSON.stringify(full).length;
    const slimBytes = JSON.stringify(slim).length;

    assert.ok(fullBytes > 100_000, 'full snapshot must include heavy journal (sanity)');
    assert.ok(slimBytes < 8_000, `runtimeOnly payload bounded (got ${slimBytes})`);
    assert.ok(slimBytes * 20 < fullBytes, 'runtimeOnly << full with huge journal');
    assert.equal(slim.runtimeOnly, true);
    assert.equal(slim.tradeJournal, undefined);
    assert.equal(slim.closedPositions, undefined);
    assert.equal(slim.orders, undefined);
    assert.equal(slim.openPositions[0].entryScreenshot, undefined);
    assert.equal(slim.openPositions[0].excursions, undefined);
    assert.equal(slim.openPositions[0].unrealizedPnL, 12.5);

    const fan = fanOutHostOrderSnapshotToIframes({
        managerCharts: makeManagerCharts(['A', 'B']),
        runCommand: () => {},
        chart: { orderManager: om, getActiveTradingSessionId: () => 'sess' },
        versionHolder: { current: 0 },
        runtimeOnly: true,
    });
    assert.equal(fan.runtimeOnly, true);
    assert.ok(fan.payloadBytes < 8_000, 'fan-out payloadBytes bounded');
    assert.equal(fan.snapshot.tradeJournal, undefined);
    assert.equal(fan.snapshot.closedPositions, undefined);
    assert.equal(fan.snapshot.orders, undefined);
});

test('runtimeOnly bridge apply: zero full-panel rebuild calls', () => {
    const bridge = fs.readFileSync(BRIDGE, 'utf8');
    const fnStart = bridge.indexOf('function applyOrderSnapshotProjection');
    assert.ok(fnStart >= 0);
    const fnEnd = bridge.indexOf('\n    function ', fnStart + 10);
    const body = bridge.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 6000);
    // Hot-path branch must not call updatePositionsPanel.
    const runtimeIdx = body.indexOf('opts.runtimeOnly === true');
    assert.ok(runtimeIdx >= 0, 'runtimeOnly branch present');
    const runtimeReturn = body.indexOf('panelRebuild: false', runtimeIdx);
    assert.ok(runtimeReturn > runtimeIdx, 'runtimeOnly returns panelRebuild:false');
    const runtimeBlock = body.slice(runtimeIdx, runtimeReturn);
    assert.equal(runtimeBlock.includes('updatePositionsPanel'), false,
        'runtimeOnly must not call updatePositionsPanel');
    assert.equal(runtimeBlock.includes('tradeJournal'), false,
        'runtimeOnly must not clone tradeJournal');
    assert.equal(runtimeBlock.includes('closedPositions'), false,
        'runtimeOnly must not clone closedPositions');
    assert.equal(runtimeBlock.includes('cloneOrderList(snapshot.orders'), false,
        'runtimeOnly must not clone orders');

    // Executable apply of the production runtimeOnly branch (extracted).
    let panelRebuilds = 0;
    let lineUpdates = 0;
    const openLocal = [{
        id: 7, ticker: 'EURUSD', openPrice: 1.2, unrealizedPnL: 1, type: 'BUY', quantity: 1,
        status: 'open',
    }];
    const om = {
        openPositions: openLocal,
        pendingOrders: [],
        closedPositions: [{ id: 99, entryScreenshot: 'KEEP' }],
        tradeJournal: [{ id: 99, exitScreenshot: 'KEEP' }],
        orders: [{ id: 7 }],
        balance: 10000,
        equity: 10000,
        _hostProjectedVisualShape: JSON.stringify({
            open: [{
                kind: 'open', id: 7, status: 'open', type: 'BUY',
                openPrice: 1.2, entryPrice: 0, stopLoss: 0, takeProfit: 0,
                quantity: 1, remainingQuantity: 0, splitGroupId: '', splitIndex: 0,
                autoBreakeven: false, breakevenTriggered: false, targets: [],
            }],
            pending: [],
        }),
        updateOrderLines() { lineUpdates += 1; },
        updateSLTPLines() { lineUpdates += 1; },
        updateBELines() { lineUpdates += 1; },
        updatePositionsPanel() { panelRebuilds += 1; },
    };
    const ch = { orderManager: om, currentSymbol: 'EURUSD', currentFileId: null };
    const snapshot = buildHostRuntimePnlSnapshot({
        openPositions: [{
            id: 7, ticker: 'EURUSD', openPrice: 1.2, unrealizedPnL: 12.5,
            type: 'BUY', quantity: 1, status: 'open',
        }],
        pendingOrders: [],
        balance: 10000,
        equity: 10012.5,
        initialBalance: 10000,
    }, null, 3);

    // Extract + run applyOrderSnapshotProjection against this OM.
    const helpersEnd = bridge.indexOf('function applyOrderSnapshotProjection');
    const helpersStart = bridge.indexOf('function cloneOrderList');
    assert.ok(helpersStart >= 0 && helpersEnd > helpersStart);
    const projEnd = bridge.indexOf('\n    function ', helpersEnd + 10);
    const projSrc = bridge.slice(helpersStart, projEnd > 0 ? projEnd : helpersEnd + 8000);
    const sandbox = {
        __TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX: false,
        __TALARIA_DISABLE_ORDER_MC_JOURNAL_SNAPSHOT_V1: false,
        __TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1: false,
    };
    // eslint-disable-next-line no-new-func
    const apply = new Function('global', `${projSrc}; return applyOrderSnapshotProjection;`)(sandbox);
    const result = apply(ch, snapshot, { runtimeOnly: true });
    assert.equal(result.runtimeOnly, true);
    assert.equal(result.panelRebuild, false);
    assert.equal(panelRebuilds, 0, 'zero full-panel rebuild calls');
    assert.ok(lineUpdates >= 1, 'existing P&L/line updaters ran');
    assert.equal(openLocal[0].unrealizedPnL, 12.5);
    assert.equal(om.tradeJournal[0].exitScreenshot, 'KEEP', 'journal untouched');
    assert.equal(om.closedPositions[0].entryScreenshot, 'KEEP', 'closed untouched');
    assert.equal(om.orders.length, 1, 'orders array untouched');
});

test('createHostPnlFanoutScheduler still coalesces direct schedules', () => {
    if (KILL) {
        assert.ok(true, 'skipped under kill');
        return;
    }
    const timers = fakeTimers();
    let fans = 0;
    const scheduler = createHostPnlFanoutScheduler(() => { fans += 1; }, {
        coalesceMs: 50,
        setTimeout: timers.setTimeout,
        clearTimeout: timers.clearTimeout,
    });
    for (let i = 0; i < 10; i++) {
        scheduler.schedule();
        timers.advance(10);
    }
    timers.advance(50);
    assert.ok(fans > 0);
    assert.ok(fans < 10);
});
