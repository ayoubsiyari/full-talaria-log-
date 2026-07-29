/**
 * Cluster G / TAL-01777: symbol switches discard unplaced draft SL/TP state.
 * GREEN: node order-pair-switch-draft-rebind.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_PAIR_SWITCH_DRAFT_REBIND=1 node order-pair-switch-draft-rebind.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_PAIR_SWITCH_DRAFT_REBIND === '1';

function classList(initial = []) {
    const set = new Set(initial);
    return {
        contains(c) { return set.has(c); },
        add(c) { set.add(c); },
        remove(c) { set.delete(c); },
    };
}

const panel = { classList: classList(['visible']) };
const backdrop = { classList: classList(['visible']) };

global.window = {
    __TALARIA_DISABLE_ORDER_PAIR_SWITCH_DRAFT_REBIND_V1: disabled,
    __talariaV9OrderRailOpen: true,
    __talariaMultichartDraftActive: true,
};
global.document = {
    getElementById(id) {
        if (id === 'orderPanel') return panel;
        if (id === 'orderPanelBackdrop') return backdrop;
        return null;
    },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

const om = Object.create(OrderManager.prototype);
om.previewLines = { sl: { price: 1.095 }, tp: { price: 1.125 } };
om._lastOrderVisualSyncTicker = 'EURUSD';
om._getActiveTicker = () => 'GBPUSD';
om._isDraftOrderPreviewActive = () => true;
om.cleanupCalls = 0;
om.discardCalls = [];
om._draftCancelCleanupFromChart = () => {
    om.cleanupCalls += 1;
    om.previewLines = null;
    panel.classList.remove('visible');
    backdrop.classList.remove('visible');
    window.__talariaV9OrderRailOpen = false;
    window.__talariaMultichartDraftActive = false;
};
om._discardUnplacedOrderDraftLevels = (opts = {}) => {
    om.discardCalls.push(opts);
};

assert.equal(
    om._cleanupDraftForActiveTickerChange(),
    true,
    'active ticker change should discard the old symbol draft',
);
assert.equal(om.cleanupCalls, 1, 'pair switch closes/removes the visible draft');
assert.deepEqual(om.discardCalls, [{ notifyReactRail: true }], 'pair switch clears hidden draft SL/TP stores');
assert.equal(panel.classList.contains('visible'), false, 'pair switch closes order panel');
assert.equal(window.__talariaMultichartDraftActive, false, 'pair switch clears multichart draft flag');

const noDraftOm = Object.create(OrderManager.prototype);
noDraftOm._lastOrderVisualSyncTicker = 'GBPUSD';
noDraftOm._getActiveTicker = () => 'GBPUSD';
noDraftOm._isDraftOrderPreviewActive = () => false;
noDraftOm._draftCancelCleanupFromChart = () => { throw new Error('same ticker must not clean up'); };
noDraftOm._discardUnplacedOrderDraftLevels = () => { throw new Error('same ticker must not discard'); };
assert.equal(noDraftOm._cleanupDraftForActiveTickerChange(), false, 'same ticker redraw does not discard drafts');

console.log(disabled
    ? 'RED — switch OFF leaves the previous pair draft attached'
    : 'GREEN — pair switch discards previous pair draft state');
