/**
 * RC5-OI guard property tests — Phase 0 + A6-1 edge cells (D-020).
 * Run GREEN:  node order-interaction-guard.test.mjs
 * Run RED (master off): TALARIA_ORDER_INTERACTION_GUARD_V2=0 node order-interaction-guard.test.mjs
 * Run RED (A6-1 off):   TALARIA_ORDER_SLTP_APPLY_ON_RELEASE_FIX=0 node order-interaction-guard.test.mjs
 * Run RED (#4 off):     TALARIA_ORDER_PREVIEW_REPLAY_DRAG_FIX=0 node order-interaction-guard.test.mjs
 */
import {
    applyOnReleaseDragTick,
    beginProvisionalEdit,
    cancelProvisionalEdit,
    commitProvisionalEdit,
    createProvisionalEditState,
    getSltpHitTestPrice,
    legacyMutateStopLossDuringDrag,
    orderInteractionGuardV2Enabled,
    previewReplayDragFixEnabled,
    shouldDeferReplayPreviewSync,
    shouldSuppressSltpHits,
    sltpApplyOnReleaseFixEnabled,
    updateProvisionalPrice,
    wouldBuySlHit,
} from './order-interaction-guard.mjs';

const GUARD_ON = {};
const GUARD_OFF = { __TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2: true };
const A6_OFF = { __TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX: true };
const HASH4_OFF = { __TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX: true };

let passed = 0;
let failed = 0;

function assert(cond, msg) {
    if (cond) {
        passed += 1;
        return;
    }
    failed += 1;
    console.error(`FAIL: ${msg}`);
}

function section(name) {
    console.log(`\n--- ${name} ---`);
}

section('switches default ON');
assert(orderInteractionGuardV2Enabled(GUARD_ON), 'master guard default ON');
assert(sltpApplyOnReleaseFixEnabled(GUARD_ON), 'A6-1 default ON');
assert(previewReplayDragFixEnabled(GUARD_ON), '#4 default ON');
assert(!orderInteractionGuardV2Enabled(GUARD_OFF), 'master guard OFF when disabled');
assert(!sltpApplyOnReleaseFixEnabled(GUARD_OFF), 'A6-1 OFF when master OFF');
assert(!sltpApplyOnReleaseFixEnabled({ ...GUARD_ON, ...A6_OFF }), 'A6-1 OFF when item disabled');

section('provisional lifecycle');
let st = createProvisionalEditState();
beginProvisionalEdit(st, { phase: 'open', lineKind: 'sl', orderId: 7, committedPrice: 1.09 });
updateProvisionalPrice(st, 1.085);
assert(st.provisionalPrice === 1.085 && st.committedPrice === 1.09, 'provisional updates without touching committed snapshot');
const { committed, state: idleAfterCommit } = commitProvisionalEdit(st);
assert(committed === 1.085 && idleAfterCommit.phase === 'idle', 'commit returns price and resets state');
st = beginProvisionalEdit(createProvisionalEditState(), { phase: 'preview', lineKind: 'sl', committedPrice: 1.1 });
updateProvisionalPrice(st, 1.095);
const { revertPrice, state: idleAfterCancel } = cancelProvisionalEdit(st);
assert(revertPrice === 1.1 && idleAfterCancel.phase === 'idle', 'cancel reverts to committed (edge b)');

section('RC5-OI-1 GREEN — store unchanged during drag');
const pos = { id: 1, stopLoss: 1.09, takeProfit: 1.11, type: 'BUY' };
const dragState = createProvisionalEditState();
beginProvisionalEdit(dragState, { phase: 'open', lineKind: 'sl', orderId: 1, committedPrice: 1.09 });
const tick = applyOnReleaseDragTick(pos, dragState, 1.085, GUARD_ON);
assert(pos.stopLoss === 1.09, 'store stopLoss unchanged while dragging');
assert(tick.hitTestPrice === 1.09, 'hit-test uses committed SL not provisional');
assert(tick.storePrice === 1.09, 'store price stable');

