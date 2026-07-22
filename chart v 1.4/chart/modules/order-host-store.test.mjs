/**
 * A6-4 Step 3 completion — ready-panels snapshot fan-out (RED-first).
 * Run GREEN: node order-host-store.test.mjs
 * Run RED (ready-panels off): __TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1=1 node order-host-store.test.mjs
 * Run RED (Step 3 off): __TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1=1 node order-host-store.test.mjs
 */
import {
    buildHostOrderStoreSnapshot,
    collectUnsyncedReadyPanelIds,
    fanOutHostOrderSnapshotToIframes,
    orderMcReadyPanelsSnapshotV1Enabled,
    primeReadyPanelsWithHostOrders,
} from './order-host-store.mjs';
import { ORDER_RECORD_SCHEMA_VERSION } from './order-runtime-persist.mjs';

const WIN_ON = { __TALARIA_CHART_BUILD_ID: '20260717b43' };
const READY_OFF = { __TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1: true };
const STEP3_OFF = { __TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1: true };

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed += 1;
        return;
    }
    failed += 1;
    console.error(`FAIL: ${msg}`);
}

function section(name) {
    console.log(`\n--- ${name} ---`);
}

function makeManagerCharts(map) {
    return {
        values() {
            return map.values();
        },
    };
}

section('ready-panels snapshot switch default ON');
assert(orderMcReadyPanelsSnapshotV1Enabled(WIN_ON), 'ready-panels fan-out default ON under Step 3');
assert(!orderMcReadyPanelsSnapshotV1Enabled(READY_OFF), 'ready-panels fan-out OFF when item disabled');
assert(!orderMcReadyPanelsSnapshotV1Enabled(STEP3_OFF), 'ready-panels fan-out OFF when Step 3 disabled');

section('collectUnsyncedReadyPanelIds');
const synced = new Set(['A']);
assert(
    collectUnsyncedReadyPanelIds(['A', 'B', 'C'], synced, 'A').join(',') === 'B,C',
    'skips host + already-synced panels',
);

section('fanOutHostOrderSnapshotToIframes — projection to ready iframes');
const calls = [];
const om = {
    openPositions: [{ id: 101, symbol: 'EURUSD', entryPrice: 1.1 }],
    pendingOrders: [{ id: 102, symbol: 'GBPUSD', entryPrice: 1.25 }],
    closedPositions: [],
    orders: [],
    balance: 10000,
    equity: 10000,
    initialBalance: 10000,
    orderIdCounter: 3,
    tradeGroupIdCounter: 1,
};
const charts = makeManagerCharts(new Map([
    ['A', { id: 'A', host: true, ready: true }],
    ['B', { id: 'B', host: false, ready: true }],
    ['C', { id: 'C', host: false, ready: false }],
]));
const versionHolder = { current: 0 };
const fan = fanOutHostOrderSnapshotToIframes({
    excludePanelId: null,
    managerCharts: charts,
    runCommand(cmd, args, opts) {
        calls.push({
            cmd,
            panelId: opts?.panelId,
            open: args?.snapshot?.openPositions?.length,
            runtimeOnly: args?.runtimeOnly,
        });
        return Promise.resolve();
    },
    chart: {
        orderManager: om,
        getActiveTradingSessionId: () => 'sess-1',
    },
    versionHolder,
});
assert(fan.ok && fan.panelIds.join(',') === 'B', 'fans out only to ready non-host iframes');
assert(calls.length === 1 && calls[0].cmd === 'applyOrderSnapshot' && calls[0].panelId === 'B', 'uses applyOrderSnapshot not addOrder');
assert(calls[0].open === 1, 'snapshot carries host open positions');
assert(calls[0].runtimeOnly === false, 'normal snapshot requests a structural redraw');
assert(versionHolder.current === 1, 'bumps snapshot version');

section('runtime fan-out preserves SVG and projects only host marks');
calls.length = 0;
const runtimeFan = fanOutHostOrderSnapshotToIframes({
    managerCharts: charts,
    runCommand(cmd, args, opts) {
        calls.push({ cmd, panelId: opts?.panelId, runtimeOnly: args?.runtimeOnly });
    },
    chart: {
        orderManager: om,
        getActiveTradingSessionId: () => 'sess-1',
    },
    versionHolder,
    runtimeOnly: true,
});
assert(runtimeFan.ok, 'runtime fan-out reaches ready iframe');
assert(calls.length === 1 && calls[0].runtimeOnly === true, 'runtimeOnly flag reaches applyOrderSnapshot');

