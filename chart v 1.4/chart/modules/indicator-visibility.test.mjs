import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const disableVisibilityV2 = process.env.TALARIA_TEST_DISABLE_RC6_INDICATOR_VISIBILITY_V2 === '1';

function loadVisibilityModule() {
    const sandbox = {
        window: {
            __TALARIA_RC6_INDICATOR_VISIBILITY_V2: !disableVisibilityV2,
        },
    };
    sandbox.globalThis = sandbox.window;
    const file = path.join(__dirname, 'indicator-visibility.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
    return sandbox.window;
}

const win = loadVisibilityModule();
const {
    resolveIndicatorShown,
    resolveIndicatorShownLegacy,
    applyIndicatorVisibility,
    shouldRecalcIndicatorOnShow,
    indicatorDataStoreBroken,
} = win;

const chartSettings = { showVolume: false };

// Volume dual-flag desync: visible=true but showVolume=false
const volume = { id: 'vol-1', type: 'volume', visible: true };
assert.equal(resolveIndicatorShownLegacy(volume), true, 'legacy read thinks volume is shown');
assert.equal(resolveIndicatorShown(volume, chartSettings), false, 'unified read detects hidden volume');
if (disableVisibilityV2) {
    const hidden = applyIndicatorVisibility(volume, false, { isVolume: true }, chartSettings);
    assert.equal(hidden.shown, false, 'switch OFF: legacy apply uses visible-only shown after hide');
    assert.equal(resolveIndicatorShownLegacy(volume), false);
} else {
    const hidden = applyIndicatorVisibility(volume, false, { isVolume: true }, chartSettings);
    assert.equal(hidden.shown, false);
    assert.equal(volume.visible, false);
    assert.equal(chartSettings.showVolume, false);
    const shown = applyIndicatorVisibility(volume, true, { isVolume: true }, chartSettings);
    assert.equal(shown.shown, true);
    assert.equal(volume.visible, true);
    assert.equal(chartSettings.showVolume, true);
}

// Panel dual-flag desync: visible=true but hidePlot=true
const panel = { id: 'rsi-1', type: 'rsi', overlay: false, visible: true, hidePlot: true, hideValues: true };
assert.equal(resolveIndicatorShownLegacy(panel), true, 'legacy read thinks panel is shown');
assert.equal(resolveIndicatorShown(panel, chartSettings), false, 'unified read detects hidden panel');
if (disableVisibilityV2) {
    const shown = applyIndicatorVisibility(panel, true, {}, chartSettings);
    assert.equal(shown.shown, true, 'switch OFF: legacy apply uses visible-only shown');
    assert.equal(panel.hidePlot, false);
} else {
    const shown = applyIndicatorVisibility(panel, true, {}, chartSettings);
    assert.equal(shown.shown, true);
    assert.equal(panel.visible, true);
    assert.equal(panel.hidePlot, false);
    assert.equal(panel.hideValues, false);
}

// Hide→show with empty data must request recalc
const chart = {
    indicators: {
        active: [{ id: 'ema-1', type: 'ema' }],
        data: {},
    },
};
const ema = chart.indicators.active[0];
assert.equal(indicatorDataStoreBroken(chart, ema), true);
assert.equal(shouldRecalcIndicatorOnShow(chart, ema, true), true, 'show with empty store needs recalc');
assert.equal(shouldRecalcIndicatorOnShow(chart, ema, false), false, 'hide does not need recalc');
chart.indicators.data['ema-1'] = [1, 2, 3];
assert.equal(shouldRecalcIndicatorOnShow(chart, ema, true), false, 'show with data present skips recalc');

console.log(disableVisibilityV2
    ? 'GREEN — visibility helpers present; switch-OFF reproduces dual-flag desync (RED-again)'
    : 'GREEN — unified visibility read/apply + show-recalc guard passed');
