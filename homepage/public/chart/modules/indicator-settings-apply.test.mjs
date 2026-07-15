import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const disableSettingsV3 = process.env.TALARIA_TEST_DISABLE_RC6_INDICATOR_SETTINGS_APPLY_V2 === '1';

function loadSettingsApplyModule() {
    const sandbox = {
        window: {
            __TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2: !disableSettingsV3,
        },
    };
    sandbox.globalThis = sandbox.window;
    const file = path.join(__dirname, 'indicator-settings-apply.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    return sandbox.window;
}

const win = loadSettingsApplyModule();
const {
    indicatorDataMatchesBarCount,
    indicatorStorePrimarySeriesLength,
    applyIndicatorSettingsInvalidation,
    resolveSettingsApplyInvalidation,
    buildSettingsApplyInvalidationLegacy,
} = win;

const indicator = { id: 'rsi-1', type: 'rsi', params: { period: 14 } };
const chart = {
    data: new Array(100).fill({ c: 1 }),
    indicators: {
        active: [indicator],
        data: {
            'rsi-1': { rsi: new Array(50).fill(50) },
        },
    },
};

assert.equal(indicatorStorePrimarySeriesLength(chart.indicators.data['rsi-1'], 'rsi'), 50);
assert.equal(indicatorDataMatchesBarCount(chart, indicator), false, 'stale RSI store is half bar count');

const legacyContract = buildSettingsApplyInvalidationLegacy(true, { period: 21 });
assert.equal(legacyContract.enforceDataLength, false, 'legacy contract skips bar-length enforcement');

const v3Contract = resolveSettingsApplyInvalidation(true, { period: 21 });
if (disableSettingsV3) {
    assert.equal(v3Contract.enforceDataLength, false, 'switch OFF: no bar-length enforcement');
} else {
    assert.equal(v3Contract.enforceDataLength, true, 'switch ON: calc change enforces bar-length');
}

let recalcCalls = 0;
const result = applyIndicatorSettingsInvalidation(chart, indicator, {
    needsDataRecalc: true,
    newParams: { period: 21 },
}, {
    recalcFn(chartRef, ind) {
        recalcCalls += 1;
        chartRef.indicators.data[ind.id] = { rsi: new Array(chartRef.data.length).fill(55) };
    },
});

if (disableSettingsV3) {
    assert.equal(recalcCalls, 0, 'switch OFF: stale store not repaired');
    assert.equal(indicatorDataMatchesBarCount(chart, indicator), false, 'switch OFF: length still mismatched');
} else {
    assert.equal(recalcCalls, 1, 'switch ON: recalc invoked once');
    assert.equal(result.matchedBars, true, 'switch ON: RSI length matches bar count after apply');
    assert.equal(indicatorStorePrimarySeriesLength(chart.indicators.data['rsi-1'], 'rsi'), 100);
}

assert.equal(result.applied, true);

console.log(disableSettingsV3
    ? 'GREEN — settings-apply helpers present; switch-OFF leaves stale series (RED-again)'
    : 'GREEN — settings-apply invalidation enforces bar-length match after RSI period change');
