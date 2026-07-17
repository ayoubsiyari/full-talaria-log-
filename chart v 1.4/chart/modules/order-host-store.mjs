/**
 * A6-4 host-canonical order store — snapshot + command helpers (pure).
 * Run: node order-host-store.test.mjs
 */

import {
    orderMcHostPersistOnlyV1Enabled,
    orderMcHostPlaceV1Enabled,
    orderMcLegacyIframeOrderV1Enabled,
    orderMcOpenPatchV1Enabled,
    orderMcPnlHubV1Enabled,
    orderMcSnapshotProjectionV1Enabled,
    orderMcStateConvergeFixEnabled,
} from './order-owning-panel-price.mjs';

export {
    orderMcHostPersistOnlyV1Enabled,
    orderMcHostPlaceV1Enabled,
    orderMcLegacyIframeOrderV1Enabled,
    orderMcOpenPatchV1Enabled,
    orderMcPnlHubV1Enabled,
    orderMcSnapshotProjectionV1Enabled,
    orderMcStateConvergeFixEnabled,
};

export function cloneOrderList(arr) {
    try {
        return JSON.parse(JSON.stringify(Array.isArray(arr) ? arr : []));
    } catch (_) {
        return [];
    }
}

/** Build host-canonical snapshot from live OrderManager fields. */
export function buildHostOrderStoreSnapshot(om, sessionId, version = 0) {
    if (!om) {
        return {
            version,
            sessionId: sessionId || null,
            pendingOrders: [],
            openPositions: [],
            closedPositions: [],
            orders: [],
            account: {},
            counters: {},
        };
    }
    const pendingOrders = cloneOrderList(om.pendingOrders);
    const openPositions = cloneOrderList(om.openPositions);
    const closedRecent = cloneOrderList(om.closedPositions).slice(-50);
    const orders = cloneOrderList(om.orders);
    return {
        version: Number(version) || 0,
        sessionId: sessionId != null ? String(sessionId) : null,
        pendingOrders,
        openPositions,
        closedPositions: closedRecent,
        orders,
        account: {
            balance: om.balance,
            equity: om.equity,
            initialBalance: om.initialBalance,
            sessionCurrentTime: om.orderService?.multiInstrumentSession?.current_time,
        },
        counters: {
            orderIdCounter: om.orderIdCounter,
            tradeGroupIdCounter: om.tradeGroupIdCounter,
        },
    };
}

/** Filter snapshot rows visible on a panel (symbol + optional fileId). */
export function filterSnapshotForPanel(snapshot, panelMeta, normalizeTicker) {
    const norm = typeof normalizeTicker === 'function'
        ? normalizeTicker
        : (t) => String(t || '').replace(/[/\s]/g, '').toUpperCase();
    const sym = norm(panelMeta?.symbol || panelMeta?.ticker || '');
    const fid = panelMeta?.fileId != null ? String(panelMeta.fileId) : '';
    const matchRow = (row) => {
        if (!row) return false;
        const rowSym = norm(row.symbol || row.ticker || '');
        const rowFid = row.sourceFileId != null ? String(row.sourceFileId) : '';
        if (fid && rowFid) return rowFid === fid;
        if (sym && rowSym) return rowSym === sym;
        return false;
    };
    return {
        version: snapshot?.version || 0,
        visibleOpen: (snapshot?.openPositions || []).filter(matchRow),
        visiblePending: (snapshot?.pendingOrders || []).filter(matchRow),
    };
}

/** When ON, iframe must not mutate store via register* — snapshot projection only. */
export function shouldBlockIframeStoreMutation(isEmbedIframe, win = {}) {
    if (!isEmbedIframe) return false;
    if (!orderMcSnapshotProjectionV1Enabled(win)) return false;
    return true;
}

/** When ON, all placement commands route to host OM. */
export function shouldRoutePlaceOrderToHost(isEmbedIframe, win = {}) {
    if (!isEmbedIframe) return false;
    return orderMcHostPlaceV1Enabled(win);
}

/** When ON, iframe-order opened/pending echo is retired (snapshot-only). */
export function shouldSuppressLegacyIframeOrderEcho(win = {}) {
    return !orderMcLegacyIframeOrderV1Enabled(win);
}
