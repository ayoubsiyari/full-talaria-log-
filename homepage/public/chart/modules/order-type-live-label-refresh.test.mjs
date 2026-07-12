/**
 * T4 step 6 — source-level regression for live order-type label refresh during drag.
 *
 * The heavy `updatePreviewLines()` path intentionally skips while dragging. This
 * test guards the separate cheap invalidation hook that keeps the Entry label
 * current on every drag move without removing that throttle.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, 'order-manager.js'), 'utf8');

function assert(cond, msg) {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    }
}

assert(
    src.includes('function _orderTypeLiveLabelFixEnabled()'),
    'own kill-switch helper exists for order-type live label refresh',
);
assert(
    src.includes('__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX'),
    'kill-switch name is __TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX',
);
assert(
    src.includes('self._refreshOrderTypePreviewLabelLive(lineData, clampedY, ch);'),
    'main entry drag invokes cheap live label invalidation after reclassification',
);
assert(
    src.includes('self._refreshOrderTypePreviewLabelLive(lineData, clampedY, ch);') &&
    src.indexOf('self._refreshOrderTypePreviewLabelLive(lineData, clampedY, ch);') < src.indexOf('throttledCalculate(() =>'),
    'live label invalidation runs outside the throttled calculation block',
);
assert(
    /updatePreviewLines\(\)\s*\{[\s\S]*?if \(this\.isDraggingPreviewLine\) \{[\s\S]*?return;[\s\S]*?this\.removePreviewLines/.test(src),
    'heavy updatePreviewLines drag throttle remains in place',
);
assert(
    src.includes('_orderTypeLiveLabelRaf'),
    'cheap label invalidation is rAF-coalesced to preserve drag performance',
);

const sandbox = {
    console,
    window: {
        __TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX:
            process.env.TALARIA_TEST_DISABLE_ORDERTYPE_LIVE_LABEL_FIX === '1',
    },
    module: { exports: {} },
    requestAnimationFrame: (fn) => {
        fn();
        return 1;
    },
    cancelAnimationFrame: () => {},
    document: { getElementById: () => null, querySelectorAll: () => [] },
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'order-manager.js' });

const OrderManager = sandbox.module.exports;
const om = Object.create(OrderManager.prototype);
let rendered = 0;
let adjusted = 0;
let synced = 0;
om.renderPreviewLabel = () => { rendered += 1; };
om.adjustPreviewLineForLabel = () => { adjusted += 1; };
om._syncPendingLimitStopConnector = () => { synced += 1; };
om._refreshLevelCtrlHoverIfNeeded = () => {};

const didRefresh = om._refreshOrderTypePreviewLabelLive(
    { label: 'Entry', labelGroup: {}, price: 1.1 },
    42,
    {},
);
assert(didRefresh, 'live label helper reports a refresh when kill-switch is off');
assert(rendered === 1, 'live label helper calls renderPreviewLabel once');
assert(adjusted === 1, 'live label helper repositions the label after render');
assert(synced === 1, 'live label helper refreshes pending connector after label render');

if (!process.exitCode) {
    console.log('GREEN — order-type live label refresh is decoupled from updatePreviewLines drag throttle');
}
