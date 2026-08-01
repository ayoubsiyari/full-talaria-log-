/**
 * Cluster G / TAL-01897 new-order draft reset.
 * GREEN: node order-entry-new-draft-reset.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET=1 node order-entry-new-draft-reset.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET === '1';

function element(initial = {}) {
    return {
        value: initial.value ?? '',
        checked: initial.checked ?? false,
        style: {},
        classList: {
            add() {},
            remove() {},
            toggle() {},
        },
    };
}

const elements = {
    placeOrderButton: element(),
    multipleTPToggle: element({ checked: true }),
    multipleTPSettings: element(),
    tpSingleView: element(),
    tpPrice: element({ value: '1.12500' }),
    slPrice: element({ value: '1.09500' }),
    enableSL: element({ checked: true }),
    slInputs: element(),
};

global.window = {
    __TALARIA_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET_V1: disabled,
    dispatchEvent() {},
};
global.CustomEvent = function CustomEvent(type, init) {
    return { type, detail: init?.detail };
};
global.document = {
    getElementById(id) {
        return elements[id] || null;
    },
    querySelectorAll() {
        return [];
    },
};
global.requestAnimationFrame = (fn) => fn();

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

Object.assign(om, {
    tpTargets: [{ id: 1, price: 1.125, percentage: 100 }],
    orderType: 'limit',
    removePreviewLines() {},
    clearPendingOrderEditingState() {},
    _resetMultiEntryStateForNewOrder() {
        this.multiEntryLevels = [];
    },
    _syncMultiTPButtonState() {},
    updateOrderPanelPrice() {},
    syncDefaultTargetsToEntry() {},
    calculatePositionFromRisk() {},
    calculateAdvancedRiskReward() {},
    updatePlaceButtonText() {},
    updatePreviewLines() {},
    chart: { updateSVGPointerEvents() {} },
});

om.beginNewOrderDraft();

assert.equal(elements.slPrice.value, '0', 'new draft clears inherited SL price');
assert.equal(elements.tpPrice.value, '0', 'new draft clears inherited TP price');
assert.equal(om.tpTargets.length, 0, 'new draft clears inherited TP ladder');

console.log(disabled
    ? 'RED — switch OFF leaves previous draft SL/TP levels in the new order'
    : 'GREEN — make-new-order clears stale draft SL/TP levels');
