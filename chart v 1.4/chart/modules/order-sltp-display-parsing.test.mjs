import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);

const disableRenderFix = process.env.TALARIA_TEST_DISABLE_SLTP_RENDER_FIX === '1';
const disableParseFix = process.env.TALARIA_TEST_DISABLE_SLTP_PARSE_FIX === '1';

global.window = {
    __TALARIA_DISABLE_SLTP_RENDER_FIX: disableRenderFix,
    __TALARIA_DISABLE_SLTP_PARSE_FIX: disableParseFix,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

function assertMethod(name) {
    assert.equal(typeof om[name], 'function', `${name} must exist`);
}

function runRenderFixRepro() {
    assertMethod('_shouldRenderSltpPrice');
    assert.equal(
        om._shouldRenderSltpPrice(9.25),
        true,
        'SL/TP price below 10 must be treated as renderable when positive'
    );
    assert.equal(
        om._shouldRenderSltpPrice(0.25),
        true,
        'Sub-1 SL/TP prices are valid for low-priced instruments'
    );
    assert.equal(
        om._shouldRenderSltpPrice(0),
        false,
        'Zero remains unset/invalid'
    );
}

function runParseFixRepro() {
    assertMethod('_shouldDeferSltpInputRecalc');
    assertMethod('_parseSltpInputPrice');

    assert.equal(
        om._shouldDeferSltpInputRecalc('slPrice', '0.'),
        true,
        'partial decimal scaffold must not recalculate lot size to zero'
    );
    assert.equal(
        om._shouldDeferSltpInputRecalc('slPrice', '0.0'),
        true,
        'zero-only decimal scaffold must not recalculate lot size to zero'
    );
    assert.equal(
        om._shouldDeferSltpInputRecalc('tpPrice', '.'),
        true,
        'bare decimal point is an in-progress price, not zero'
    );
    assert.equal(
        om._shouldDeferSltpInputRecalc('slPrice', '9.000'),
        false,
        'valid trailing-zero price must continue through normal recalculation'
    );
    assert.equal(
        om._parseSltpInputPrice('9.1000', 0),
        9.1,
        'trailing-zero decimal string parses to its numeric price, not zero'
    );

    const previousLot = 1.23;
    const lotAfterPartialSl = om._shouldDeferSltpInputRecalc('slPrice', '0.')
        ? previousLot
        : 0;
    assert.equal(
        lotAfterPartialSl,
        previousLot,
        'typing a partial SL price must preserve the last computed lot size'
    );
}

runRenderFixRepro();
runParseFixRepro();

console.log('GREEN — SL/TP display threshold + parsing reproductions passed');
