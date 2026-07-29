import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const disableFix = process.env.TALARIA_TEST_DISABLE_ORDER_CANCEL_BEFORE_CONFIRM === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_CANCEL_BEFORE_CONFIRM_V1: disableFix,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

assert.equal(typeof om._markEntryCancelBadgePress, 'function', 'cancel badge marker must exist');
assert.equal(typeof om._shouldSuppressEntryPlaceAfterCancel, 'function', 'place suppression guard must exist');

om._markEntryCancelBadgePress(1000);
assert.equal(
    om._shouldSuppressEntryPlaceAfterCancel(1200),
    true,
    'recreated place click is suppressed shortly after cancel press'
);
assert.equal(
    om._shouldSuppressEntryPlaceAfterCancel(1501),
    false,
    'place is allowed after suppression window expires'
);

let placeCount = 0;
const maybePlace = (now) => {
    if (om._shouldSuppressEntryPlaceAfterCancel(now)) return false;
    placeCount += 1;
    return true;
};

om._markEntryCancelBadgePress(2000);
assert.equal(maybePlace(2200), false, 'trailing click on recreated place badge is ignored');
assert.equal(placeCount, 0, 'cancel-before-confirm race does not place a market order');
assert.equal(maybePlace(2501), true, 'a later intentional place click still works');
assert.equal(placeCount, 1, 'intentional place after guard window is preserved');

console.log(disableFix
    ? 'RED — switch OFF allows a recreated place click after cancel'
    : 'GREEN — cancel badge press suppresses trailing recreated place click');
