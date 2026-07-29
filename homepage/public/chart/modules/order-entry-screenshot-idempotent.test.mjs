/**
 * Cluster E / TAL-01927: entry screenshots are idempotent across restore.
 * GREEN: node order-entry-screenshot-idempotent.test.mjs
 * RED:   TALARIA_TEST_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT=1 node order-entry-screenshot-idempotent.test.mjs
 */
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const disabled = process.env.TALARIA_TEST_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT === '1';

let captureCount = 0;
global.window = {
    __TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT_V1: disabled,
    screenshotManager: {
        captureChartSnapshot() {
            captureCount += 1;
            return Promise.resolve(`data:image/png;base64,shot-${captureCount}`);
        },
    },
};
global.document = {
    getElementById() { return null; },
};

const require = createRequire(import.meta.url);
const OrderManager = require('./order-manager.js');

function makeOrderManager() {
    const om = Object.create(OrderManager.prototype);
    om.persistCalls = [];
    om._schedulePersistAfterOrderMutation = (opts = {}) => {
        om.persistCalls.push(opts);
    };
    return om;
}

const existingShotOrder = { id: 27, entryScreenshot: 'data:image/png;base64,original' };
let om = makeOrderManager();
let promise = om._captureEntryScreenshotOnce(existingShotOrder, 'restored order');

assert.equal(promise, null, 'restored order with entryScreenshot should not enqueue recapture');
assert.equal(captureCount, 0, 'restored entryScreenshot suppresses duplicate capture');
assert.equal(existingShotOrder.entryScreenshot, 'data:image/png;base64,original', 'original screenshot is preserved');

const existingRefOrder = { id: 28, entryScreenshotRef: { refId: 'entry-ref-28' } };
om = makeOrderManager();
promise = om._captureEntryScreenshotOnce(existingRefOrder, 'restored order ref');

assert.equal(promise, null, 'restored order with entryScreenshotRef should not enqueue recapture');
assert.equal(captureCount, 0, 'restored entryScreenshotRef suppresses duplicate capture');

const freshOrder = { id: 29 };
om = makeOrderManager();
promise = om._captureEntryScreenshotOnce(freshOrder, 'fresh order');

assert.ok(promise, 'fresh order should start screenshot capture');
await promise;
assert.equal(captureCount, 1, 'fresh order captures exactly once');
assert.equal(freshOrder.entryScreenshot, 'data:image/png;base64,shot-1', 'fresh capture attaches entryScreenshot');
assert.deepEqual(om.persistCalls, [{ critical: true }], 'fresh capture critical-persists after attach');

console.log(disabled
    ? 'RED — switch OFF recaptures restored entry screenshots'
    : 'GREEN — restored entry screenshots are idempotent and fresh shots persist critically');
