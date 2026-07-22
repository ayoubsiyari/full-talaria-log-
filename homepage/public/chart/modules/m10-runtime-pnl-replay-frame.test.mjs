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
