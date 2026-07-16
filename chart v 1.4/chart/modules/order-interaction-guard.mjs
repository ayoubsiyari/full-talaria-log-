/**
 * RC-5 order-interaction guard — provisional SL/TP edit model (D-020 / T4 landing).
 * Node property tests import this module; browser mirrors logic in order-manager.js.
 */

export const PROVISIONAL_PHASE_IDLE = 'idle';
export const PROVISIONAL_PHASE_PREVIEW = 'preview';
export const PROVISIONAL_PHASE_OPEN = 'open';
export const PROVISIONAL_PHASE_PENDING = 'pending';

/** @typedef {'idle'|'preview'|'open'|'pending'} ProvisionalPhase */
/** @typedef {'entry'|'sl'|'tp'|'be'|null} ProvisionalLineKind */

/**
 * @typedef {Object} OrderProvisionalEdit
 * @property {ProvisionalPhase} phase
 * @property {ProvisionalLineKind} lineKind
 * @property {number|null} orderId
 * @property {string|null} splitGroupId
 * @property {string|null} previewLabel
 * @property {number|null} tpTargetIndex
 * @property {number|null} provisionalPrice
 * @property {number|null} committedPrice
 */

/** @param {object} [scope] */
export function resolveScope(scope) {
    if (scope) return scope;
    if (typeof globalThis !== 'undefined') return globalThis;
    return {};
}

/** Master guard — default ON (fix active when unset). */
export function orderInteractionGuardV2Enabled(scope) {
    const g = resolveScope(scope);
    if (g.__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2 === true) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_INTERACTION_GUARD_V2 === '0') return false;
    return true;
}

/** A6-1 apply-on-release — default ON when master guard ON. */
export function sltpApplyOnReleaseFixEnabled(scope) {
    if (!orderInteractionGuardV2Enabled(scope)) return false;
    const g = resolveScope(scope);
    if (g.__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX === true) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_SLTP_APPLY_ON_RELEASE_FIX === '0') return false;
    return true;
}

/** #4 preview replay × drag — default ON when master guard ON. */
export function previewReplayDragFixEnabled(scope) {
    if (!orderInteractionGuardV2Enabled(scope)) return false;
    const g = resolveScope(scope);
    if (g.__TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX === true) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_PREVIEW_REPLAY_DRAG_FIX === '0') return false;
    return true;
}

/** @returns {OrderProvisionalEdit} */
export function createProvisionalEditState() {
    return {
        phase: PROVISIONAL_PHASE_IDLE,
        lineKind: null,
        orderId: null,
        splitGroupId: null,
        previewLabel: null,
        tpTargetIndex: null,
        provisionalPrice: null,
        committedPrice: null,
    };
}

/**
 * @param {OrderProvisionalEdit} state
 * @param {Object} opts
 * @returns {OrderProvisionalEdit}
 */
export function beginProvisionalEdit(state, opts = {}) {
    const base = state || createProvisionalEditState();
    const committed = Number(opts.committedPrice);
    base.phase = opts.phase || PROVISIONAL_PHASE_OPEN;
    base.lineKind = opts.lineKind ?? null;
    base.orderId = opts.orderId ?? null;
    base.splitGroupId = opts.splitGroupId ?? null;
    base.previewLabel = opts.previewLabel ?? null;
    base.tpTargetIndex = opts.tpTargetIndex ?? null;
    base.committedPrice = Number.isFinite(committed) ? committed : null;
    base.provisionalPrice = base.committedPrice;
    return base;
}

/** @param {OrderProvisionalEdit} state @param {number} price */
export function updateProvisionalPrice(state, price) {
    if (!state || state.phase === PROVISIONAL_PHASE_IDLE) return state;
    const p = Number(price);
    if (Number.isFinite(p)) state.provisionalPrice = p;
    return state;
}

/**
 * @param {OrderProvisionalEdit} state
 * @returns {{ committed: number|null, state: OrderProvisionalEdit }}
 */
export function commitProvisionalEdit(state) {
    if (!state || state.phase === PROVISIONAL_PHASE_IDLE) {
        return { committed: null, state: createProvisionalEditState() };
    }
    const committed = Number.isFinite(Number(state.provisionalPrice))
        ? Number(state.provisionalPrice)
        : null;
    return { committed, state: createProvisionalEditState() };
}

/**
 * @param {OrderProvisionalEdit} state
 * @returns {{ revertPrice: number|null, state: OrderProvisionalEdit }}
 */
export function cancelProvisionalEdit(state) {
    const revertPrice = state?.committedPrice ?? null;
    return { revertPrice, state: createProvisionalEditState() };
}

/** @param {OrderProvisionalEdit|null|undefined} state */
export function isProvisionalEditActive(state) {
    return !!(state && state.phase !== PROVISIONAL_PHASE_IDLE);
}

