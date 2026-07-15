import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.join(__dirname, 'indicator-lifecycle-store.js');

const disableStore = process.env.TALARIA_TEST_DISABLE_RC6_INDICATOR_LIFECYCLE_STORE === '1';

function loadStoreModule() {
    const sandbox = {
        window: {
            __TALARIA_RC6_INDICATOR_LIFECYCLE_STORE: !disableStore,
        },
    };
    sandbox.globalThis = sandbox.window;
    vm.runInNewContext(fs.readFileSync(storePath, 'utf8'), sandbox, { filename: storePath });
    return sandbox.window;
}

const win = loadStoreModule();
const { IndicatorLifecycleStore, rc6IndicatorLifecycleStoreEnabled } = win;

assert.equal(rc6IndicatorLifecycleStoreEnabled(win), !disableStore);

const chart = { indicators: { active: [], data: {} } };
const store = new IndicatorLifecycleStore(chart);
assert.equal(store.isEnabled(), !disableStore);

const indicator = { id: 'rsi-1', type: 'rsi', name: 'RSI 14', visible: true };

store.emit('indicatorAdded', {
    chart,
    indicator,
    indicators: [indicator],
});

if (disableStore) {
    assert.equal(store.getRegistrySize(), 0, 'switch OFF: add does not populate registry');
    assert.equal(store.getSnapshot().count, 0, 'switch OFF: snapshot stays empty');
} else {
    const snap = store.getSnapshot();
    assert.equal(snap.count, 1, 'switch ON: add registers indicator');
    assert.equal(snap.active[0].id, 'rsi-1');
    assert.equal(snap.active[0].type, 'rsi');
}

store.emit('indicatorUpdated', {
    chart,
    indicator: Object.assign({}, indicator, { name: 'RSI 21' }),
    indicators: [Object.assign({}, indicator, { name: 'RSI 21' })],
});

if (!disableStore) {
    assert.equal(store.getIndicatorEntry('rsi-1').name, 'RSI 21', 'switch ON: update mutates registry');
}

let scheduleRenderCalls = 0;
const renderChart = {
    indicators: { active: [indicator], data: {} },
    scheduleRender() { scheduleRenderCalls += 1; },
};
const renderStore = new IndicatorLifecycleStore(renderChart);
renderStore.on('indicatorVisibilityChanged', function() {
    if (!renderStore.isEnabled()) return;
    if (typeof renderChart.scheduleRender === 'function') renderChart.scheduleRender();
});
renderStore.emit('indicatorVisibilityChanged', {
    chart: renderChart,
    indicator: Object.assign({}, indicator, { visible: false }),
    visible: false,
    indicators: [Object.assign({}, indicator, { visible: false })],
});

if (disableStore) {
    assert.equal(scheduleRenderCalls, 0, 'switch OFF: visibility subscriber does not schedule render');
} else {
    assert.equal(scheduleRenderCalls, 1, 'switch ON: visibility subscriber schedules render');
}

store.emit('indicatorRemoved', { chart, indicator, indicators: [] });
if (!disableStore) {
    assert.equal(store.getRegistrySize(), 0, 'switch ON: remove clears registry entry');
}

store.emit('indicatorCleared', { chart, indicator: null, indicators: [] });
if (!disableStore) {
    assert.equal(store.getSnapshot().count, 0, 'switch ON: clear empties registry');
}

const rehydrateList = [
    { id: 'ema-1', type: 'ema', name: 'EMA', visible: true },
    { id: 'macd-1', type: 'macd', name: 'MACD', visible: false, hidePlot: true },
];
store.emit('indicatorRehydrated', { chart, indicators: rehydrateList });
if (!disableStore) {
    const rehydrated = store.getSnapshot();
    assert.equal(rehydrated.count, 2, 'switch ON: rehydrate syncs full list');
    assert.equal(rehydrated.active[1].hidePlot, true);
}

console.log(disableStore
    ? 'GREEN — IndicatorLifecycleStore present; switch-OFF paths skip registry + render subscriber (RED-again)'
    : 'GREEN — IndicatorLifecycleStore add/update/remove/clear/rehydrate + visibility subscriber passed');
