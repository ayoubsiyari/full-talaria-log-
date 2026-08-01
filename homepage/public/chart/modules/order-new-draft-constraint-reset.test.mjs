/**
 * Cluster G / TP-SL drag family: Make-new-order clears hidden drag constraints.
 * GREEN: node order-new-draft-constraint-reset.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_NEW_DRAFT_CONSTRAINT_RESET=1 node order-new-draft-constraint-reset.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_NEW_DRAFT_CONSTRAINT_RESET === '1';

function element(initial = {}) {
    return {
        value: initial.value ?? '',
        checked: initial.checked ?? false,
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
    };
}

const elements = {
    tpPrice: element({ value: '1.12500' }),
    slPrice: element({ value: '1.09500' }),
    multipleTPToggle: element({ checked: true }),
    multipleTPSettings: element(),
    tpSingleView: element(),
};

global.window = {
    __TALARIA_DISABLE_ORDER_NEW_DRAFT_CONSTRAINT_RESET_V1: disabled,
};
global.document = {
    getElementById(id) {
        return elements[id] || null;
    },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

Object.assign(om, {
    tpTargets: [{ id: 1, price: 1.125, percentage: 100 }],
    multiEntryLevels: [{ id: 1, price: 1.1, amount: 100 }],
    _rrExecuteArmed: true,
    slManuallyPositioned: true,
    tpManuallyPositioned: true,
    isDraggingPreviewLine: true,
    _previewEntryDecoupledFromRR: true,
    _previewEntryLinkedToRiskReward: true,
    _oiProvisionalDragCtx: { lineData: { price: 1.095 } },
    _orderProvisionalEdit: {
        phase: 'preview',
        lineKind: 'sl',
        committedPrice: 1.095,
        provisionalPrice: 1.095,
    },
    _syncMultiTPButtonState() {},
    _resetMultiEntryStateForNewOrder() {
        this.multiEntryLevels = [];
    },
});

om._discardUnplacedOrderDraftLevels();

assert.equal(elements.slPrice.value, '0', 'visible SL field is cleared');
assert.equal(elements.tpPrice.value, '0', 'visible TP field is cleared');
assert.equal(om._rrExecuteArmed, false, 'new draft disarms stale RR execute state');
assert.equal(om.slManuallyPositioned, false, 'new draft clears stale SL manual-position flag');
assert.equal(om.tpManuallyPositioned, false, 'new draft clears stale TP manual-position flag');
assert.equal(om.isDraggingPreviewLine, false, 'new draft clears preview drag flag');
assert.equal(om._previewEntryDecoupledFromRR, false, 'new draft clears RR decoupled preview state');
assert.equal(om._previewEntryLinkedToRiskReward, false, 'new draft clears RR linked preview state');
assert.equal(om._oiProvisionalDragCtx, null, 'new draft clears stale provisional drag context');
assert.equal(om._orderProvisionalEdit.phase, 'idle', 'new draft clears provisional edit baseline');

console.log(disabled
    ? 'RED — switch OFF clears fields but leaves stale SL drag constraints'
    : 'GREEN — new draft clears fields and hidden SL/TP drag constraints');
