/**
 * A6-4 host-canonical order store — snapshot + command helpers (pure).
 * Run: node order-host-store.test.mjs
 */

import {
    orderMcHostPersistOnlyV1Enabled,
    orderMcHostPlaceV1Enabled,
    orderMcJournalSnapshotV1Enabled,
    orderMcLegacyIframeOrderV1Enabled,
    orderMcOpenPatchV1Enabled,
    orderMcPnlHubV1Enabled,
    orderMcReadyPanelsSnapshotV1Enabled,
    orderMcSnapshotProjectionV1Enabled,
    orderMcStateConvergeFixEnabled,
} from './order-owning-panel-price.mjs';
import {
    stampPersistedOrderRecords,
} from './order-runtime-persist.mjs';

export {
    orderMcHostPersistOnlyV1Enabled,
    orderMcHostPlaceV1Enabled,
    orderMcJournalSnapshotV1Enabled,
    orderMcLegacyIframeOrderV1Enabled,
    orderMcOpenPatchV1Enabled,
    orderMcPnlHubV1Enabled,
    orderMcReadyPanelsSnapshotV1Enabled,
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
export function buildHostOrderStoreSnapshot(om, sessionId, version = 0, ctx = {}) {
    if (!om) {
        return {
            version,
            sessionId: sessionId || null,
            pendingOrders: [],
            openPositions: [],
            closedPositions: [],
            tradeJournal: [],
            orders: [],
            account: {},
            counters: {},
        };
    }
    const pendingOrders = cloneOrderList(om.pendingOrders);
    const openPositions = cloneOrderList(om.openPositions);
    const closedRecent = cloneOrderList(om.closedPositions).slice(-50);
    // Exit ticks on peers must use host-canonical closePrice + exitMarkerTimeMs.
    const journalRecent = orderMcJournalSnapshotV1Enabled(ctx.win || ctx.scope || {})
        ? cloneOrderList(om.tradeJournal).slice(-100)
        : [];
    const orders = cloneOrderList(om.orders);
    const scope = ctx.scope || ctx.win || (typeof globalThis !== 'undefined' ? globalThis : {});
    const stampCtx = { ...ctx, scope };
    return {
        version: Number(version) || 0,
        sessionId: sessionId != null ? String(sessionId) : null,
        pendingOrders: stampPersistedOrderRecords(pendingOrders, stampCtx),
        openPositions: stampPersistedOrderRecords(openPositions, stampCtx),
        closedPositions: stampPersistedOrderRecords(closedRecent, stampCtx),
        tradeJournal: stampPersistedOrderRecords(journalRecent, stampCtx),
        orders: stampPersistedOrderRecords(orders, stampCtx),
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
        // fileId match sufficient; symbol fallback (keep same-symbol split siblings)
        if (fid && rowFid && rowFid === fid) return true;
        if (sym && rowSym && rowSym === sym) return true;
        return false;
    };
    const expandSplit = (matched, all) => {
        const gids = new Set(
            matched.filter((o) => o?.isSplitEntry && o.splitGroupId != null)
                .map((o) => String(o.splitGroupId))
        );
        if (!gids.size) return matched;
        const byId = new Map(matched.filter((o) => o?.id != null).map((o) => [o.id, o]));
        for (const o of all || []) {
            if (!o?.isSplitEntry || o.id == null || o.splitGroupId == null) continue;
            if (!gids.has(String(o.splitGroupId))) continue;
            if (!byId.has(o.id)) byId.set(o.id, o);
        }
        return [...byId.values()];
    };
    const openAll = snapshot?.openPositions || [];
    const pendingAll = snapshot?.pendingOrders || [];
    const journalAll = snapshot?.tradeJournal || [];
    return {
        version: snapshot?.version || 0,
        visibleOpen: expandSplit(openAll.filter(matchRow), openAll),
        visiblePending: expandSplit(pendingAll.filter(matchRow), pendingAll),
        visibleJournal: journalAll.filter(matchRow),
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

/** Panel ids in readyPanels that have not yet received host order prime. */
export function collectUnsyncedReadyPanelIds(readyPanelIds, syncedSet, hostPanelId = 'A') {
    const out = [];
    for (const panelId of readyPanelIds || []) {
        if (panelId === hostPanelId) continue;
        if (syncedSet && syncedSet.has(panelId)) continue;
        out.push(panelId);
    }
    return out;
}

/**
 * Fan host OM snapshot to ready iframe panels via applyOrderSnapshot.
 * Pure — caller supplies runCommand + manager chart registry.
 */
export function fanOutHostOrderSnapshotToIframes(deps) {
    const {
        excludePanelId = null,
        managerCharts,
        runCommand,
        chart,
        versionHolder = { current: 0 },
        runtimeOnly = false,
    } = deps || {};

    const om = chart?.orderManager;
    if (!om || typeof runCommand !== 'function') {
        return { ok: false, reason: 'missing-deps', panelIds: [] };
    }

    versionHolder.current = (Number(versionHolder.current) || 0) + 1;
    const sessionId = typeof chart.getActiveTradingSessionId === 'function'
        ? chart.getActiveTradingSessionId()
        : null;
    const snap = buildHostOrderStoreSnapshot(om, sessionId, versionHolder.current, { win: deps?.win });

    const panelIds = [];
    if (managerCharts && typeof managerCharts.values === 'function') {
        for (const c of managerCharts.values()) {
            if (!c || !c.ready || c.host || c.id === excludePanelId) continue;
            panelIds.push(c.id);
            try {
                const p = runCommand(
                    'applyOrderSnapshot',
                    { snapshot: snap, runtimeOnly: runtimeOnly === true },
                    { panelId: c.id },
                );
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) {}
        }
    }
    return {
        ok: panelIds.length > 0,
        panelIds,
        snapshotVersion: versionHolder.current,
        openCount: (snap.openPositions || []).length,
        pendingCount: (snap.pendingOrders || []).length,
    };
}

/**
 * A6-4 Step 3 completion — when a panel becomes bridge-ready, prime its
 * order lines from the host store. Snapshot ON → applyOrderSnapshot fan-out;
 * legacy → per-order addOrder (blocked when Step 3 blocks iframe addOrder).
 */
export function primeReadyPanelsWithHostOrders(deps) {
    const {
        readyPanelIds,
        syncedSet,
        hostPanelId = 'A',
        orderManager,
        grid,
        managerCharts,
        chart,
        versionHolder = { current: 0 },
        win = {},
    } = deps || {};

    const newPanelIds = collectUnsyncedReadyPanelIds(readyPanelIds, syncedSet, hostPanelId);
    if (newPanelIds.length === 0) {
        return { ok: true, action: 'none', newPanelIds: [] };
    }

    const runCommand = grid && typeof grid.runCommand === 'function' ? grid.runCommand.bind(grid) : null;
    const hostChart = chart || (win && win.chart) || null;
    const openN = Array.isArray(orderManager?.openPositions) ? orderManager.openPositions.length : 0;
    const pendN = Array.isArray(orderManager?.pendingOrders) ? orderManager.pendingOrders.length : 0;
    const hostHasLiveOrders = (openN + pendN) > 0;
    // F5 race: bridge-ready often fires before session restore fills the host
    // OM. Marking peers synced on an empty fan-out permanently skips them —
    // only stamp synced when the host already has live rows (or after a later
    // restore fan-out path).
    if (hostHasLiveOrders) {
        for (const id of newPanelIds) syncedSet.add(id);
    }

    if (orderMcReadyPanelsSnapshotV1Enabled(win)) {
        const fan = fanOutHostOrderSnapshotToIframes({
            excludePanelId: null,
            managerCharts,
            runCommand,
            chart: hostChart || { orderManager },
            versionHolder,
        });
        return {
            ok: fan.ok,
            action: 'applyOrderSnapshot',
            newPanelIds,
            fanOut: fan,
            deferredSync: !hostHasLiveOrders,
        };
    }

    if (!runCommand || !orderManager) {
        return { ok: false, action: 'addOrder', newPanelIds, reason: 'missing-grid-or-om' };
    }

    const addOrderCalls = [];
    const openPositions = Array.isArray(orderManager.openPositions) ? orderManager.openPositions : [];
    const pendingOrders = Array.isArray(orderManager.pendingOrders) ? orderManager.pendingOrders : [];
    for (const panelId of newPanelIds) {
        for (const pos of openPositions) {
            if (!pos || pos.id == null) continue;
            try {
                const p = runCommand('addOrder', { order: pos, kind: 'opened' }, { panelId });
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) {}
            addOrderCalls.push({ panelId, kind: 'opened', orderId: pos.id });
        }
        for (const pend of pendingOrders) {
            if (!pend || pend.id == null) continue;
            try {
                const p = runCommand('addOrder', { order: pend, kind: 'pending' }, { panelId });
                if (p && typeof p.catch === 'function') p.catch(() => {});
            } catch (_) {}
            addOrderCalls.push({ panelId, kind: 'pending', orderId: pend.id });
        }
    }
    return { ok: true, action: 'addOrder', newPanelIds, addOrderCalls };
}