/** @param {OrderProvisionalEdit|null|undefined} state */
export function isProvisionalOpenEdit(state) {
    return state?.phase === PROVISIONAL_PHASE_OPEN;
}

/** @param {OrderProvisionalEdit|null|undefined} state */
export function isProvisionalPreviewEdit(state) {
    return state?.phase === PROVISIONAL_PHASE_PREVIEW;
}

/**
 * Hit-test price for SL/TP — committed value during provisional open drag (D-020 §1).
 * @param {{ stopLoss?: number, takeProfit?: number, id?: number }} position
 * @param {'sl'|'tp'} kind
 * @param {{ _orderProvisionalEdit?: OrderProvisionalEdit }} [om]
 * @param {object} [scope]
 */
export function getSltpHitTestPrice(position, kind, om, scope) {
    const storeVal = kind === 'sl' ? position.stopLoss : position.takeProfit;
    if (!sltpApplyOnReleaseFixEnabled(scope)) return storeVal;
    const st = om?._orderProvisionalEdit;
    if (
        isProvisionalOpenEdit(st)
        && st.orderId === position.id
        && st.lineKind === kind
        && Number.isFinite(Number(st.committedPrice))
    ) {
        return Number(st.committedPrice);
    }
    return storeVal;
}

/**
 * Whether updatePositions should skip TP hits (legacy) or provisional evaluation.
 * D-020: when apply-on-release ON, store holds committed values — do not suppress committed hits.
 * @param {{ _isDraggingOrderLine?: boolean, _draggingManagedOpenLineKind?: string }} om
 * @param {{ id?: number }} position
 * @param {'sl'|'tp'} kind
 * @param {object} [scope]
 */
export function shouldSuppressSltpHits(om, position, kind, scope) {
    if (!sltpApplyOnReleaseFixEnabled(scope)) {
        return !!(
            om
            && om._isDraggingOrderLine
            && om._draggingManagedOpenLineKind === 'tp'
            && kind === 'tp'
        );
    }
    const st = om?._orderProvisionalEdit;
    if (!isProvisionalOpenEdit(st) || !position) return false;
    if (st.orderId !== position.id) return false;
    if (st.lineKind !== kind) return false;
    return false;
}

/**
 * #4 — defer replay preview sync while provisional preview edit is active.
 * @param {{ isDraggingPreviewLine?: boolean, _orderProvisionalEdit?: OrderProvisionalEdit }} om
 * @param {object} [scope]
 */
export function shouldDeferReplayPreviewSync(om, scope) {
    if (!om) return false;
    if (!previewReplayDragFixEnabled(scope)) {
        return !!om.isDraggingPreviewLine;
    }
    if (om.isDraggingPreviewLine) return true;
    return isProvisionalPreviewEdit(om._orderProvisionalEdit);
}

/** #5 placeholder — geometry refresh without store mutation (Phase 3). */
export function shouldRefreshDraftGeometryOnly(om, scope) {
    if (!orderInteractionGuardV2Enabled(scope) || !om) return false;
    return isProvisionalPreviewEdit(om._orderProvisionalEdit) || !!om.isDraggingPreviewLine;
}

/** A6-3 placeholder — read chart axis gesture (Phase 4). */
export function isChartAxisGestureActive(chart) {
    if (!chart || typeof chart._isPriceAxisZoomDragging !== 'function') return false;
    try {
        return !!chart._isPriceAxisZoomDragging();
    } catch {
        return false;
    }
}

/**
 * Simulate legacy live SL mutation during drag (RED path for RC5-OI-1).
 * @param {{ stopLoss: number }} position
 * @param {number} dragPrice
 */
export function legacyMutateStopLossDuringDrag(position, dragPrice) {
    position.stopLoss = dragPrice;
    return position.stopLoss;
}

/**
 * Simulate apply-on-release drag tick — store unchanged, provisional updated.
 * @param {{ stopLoss: number }} position
 * @param {OrderProvisionalEdit} state
 * @param {number} dragPrice
 * @param {object} [scope]
 */
export function applyOnReleaseDragTick(position, state, dragPrice, scope) {
    if (!sltpApplyOnReleaseFixEnabled(scope)) {
        legacyMutateStopLossDuringDrag(position, dragPrice);
        return { storePrice: position.stopLoss, hitTestPrice: position.stopLoss };
    }
    updateProvisionalPrice(state, dragPrice);
    const hitTestPrice = getSltpHitTestPrice(position, 'sl', { _orderProvisionalEdit: state }, scope);
    return { storePrice: position.stopLoss, hitTestPrice };
}

/**
 * BUY SL hit against committed price (edge cell a).
 * @param {number} barLow
 * @param {number} slPrice
 */
export function wouldBuySlHit(barLow, slPrice) {
    return Number.isFinite(barLow) && Number.isFinite(slPrice) && barLow <= slPrice;
}
