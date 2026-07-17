/**
 * A6-2 — pure runtime order persistence model (session-scoped, D-019).
 * Node tests import this module; browser mirrors logic in order-manager.js.
 */

export const ORDER_RUNTIME_SESSION_STORAGE_KEY = 'chart_orders_runtime_session_v1';

/** I16 — persisted order/trade row schema (additive; bump only with migration). */
export const ORDER_RECORD_SCHEMA_VERSION = 1;

/** @param {object} [scope] */
export function resolveScope(scope) {
    if (scope) return scope;
    if (typeof globalThis !== 'undefined') return globalThis;
    return {};
}

/** Default ON when unset. */
export function orderPersistenceV1Enabled(scope) {
    const g = resolveScope(scope);
    if (g.__TALARIA_DISABLE_ORDER_PERSISTENCE_V1 === true) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_PERSISTENCE_V1 === '0') return false;
    return true;
}

/** I16 — stamp build_id + schema_version on persisted rows. Default ON when unset. */
export function orderPersistStampV1Enabled(scope) {
    const g = resolveScope(scope);
    if (g.__TALARIA_DISABLE_ORDER_PERSIST_STAMP_V1 === true) return false;
    return true;
}

/** @param {object} [scope] */
export function resolvePersistBuildId(scope) {
    const g = resolveScope(scope);
    const id = g.__TALARIA_CHART_BUILD_ID;
    if (id == null) return null;
    const s = String(id).trim();
    return s || null;
}

/**
 * Additive I16 stamp on one order/trade row (never removes legacy fields).
 * @param {object|null|undefined} record
 * @param {{ buildId?: string|null, scope?: object, win?: object, onlyIfMissing?: boolean }} [ctx]
 */
export function stampPersistedOrderRecord(record, ctx = {}) {
    if (!record || typeof record !== 'object') return record;
    const scope = ctx.scope || ctx.win;
    if (!orderPersistStampV1Enabled(scope)) return record;
    if (ctx.onlyIfMissing && record.build_id != null && record.schema_version != null) return record;
    const buildId = ctx.buildId !== undefined ? ctx.buildId : resolvePersistBuildId(scope);
    return {
        ...record,
        build_id: buildId,
        schema_version: ORDER_RECORD_SCHEMA_VERSION,
    };
}

/** @param {object[]|null|undefined} records */
export function stampPersistedOrderRecords(records, ctx = {}) {
    if (!Array.isArray(records)) return records;
    if (!orderPersistStampV1Enabled(ctx.scope || ctx.win)) return records;
    return records.map((row) => stampPersistedOrderRecord(row, ctx));
}

/**
 * @param {string|null|undefined} sessionId
 * @param {string|null|undefined} [panelScope]
 * @returns {string}
 */
export function runtimeOrderStorageKey(sessionId, panelScope = null) {
    const sid = sessionId != null && String(sessionId).trim() !== '' ? String(sessionId).trim() : 'no-session';
    let key = `${ORDER_RUNTIME_SESSION_STORAGE_KEY}:${sid}`;
    if (panelScope) key += `:panel:${String(panelScope)}`;
    return key;
}

/**
 * @param {object[]} pendingOrders
 * @param {object[]} openPositions
 * @param {object} accountRuntime
 * @param {object} orderCounters
 */
export function buildRuntimeOrderPatch(pendingOrders, openPositions, accountRuntime, orderCounters, ctx = {}) {
    const safeClone = (arr) => {
        try {
            return JSON.parse(JSON.stringify(Array.isArray(arr) ? arr : []));
        } catch {
            return [];
        }
    };
    const scope = ctx.scope || ctx.win;
    const stampCtx = { ...ctx, scope };
    return {
        pending_orders: stampPersistedOrderRecords(safeClone(pendingOrders), stampCtx),
        open_positions: stampPersistedOrderRecords(safeClone(openPositions), stampCtx),
        account_runtime: accountRuntime && typeof accountRuntime === 'object' ? { ...accountRuntime } : {},
        order_counters: orderCounters && typeof orderCounters === 'object' ? { ...orderCounters } : {},
        savedAt: Date.now(),
    };
}

/** @param {object|null|undefined} patch */
export function serializeRuntimeOrderPatch(patch) {
    if (!patch || typeof patch !== 'object') return null;
    try {
        return JSON.stringify(patch);
    } catch {
        return null;
    }
}

/** @param {string|null|undefined} raw */
export function deserializeRuntimeOrderPatch(raw) {
    if (!raw || typeof raw !== 'string') return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

/** @param {object|null|undefined} patch */
export function hasRestorableRuntimeOrders(patch) {
    if (!patch || typeof patch !== 'object') return false;
    const pending = Array.isArray(patch.pending_orders) ? patch.pending_orders.length : 0;
    const open = Array.isArray(patch.open_positions) ? patch.open_positions.length : 0;
    return pending > 0 || open > 0;
}

/**
 * Detect duplicate order ids across pending + open (ghost-order guard).
 * @param {object|null|undefined} patch
 */
export function countDuplicateOrderIds(patch) {
    if (!patch) return 0;
    const ids = new Set();
    let dup = 0;
    const scan = (arr) => {
        for (const item of arr || []) {
            const id = item?.id;
            if (id == null) continue;
            const k = String(id);
            if (ids.has(k)) dup += 1;
            else ids.add(k);
        }
    };
    scan(patch.pending_orders);
    scan(patch.open_positions);
    return dup;
}

/**
 * Apply restored patch to a minimal store model (property tests).
 * @param {{ pendingOrders: object[], openPositions: object[], balance?: number, orderIdCounter?: number }} store
 * @param {object} patch
 */
export function applyRuntimeOrderPatchToStore(store, patch) {
    if (!store || !patch) return store;
    if (Array.isArray(patch.pending_orders)) store.pendingOrders = patch.pending_orders.map((o) => ({ ...o }));
    if (Array.isArray(patch.open_positions)) store.openPositions = patch.open_positions.map((o) => ({ ...o }));
    const ar = patch.account_runtime;
    if (ar && typeof ar === 'object') {
        const bal = Number.parseFloat(ar.balance);
        if (Number.isFinite(bal)) store.balance = bal;
    }
    const oc = patch.order_counters;
    if (oc && typeof oc === 'object') {
        const c = Number.parseInt(oc.orderIdCounter, 10);
        if (Number.isFinite(c) && c > 0) store.orderIdCounter = c;
    }
    return store;
}

/**
 * Legacy path wrote localStorage — V1 uses sessionStorage only.
 * @param {'session'|'local'|null} backend
 */
export function persistenceBackendForFixEnabled(fixOn, backend) {
    if (!fixOn) return backend === 'local' ? 'local' : null;
    return 'session';
}
