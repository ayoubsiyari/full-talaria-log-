import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { computeMultiEntryStackIndices } from './order-entry-aggregates.mjs';

const require = createRequire(import.meta.url);

const disableFix = process.env.TALARIA_TEST_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_ENTRY_CLOSE_HITTARGET_FIX: disableFix,
    __TALARIA_DISABLE_ORDER_AGGREGATES_V2: false,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);
om.multiEntryLevels = [];
om.getPricePrecision = () => 4;

function runStackIndexRepro() {
    const levels = [
        { id: 1, price: 1.1, amount: 50 },
        { id: 2, price: 1.1, amount: 50 },
        { id: 3, price: 1.095, amount: 50 },
    ];
    const map = computeMultiEntryStackIndices(levels, 4);
    assert.equal(map.get(1), 0, 'first stacked leg at shared price is index 0');
    assert.equal(map.get(2), 1, 'second stacked leg at shared price is index 1');
    assert.equal(map.get(3), 0, 'unique price leg is index 0');
}

function runManagerStackOffsetRepro() {
    assert.equal(typeof om._multiEntryStackYOffsetPx, 'function', '_multiEntryStackYOffsetPx must exist');
    om.multiEntryLevels = [
        { id: 1, price: 1.1, amount: 50 },
        { id: 2, price: 1.1, amount: 50 },
    ];
    const y1 = om._multiEntryStackYOffsetPx(1);
    const y2 = om._multiEntryStackYOffsetPx(2);
    if (disableFix) {
        assert.equal(y1, 0, 'switch OFF: no stack offset');
        assert.equal(y2, 0, 'switch OFF: stacked legs remain at same hit Y');
    } else {
        assert.equal(y1, 0, 'switch ON: first leg baseline');
        assert.equal(y2, 16, 'switch ON: second stacked leg offset by ENTRY_STACK_OFFSET_PX');
    }
}

function runRemoveFinalizeRepro() {
    assert.equal(typeof om._finalizeMultiEntryLevelRemove, 'function', '_finalizeMultiEntryLevelRemove must exist');
    assert.equal(typeof om.removeMultiEntryLevel, 'function', 'removeMultiEntryLevel must exist');
}

runStackIndexRepro();
runManagerStackOffsetRepro();
runRemoveFinalizeRepro();

console.log(disableFix
    ? 'GREEN — close/hit-target helpers present; switch OFF restores zero stack offset (RED-again)'
    : 'GREEN — close/hit-target stack indices + manager offsets passed');
