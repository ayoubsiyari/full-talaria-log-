/**
 * Multi-TP preview drag must keep the provisional rung price during viewport
 * sync — otherwise updatePreviewLinePositions snaps the line back to the
 * pre-drag tpTargets price every frame (jump to origin ↔ cursor).
 *
 *   node --test "chart v 1.4/chart/modules/multi-tp-preview-drag-sync.test.mjs"
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
global.window = global.window || {};
global.document = {
    getElementById: () => null,
};
const OrderManager = require('./order-manager.js');

test('multi-TP store sync keeps provisional drag price on the active rung', () => {
    const manager = Object.create(OrderManager.prototype);
    manager.isDraggingPreviewLine = true;
    manager.tpTargets = [
        { id: 1, price: 1.11185, percentage: 50 },
        { id: 2, price: 1.11130, percentage: 50 },
    ];
    const tp1 = { label: 'TP1', targetIndex: 0, price: 1.11185 };
    const tp2 = { label: 'TP2', targetIndex: 1, price: 1.11130 };
    manager.previewLines = { multipleTPs: [tp1, tp2] };
    manager._orderProvisionalEdit = {
        phase: 'preview',
        lineKind: 'tp',
        tpTargetIndex: 0,
        committedPrice: 1.11185,
        provisionalPrice: 1.10776,
    };
    manager._oiProvisionalDragCtx = { lineData: tp1 };

    manager._oiSyncPreviewLinePricesFromStore();

    assert.equal(tp1.price, 1.10776, 'dragged TP1 must stay on provisional price');
    assert.equal(tp2.price, 1.11130, 'undragged TP2 stays on store price');
    assert.equal(manager.tpTargets[0].price, 1.11185, 'store commits only on mouseup');
});

test('multi-TP provisional does not overwrite single-TP preview line', () => {
    const manager = Object.create(OrderManager.prototype);
    manager.isDraggingPreviewLine = true;
    manager.tpTargets = [
        { id: 1, price: 1.11, percentage: 50 },
        { id: 2, price: 1.10, percentage: 50 },
    ];
    const multi = { label: 'TP1', targetIndex: 0, price: 1.11 };
    manager.previewLines = {
        tp: { label: 'TP', price: 1.12 },
        multipleTPs: [multi],
    };
    manager._orderProvisionalEdit = {
        phase: 'preview',
        lineKind: 'tp',
        tpTargetIndex: 0,
        committedPrice: 1.11,
        provisionalPrice: 1.105,
    };
    manager._oiProvisionalDragCtx = { lineData: multi };

    manager._oiSyncPreviewLinePricesFromStore();

    assert.equal(multi.price, 1.105);
    assert.equal(manager.previewLines.tp.price, 1.12, 'single TP line untouched during multi drag');
});