section('primeReadyPanelsWithHostOrders GREEN — F5 restore path uses snapshot');
calls.length = 0;
versionHolder.current = 0;
const syncedGreen = new Set(['A']);
const green = primeReadyPanelsWithHostOrders({
    readyPanelIds: ['A', 'B', 'C'],
    syncedSet: syncedGreen,
    hostPanelId: 'A',
    orderManager: om,
    grid: {
        runCommand(cmd, args, opts) {
            calls.push({ cmd, panelId: opts?.panelId });
            return Promise.resolve();
        },
    },
    managerCharts: makeManagerCharts(new Map([
        ['A', { id: 'A', host: true, ready: true }],
        ['B', { id: 'B', host: false, ready: true }],
        ['C', { id: 'C', host: false, ready: true }],
    ])),
    chart: { orderManager: om, getActiveTradingSessionId: () => 'sess-1' },
    versionHolder,
    win: WIN_ON,
});
assert(green.action === 'applyOrderSnapshot', 'GREEN routes through snapshot fan-out');
assert(green.newPanelIds.join(',') === 'B,C', 'marks B/C synced');
assert(syncedGreen.has('B') && syncedGreen.has('C'), 'synced set updated');
assert(calls.every((c) => c.cmd === 'applyOrderSnapshot'), 'no addOrder on snapshot path');
assert(calls.some((c) => c.panelId === 'B') && calls.some((c) => c.panelId === 'C'), 'B/C iframes receive snapshot after F5');

section('primeReadyPanelsWithHostOrders — empty host does NOT mark peers synced (F5 race)');
calls.length = 0;
const emptyOm = {
    openPositions: [],
    pendingOrders: [],
    closedPositions: [],
    orders: [],
    balance: 10000,
    equity: 10000,
    initialBalance: 10000,
    orderIdCounter: 1,
    tradeGroupIdCounter: 1,
};
const syncedEmpty = new Set(['A']);
const emptyPrime = primeReadyPanelsWithHostOrders({
    readyPanelIds: ['A', 'B'],
    syncedSet: syncedEmpty,
    hostPanelId: 'A',
    orderManager: emptyOm,
    grid: {
        runCommand(cmd, args, opts) {
            calls.push({ cmd, panelId: opts?.panelId });
            return Promise.resolve();
        },
    },
    managerCharts: makeManagerCharts(new Map([
        ['B', { id: 'B', host: false, ready: true }],
    ])),
    chart: { orderManager: emptyOm, getActiveTradingSessionId: () => 'sess-1' },
    versionHolder: { current: 0 },
    win: WIN_ON,
});
assert(emptyPrime.deferredSync === true, 'flags deferred sync when host OM empty');
assert(!syncedEmpty.has('B'), 'B stays unsynced so later restore fan-out / re-prime can land');

section('primeReadyPanelsWithHostOrders RED — ready-panels switch OFF falls back to addOrder');
calls.length = 0;
const syncedRed = new Set(['A']);
const red = primeReadyPanelsWithHostOrders({
    readyPanelIds: ['A', 'B'],
    syncedSet: syncedRed,
    hostPanelId: 'A',
    orderManager: om,
    grid: {
        runCommand(cmd, args, opts) {
            calls.push({ cmd, panelId: opts?.panelId, kind: args?.kind });
            return Promise.resolve();
        },
    },
    managerCharts: makeManagerCharts(new Map([
        ['B', { id: 'B', host: false, ready: true }],
    ])),
    versionHolder,
    win: READY_OFF,
});
assert(red.action === 'addOrder', 'RED simulates legacy addOrder prime (blocked when Step 3 ON in live)');
assert(calls.length > 0 && calls.every((c) => c.cmd === 'addOrder'), 'legacy path uses addOrder per order');
assert(calls.some((c) => c.panelId === 'B' && c.kind === 'opened'), 'would push opened leg to panel B');

section('buildHostOrderStoreSnapshot — I16 row stamps');
om.tradeJournal = [{
    tradeId: 9,
    ticker: 'EURUSD',
    symbol: 'EURUSD',
    sourceFileId: '25',
    exitPrice: 1.12,
    exitMarkerTimeMs: 1570000000000,
}];
const snap = buildHostOrderStoreSnapshot(om, 'sess-1', 1, { win: WIN_ON, buildId: '20260717b43' });
assert(snap.openPositions[0].build_id === '20260717b43', 'host snapshot open row stamped');
assert(snap.pendingOrders[0].schema_version === ORDER_RECORD_SCHEMA_VERSION, 'host snapshot pending schema_version');
assert(Array.isArray(snap.tradeJournal) && snap.tradeJournal.length === 1, 'snapshot carries host tradeJournal for exit ticks');
assert(Number(snap.tradeJournal[0].exitMarkerTimeMs) === 1570000000000, 'journal exitMarkerTimeMs preserved');
const snapOff = buildHostOrderStoreSnapshot(om, 'sess-1', 1, { win: { __TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1: true } });
assert(!snapOff.openPositions[0].build_id, 'host snapshot unstamped when I16 switch OFF');
const snapJournalOff = buildHostOrderStoreSnapshot(om, 'sess-1', 1, {
    win: { __TALARIA_DISABLE_ORDER_MC_JOURNAL_SNAPSHOT_V1: true },
});
assert(Array.isArray(snapJournalOff.tradeJournal) && snapJournalOff.tradeJournal.length === 0,
    'journal omitted when journal-snapshot kill-switch ON');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