section('RC5-OI-1 edge (a) — committed SL cross fires during drag');
assert(wouldBuySlHit(1.089, tick.hitTestPrice), 'bar low crossing committed SL would close (edge a)');

section('RC5-OI-1 RED — legacy live mutation (switch OFF)');
const posLegacy = { id: 2, stopLoss: 1.09 };
legacyMutateStopLossDuringDrag(posLegacy, 1.085);
assert(posLegacy.stopLoss === 1.085, 'legacy mutates store during drag');
const redTick = applyOnReleaseDragTick({ id: 3, stopLoss: 1.09 }, createProvisionalEditState(), 1.085, { ...GUARD_ON, ...A6_OFF });
assert(redTick.storePrice === 1.085, 'A6-1 OFF mutates store on drag tick');

section('RC5-OI-1 edge (b) — cancel discards provisional');
const posB = { id: 4, stopLoss: 1.09 };
const stB = beginProvisionalEdit(createProvisionalEditState(), {
    phase: 'open', lineKind: 'sl', orderId: 4, committedPrice: 1.09,
});
updateProvisionalPrice(stB, 1.08);
const cancelled = cancelProvisionalEdit(stB);
assert(posB.stopLoss === 1.09, 'cancel does not write store');
assert(cancelled.revertPrice === 1.09, 'cancel returns committed for visual revert');

section('shouldSuppressSltpHits — D-020 does not block committed hits');
const omDraggingTp = { _isDraggingOrderLine: true, _draggingManagedOpenLineKind: 'tp' };
assert(shouldSuppressSltpHits(omDraggingTp, { id: 1 }, 'tp', GUARD_OFF), 'legacy suppresses TP during TP drag');
assert(!shouldSuppressSltpHits(omDraggingTp, { id: 1 }, 'tp', GUARD_ON), 'A6-1 ON: committed TP hits not suppressed');
assert(!shouldSuppressSltpHits(omDraggingTp, { id: 1 }, 'sl', GUARD_ON), 'A6-1 ON: SL hits not suppressed during TP drag');

section('getSltpHitTestPrice defensive committed read');
const omOpen = {
    _orderProvisionalEdit: beginProvisionalEdit(createProvisionalEditState(), {
        phase: 'open', lineKind: 'sl', orderId: 5, committedPrice: 1.09,
    }),
};
updateProvisionalPrice(omOpen._orderProvisionalEdit, 1.07);
assert(getSltpHitTestPrice({ id: 5, stopLoss: 1.09 }, 'sl', omOpen, GUARD_ON) === 1.09, 'hit-test reads committed');

section('RC5-OI-2 — shouldDeferReplayPreviewSync');
const omPreview = { isDraggingPreviewLine: true, _orderProvisionalEdit: createProvisionalEditState() };
assert(shouldDeferReplayPreviewSync(omPreview, GUARD_ON), 'defers when isDraggingPreviewLine');
omPreview.isDraggingPreviewLine = false;
beginProvisionalEdit(omPreview._orderProvisionalEdit, { phase: 'preview', lineKind: 'sl', committedPrice: 1.1 });
assert(shouldDeferReplayPreviewSync(omPreview, GUARD_ON), 'defers during provisional preview edit');
assert(!shouldDeferReplayPreviewSync(omPreview, { ...GUARD_ON, ...HASH4_OFF }) && !omPreview.isDraggingPreviewLine,
    '#4 OFF: only legacy isDraggingPreviewLine gate (false here)');

section('commit on release');
const posRelease = { id: 6, stopLoss: 1.09 };
const stRelease = beginProvisionalEdit(createProvisionalEditState(), {
    phase: 'open', lineKind: 'sl', orderId: 6, committedPrice: 1.09,
});
updateProvisionalPrice(stRelease, 1.087);
const { committed: released } = commitProvisionalEdit(stRelease);
posRelease.stopLoss = released;
assert(posRelease.stopLoss === 1.087, 'release commits provisional once');

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
