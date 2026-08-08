import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const disableFix = process.env.TALARIA_TEST_DISABLE_ORDER_MULTI_ADD_CANCEL_SUPPRESS === '1';

global.window = {
    __TALARIA_DISABLE_ORDER_MULTI_ADD_CANCEL_SUPPRESS_V1: disableFix,
};

const OrderManager = require('./order-manager.js');
const om = Object.create(OrderManager.prototype);

assert.equal(typeof om._markEntryMultiAddPress, 'function', 'multi-add marker must exist');
assert.equal(
    typeof om._shouldSuppressEntryCancelAfterMultiAdd,
    'function',
    'cancel-after-multi-add guard must exist'
);

om._markEntryMultiAddPress(1000);

if (disableFix) {
    // Known-defective: without the suppress window, a trailing cancel click is allowed.
    assert.equal(
        om._shouldSuppressEntryCancelAfterMultiAdd(1200),
        false,
        'RED — switch OFF must not suppress cancel after multi-entry add'
    );
    console.log('RED — switch OFF allows a recreated cancel click after multi-entry add');
    process.exit(0);
}

assert.equal(
    om._shouldSuppressEntryCancelAfterMultiAdd(1200),
    true,
    'recreated cancel click is suppressed shortly after multi-entry add'
);
assert.equal(
    om._shouldSuppressEntryCancelAfterMultiAdd(1501),
    false,
    'cancel is allowed after suppression window expires'
);

let closeCount = 0;
const maybeClose = (now) => {
    if (om._shouldSuppressEntryCancelAfterMultiAdd(now)) return false;
    closeCount += 1;
    return true;
};

om._markEntryMultiAddPress(2000);
assert.equal(maybeClose(2200), false, 'trailing click on recreated cancel badge is ignored');
assert.equal(closeCount, 0, 'multi-add race does not close the order rail');
assert.equal(maybeClose(2501), true, 'a later intentional cancel click still works');
assert.equal(closeCount, 1, 'intentional cancel after guard window is preserved');

console.log('GREEN — multi-entry add suppresses trailing recreated cancel click');
