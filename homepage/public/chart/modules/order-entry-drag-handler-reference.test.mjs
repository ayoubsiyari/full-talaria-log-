/**
 * T4 step 7 — execute the real entry drag handler and prove it does not throw
 * `ReferenceError: level is not defined`.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'order-manager.js'), 'utf8');

function makeSelection() {
    const attrs = new Map([['transform', 'translate(10, 20)']]);
    const api = {
        attr(name, value) {
            if (arguments.length === 1) return attrs.get(name) || '';
            attrs.set(name, String(value));
            return api;
        },
        append() { return makeSelection(); },
        select() {
            return {
                empty: () => true,
            };
        },
        selectAll() {
            return {
                remove: () => {},
            };
        },
        node() {
            return { getBBox: () => ({ width: 104, height: 24, x: 0, y: 0 }) };
        },
        call(fn) {
            if (typeof fn === 'function') fn(api);
            return api;
        },
        text() { return api; },
    };
    return api;
}

const dragHandlers = {};
const sandbox = {
    console,
    window: {},
    module: { exports: {} },
    requestAnimationFrame: (fn) => {
        fn();
        return 1;
    },
    cancelAnimationFrame: () => {},
    document: {
        getElementById(id) {
            const values = {
                orderEntryPrice: { value: '1.10000' },
                orderQuantity: { value: '1.00' },
                slPrice: { value: '0', checked: false },
                tpPrice: { value: '0', checked: false },
                enableSL: { checked: false },
                enableTP: { checked: false },
                multipleTPToggle: { checked: false },
            };
            return values[id] || null;
        },
        querySelector: () => null,
        querySelectorAll: () => [],
    },
    d3: {
        drag() {
            const api = {
                filter(fn) {
                    dragHandlers.filter = fn;
                    return api;
                },
                on(name, fn) {
                    dragHandlers[name] = fn;
                    return api;
                },
            };
            return api;
        },
    },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'order-manager.js' });

const OrderManager = sandbox.module.exports;
const yScale = (price) => price * 100;
yScale.invert = (y) => y / 100;
const chart = {
    h: 300,
    scales: { yScale },
};

function runDragScenario(name, flags = {}) {
    sandbox.window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2 = !!flags.disableReclassify;
    sandbox.window.__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX = !!flags.disableLiveLabel;
    for (const key of Object.keys(dragHandlers)) delete dragHandlers[key];

    const om = Object.create(OrderManager.prototype);
    Object.assign(om, {
        orderSide: 'BUY',
        orderType: 'limit',
        pipSize: 0.0001,
        previewLines: { _previewChart: chart, entry: null, tp: null, sl: null, multiTPBadges: [] },
        isMultiEntryMode: false,
        multiEntryLevels: [],
        tpTargets: [],
        getCurrentCandle: () => ({ c: 1.1, close: 1.1 }),
        _getPreviewChart: () => chart,
        _snapOrderPriceToTick: (p) => p,
        formatPrice: (p) => Number(p).toFixed(5),
        getPricePrecision: () => 5,
        _multichartPostDraftDragBusy: () => {},
        calculateAdvancedRiskReward: () => {},
        updatePlaceButtonText: () => {},
        adjustPreviewLineForLabel: () => {},
        renderPreviewLabel: () => {},
        _useEntryAnchoredTpSlBadges: () => false,
        _syncEntryAnchoredPreviewBadgesWithEntry: () => {},
        _refreshOrderTypePreviewLabelLive: OrderManager.prototype._refreshOrderTypePreviewLabelLive,
        _syncPendingLimitStopConnector: () => {},
        _refreshLevelCtrlHoverIfNeeded: () => {},
        _getReferenceEntryForOrderMath: () => 1.105,
        _previewBreakevenAnchorLots: () => 1,
        _breakevenRiskAnchorPriceFromLadder: () => 1.105,
        _updateMultiTPAvgLines: () => {},
        renderTPTargets: () => {},
    });

    const lineData = {
        label: 'Entry',
        direction: 'BUY',
        price: 1.1,
        color: '#2962ff',
        line: makeSelection(),
        labelGroup: makeSelection(),
        labelDimensions: { width: 104, height: 24 },
    };
    om.previewLines.entry = lineData;

    om.makePreviewLineDraggable(lineData);
    dragHandlers.start();
    dragHandlers.drag({ y: 110.5, sourceEvent: null });
    console.log(`pass: ${name}`);
}

try {
    runDragScenario('switches default ON');
    runDragScenario('reclassification switch OFF', { disableReclassify: true });
    runDragScenario('live-label switch OFF', { disableLiveLabel: true });
    runDragScenario('both switches OFF', { disableReclassify: true, disableLiveLabel: true });
    console.log('GREEN — real entry drag handler ran without ReferenceError across switch matrix');
} catch (err) {
    console.error(`FAIL: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
}
