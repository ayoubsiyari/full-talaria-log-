import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { resolveSltpStepperSeedPrice } from './order-entry-aggregates.mjs';

const require = createRequire(import.meta.url);

const disableFix = process.env.TALARIA_TEST_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_ENTRY_PARSE_DRAG_INPUT_FIX: disableFix,
    __TALARIA_DISABLE_ORDER_AGGREGATES_V2: false,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);
om.orderSide = 'BUY';
om.pipSize = 0.0001;

function runSltpSeedRepro() {
    const entry = 1.1;
    const sl = resolveSltpStepperSeedPrice('slPrice', 0, entry, 'BUY', 0.0001);
    const tp = resolveSltpStepperSeedPrice('tpPrice', 0, entry, 'BUY', 0.0001);
    assert.equal(sl, entry - 0.001, 'unset SL seeds below entry');
    assert.equal(tp, entry + 0.001, 'unset TP seeds above entry');
    assert.equal(resolveSltpStepperSeedPrice('slPrice', 1.05, entry, 'BUY', 0.0001), 1.05, 'positive SL unchanged');
}

function runManagerHelpersRepro() {
    assert.equal(typeof om._applyLotSizeStepperSideEffects, 'function', '_applyLotSizeStepperSideEffects must exist');
    assert.equal(typeof om._resolveSltpStepperSeedPriceForTest, 'function', 'seed helper must exist');

    global.document = {
        getElementById: (id) => {
            if (id === 'orderEntryPrice') return { value: '1.1000' };
            return null;
        },
    };

    const seeded = om._resolveSltpStepperSeedPriceForTest('tpPrice', 0);
    if (disableFix) {
        assert.equal(seeded, 0, 'switch OFF: TP stepper stays at zero');
    } else {
        assert.equal(seeded, 1.101, 'switch ON: TP stepper seeds from entry');
    }
}

runSltpSeedRepro();
runManagerHelpersRepro();

console.log(disableFix
    ? 'GREEN — parse/drag-input helpers present; switch OFF keeps zero SL/TP seed (RED-again)'
    : 'GREEN — parse/drag-input SL/TP seed + lot stepper side-effects helpers passed');
