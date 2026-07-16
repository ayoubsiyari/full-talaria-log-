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
    draftScaleRefreshFixEnabled,
    getSltpHitTestPrice,
    legacyMutateStopLossDuringDrag,
    orderInteractionGuardV2Enabled,
    previewLineYFromStorePrice,
    previewReplayDragFixEnabled,
    priceAxisIsolationFixEnabled,
    shouldBlockOrderStoreWriteDuringAxisGesture,
    shouldDeferReplayPreviewSync,
    shouldRefreshDraftGeometryOnly,
    shouldSuppressSltpHits,
    simulateOpenLineDragStoreWrite,
    sltpApplyOnReleaseFixEnabled,
    syncPreviewLinePriceFromStore,
    updateProvisionalPrice,
    wouldBuySlHit,
} from './order-interaction-guard.mjs';

const GUARD_ON = {};
const GUARD_OFF = { __TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2: true };
const A6_OFF = { __TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX: true };
const HASH4_OFF = { __TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX: true };
const HASH5_OFF = { __TALARIA_DISABLE_ORDER_DRAFT_SCALE_REFRESH_FIX: true };
const A63_OFF = { __TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX: true };

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
assert(draftScaleRefreshFixEnabled(GUARD_ON), '#5 default ON');
assert(priceAxisIsolationFixEnabled(GUARD_ON), 'A6-3 default ON');
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

section('RC5-OI-3 — #5 draft scale refresh from store');
const storeEntry = 1.095;
let driftedLinePrice = 1.080;
const synced = syncPreviewLinePriceFromStore(driftedLinePrice, storeEntry, true);
assert(synced === storeEntry, 'sync preview cache from store when fix ON');
const legacySync = syncPreviewLinePriceFromStore(driftedLinePrice, storeEntry, false);
assert(legacySync === driftedLinePrice, 'legacy keeps drifted preview cache (RED)');
const yScaleBefore = (p) => 500 - p * 10000;
const yScaleAfterPan = (p) => 520 - p * 10000;
const yBefore = previewLineYFromStorePrice(driftedLinePrice, yScaleBefore);
const yGreen = previewLineYFromStorePrice(storeEntry, yScaleAfterPan);
assert(yBefore != null && yGreen != null, 'Y derived from store price on new scale');
const omDraft = { isDraggingPreviewLine: false, _orderProvisionalEdit: createProvisionalEditState() };
beginProvisionalEdit(omDraft._orderProvisionalEdit, { phase: 'preview', lineKind: 'sl', committedPrice: 1.09 });
assert(shouldRefreshDraftGeometryOnly(omDraft, GUARD_ON), 'geometry-only during provisional preview');
assert(!shouldRefreshDraftGeometryOnly(omDraft, { ...GUARD_ON, ...HASH5_OFF }), '#5 OFF disables geometry-only guard');

section('RC5-OI-4 — A6-3 order store invariant during axis gesture');
const axisChart = { _isPriceAxisZoomDragging: () => true };
const posAxis = { id: 9, openPrice: 1.10, stopLoss: 1.09, takeProfit: 1.12 };
const blocked = simulateOpenLineDragStoreWrite(posAxis, 'sl', 1.05, true, GUARD_ON);
assert(!blocked && posAxis.stopLoss === 1.09, 'axis gesture blocks SL store write (GREEN)');
const redWrite = simulateOpenLineDragStoreWrite(posAxis, 'sl', 1.05, true, { ...GUARD_ON, ...A63_OFF });
assert(redWrite && posAxis.stopLoss === 1.05, 'A6-3 OFF mutates store on axis drag (RED)');
assert(shouldBlockOrderStoreWriteDuringAxisGesture(axisChart, GUARD_ON), 'shouldBlock when axis active');
assert(!shouldBlockOrderStoreWriteDuringAxisGesture(axisChart, GUARD_OFF), 'master OFF allows writes');

console.log(`\n=== ${passed} passed, ${failed} failed ===`);
if (failed > 0) process.exit(1);
