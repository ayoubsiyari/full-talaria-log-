import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import {
    resolvePreviewEntryColor,
    multiEntryLegMeetsMinLot,
    resolveDefaultSecondEntryPrice,
    resolvePendingLimitSlEntryAnchor,
    orderEntryPreviewColorFixEnabled,
    orderEntrySecondEntryOffsetFixEnabled,
    orderEntryPendingSlClampFixEnabled,
} from './order-entry-aggregates.mjs';

const require = createRequire(import.meta.url);

const disablePreview = process.env.TALARIA_TEST_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX === '1';
const disableSecond = process.env.TALARIA_TEST_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX === '1';
const disableSlClamp = process.env.TALARIA_TEST_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX: disablePreview,
    __TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX: disableSecond,
    __TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX: disableSlClamp,
    __TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX: false,
    __TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX: false,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);
om.orderSide = 'BUY';
om.orderType = 'limit';
om.pipSize = 0.0001;
om.getPricePrecision = () => 5;
om._clampMultiEntryPriceForStop = function (raw, sibs) {
    return raw;
};
om._clampMultiEntryPriceForReward = function (raw, sibs) {
    return raw + 0.002;
};

function runPreviewColorRepro() {
    const buyStop = resolvePreviewEntryColor('BUY', 'stop');
    if (disablePreview) {
        assert.equal(buyStop, '#f23645', 'switch OFF: stop leg paints sell-red');
    } else {
        assert.equal(buyStop, '#2962ff', 'switch ON: BUY stop leg stays buy-blue');
    }
}

function runMinLotCapRepro() {
    const opts = {
        side: 'BUY',
        slPrice: 1.08,
        pipSize: 0.0001,
        pipValuePerLot: 10,
        positionSizeMode: 'risk-usd',
        totalRiskTarget: 50,
    };
    const levels = [
        { id: 1, price: 1.09, amount: 25 },
        { id: 2, price: 1.095, amount: 80 },
    ];
    const leg = levels[1];
    const ok = multiEntryLegMeetsMinLot(leg, opts, levels, 0.01);
    if (disablePreview) {
        assert.equal(ok, false, 'switch OFF: overweight leg fails total-risk cap');
    } else {
        assert.equal(ok, true, 'switch ON: per-leg risk cap keeps valid stop leg enabled');
    }
}

function runSecondEntryOffsetRepro() {
    const main = 1.09;
    const opts = { side: 'BUY', slPrice: 1.08, tpPrice: 1.12, pipSize: 0.0001, pricePrecision: 5 };
    const second = resolveDefaultSecondEntryPrice('BUY', 'limit', main, [main], opts);
    if (disableSecond) {
        assert.ok(second > main, 'switch OFF: second entry steps toward TP/reward side');
    } else {
        assert.ok(second < main, 'switch ON: limit second entry steps below main toward market');
    }
}

function runPendingSlAnchorRepro() {
    const anchor = resolvePendingLimitSlEntryAnchor('SELL', [1.2, 1.22]);
    if (disableSlClamp) {
        assert.equal(anchor, 1.21, 'switch OFF: SL clamp uses average entry');
    } else {
        assert.equal(anchor, 1.22, 'switch ON: SELL pending limit uses highest entry for SL floor');
    }
}

function runManagerHelpersRepro() {
    assert.equal(typeof om._applySltpStepperSideEffects, 'function');
    assert.equal(typeof om._draftCancelCleanupFromChart, 'function');
    assert.equal(typeof om._getPreviewSlEntryAnchor, 'function');
    assert.equal(typeof om._resolveDefaultSecondEntryPrice, 'function');
}

assert.equal(orderEntryPreviewColorFixEnabled(), !disablePreview);
assert.equal(orderEntrySecondEntryOffsetFixEnabled(), !disableSecond);
assert.equal(orderEntryPendingSlClampFixEnabled(), !disableSlClamp);

runPreviewColorRepro();
runMinLotCapRepro();
runSecondEntryOffsetRepro();
runPendingSlAnchorRepro();
runManagerHelpersRepro();

const anyOff = disablePreview || disableSecond || disableSlClamp;
console.log(anyOff
    ? 'GREEN — remaining-open-8 helpers present; switch-OFF paths reproduce legacy bugs (RED-again)'
    : 'GREEN — remaining-open-8 preview color, second-entry offset, SL anchor, panel/cancel helpers passed');
