import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const disablePersistV5 = process.env.TALARIA_TEST_DISABLE_RC6_INDICATOR_PERSIST_REHYDRATE_V2 === '1';

function loadModule(fileName, sandbox) {
    const file = path.join(__dirname, fileName);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

function loadPersistRehydrate() {
    const sandbox = {
        window: {
            __TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2: !disablePersistV5,
            __TALARIA_RC6_INDICATOR_LIFECYCLE_STORE: true,
        },
    };
    sandbox.globalThis = sandbox.window;
    loadModule('indicator-persist-rehydrate.js', sandbox);
    loadModule('indicator-lifecycle-store.js', sandbox);
    return sandbox.window;
}

const win = loadPersistRehydrate();
const {
    beginIndicatorRehydrate,
    endIndicatorRehydrate,
    shouldBlockIndicatorPersistSnapshot,
    shouldSuppressStoreIncrementalDuringRehydrate,
    reconcileRehydrateStoreSnapshot,
    countDuplicateIndicatorIds,
    IndicatorLifecycleStore,
} = win;

const chart = { indicators: { active: [], data: {} } };
const pending = [{ type: 'rsi', params: { period: 14 } }, { type: 'ema', params: { period: 20 } }];

beginIndicatorRehydrate(chart, pending);
assert.equal(shouldBlockIndicatorPersistSnapshot(chart, [], {}), !disablePersistV5,
    disablePersistV5 ? 'switch OFF: empty persist not blocked during rehydrate' : 'switch ON: empty persist blocked');

const store = new IndicatorLifecycleStore(chart);
store.emit('indicatorAdded', { chart, indicator: { id: 'rsi-1', type: 'rsi', name: 'RSI' }, indicators: [] });
store.emit('indicatorAdded', { chart, indicator: { id: 'ema-1', type: 'ema', name: 'EMA' }, indicators: [] });
store.emit('indicatorAdded', { chart, indicator: { id: 'rsi-dup', type: 'rsi', name: 'RSI dup' }, indicators: [] });

const raceActive = [
    { id: 'rsi-1', type: 'rsi', name: 'RSI' },
    { id: 'ema-1', type: 'ema', name: 'EMA' },
    { id: 'rsi-dup', type: 'rsi', name: 'RSI dup' },
];
const raceReconcile = reconcileRehydrateStoreSnapshot(pending, raceActive, store.getSnapshot());
assert.equal(raceReconcile.ok, false, 'incremental adds during restore mismatch pending count');

beginIndicatorRehydrate(chart, pending);
assert.equal(shouldSuppressStoreIncrementalDuringRehydrate(chart, 'add'), !disablePersistV5);

const cleanStore = new IndicatorLifecycleStore(chart);
if (!disablePersistV5) {
    assert.equal(shouldSuppressStoreIncrementalDuringRehydrate(chart, 'add'), true);
}
cleanStore.emit('indicatorRehydrated', {
    chart,
    indicators: [
        { id: 'rsi-1', type: 'rsi', name: 'RSI 14', visible: true },
        { id: 'ema-1', type: 'ema', name: 'EMA 20', visible: true },
    ],
});
const cleanActive = [
    { id: 'rsi-1', type: 'rsi' },
    { id: 'ema-1', type: 'ema' },
];
const cleanReconcile = reconcileRehydrateStoreSnapshot(pending, cleanActive, cleanStore.getSnapshot());
if (disablePersistV5) {
    assert.equal(cleanReconcile.storeCount >= 0, true);
} else {
    assert.equal(cleanReconcile.ok, true, 'switch ON: single rehydrate sync matches pending');
    assert.equal(cleanStore.getSnapshot().count, 2);
}
assert.equal(countDuplicateIndicatorIds(cleanActive), 0);
endIndicatorRehydrate(chart);

console.log(disablePersistV5
    ? 'GREEN — persist-rehydrate helpers present; switch-OFF allows race persist/incremental (RED-again)'
    : 'GREEN — persist blocked during rehydrate + single store sync matches pending list');
