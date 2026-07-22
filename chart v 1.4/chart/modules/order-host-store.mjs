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

/**
 * Live position / P&L fields only for runtimeOnly Play fan-out.
 * Explicitly omits closedPositions, tradeJournal, orders, screenshots,
 * and excursion / MFE-MAE history arrays (M19 hot-path bound).
 */
const RUNTIME_PNL_ROW_KEYS = [
    'id', 'symbol', 'ticker', 'sourceFileId',
    'status', 'type', 'direction',
    'openPrice', 'entryPrice', 'quantity', 'remainingQuantity',
    'stopLoss', 'takeProfit', 'tpTargets',
    'splitGroupId', 'splitIndex', 'isSplitEntry',
    'autoBreakeven', 'breakevenSettings',
    'unrealizedPnL', 'currentPrice', 'markPrice',
    'pendingOrderPrice', 'wasLimitOrder',
];

function slimRuntimePnlRow(row) {
    if (!row || typeof row !== 'object') return null;
    const out = {};
    for (let i = 0; i < RUNTIME_PNL_ROW_KEYS.length; i++) {
        const k = RUNTIME_PNL_ROW_KEYS[i];
        if (row[k] !== undefined) out[k] = row[k];
    }
    // Keep visual-shape TP targets; drop screenshot / excursion blobs if present.
    if (Array.isArray(out.tpTargets)) {
        out.tpTargets = out.tpTargets.map((t, index) => ({
            id: t && t.id != null ? t.id : index,
            price: Number(t && t.price) || 0,
            percentage: Number(t && t.percentage) || 0,
            hit: !!(t && t.hit),
        }));
    }
    if (out.breakevenSettings && typeof out.breakevenSettings === 'object') {
        out.breakevenSettings = {
            triggered: !!out.breakevenSettings.triggered,
            be_recalculated: !!out.breakevenSettings.be_recalculated,
        };
    }
    return out;
}

function slimRuntimePnlList(arr) {
    const src = Array.isArray(arr) ? arr : [];
    const out = [];
    for (let i = 0; i < src.length; i++) {
        const row = slimRuntimePnlRow(src[i]);
        if (row) out.push(row);
    }
    return out;
}

/**
 * Hot-path snapshot: live open/pending + account P&L only.
 * Never clones closedPositions, tradeJournal, orders, screenshots, or excursions.
 */
export function buildHostRuntimePnlSnapshot(om, sessionId, version = 0) {
    if (!om) {
        return {
            version: Number(version) || 0,
            sessionId: sessionId || null,
            runtimeOnly: true,
            pendingOrders: [],
            openPositions: [],
            account: {},
        };
    }
    return {
        version: Number(version) || 0,
        sessionId: sessionId != null ? String(sessionId) : null,
        runtimeOnly: true,
        pendingOrders: slimRuntimePnlList(om.pendingOrders),
        openPositions: slimRuntimePnlList(om.openPositions),
        account: {
            balance: om.balance,
            equity: om.equity,
            initialBalance: om.initialBalance,
            sessionCurrentTime: om.orderService?.multiInstrumentSession?.current_time,
        },
    };
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
 * Decide whether a manager/ReplaySystem replayFrame detail should trigger the
 * host-owned coalesced P&L schedule. Pure — no DOM / postMessage.
 *
 * Production call sites:
 *   - multichart-manager __multichartManagerBroadcastReplay (ReplaySystem fast path)
 *   - MultichartGrid CustomEvent fallback when manager broadcast is absent
 */
export function shouldScheduleHostPnlOnReplayFrame(detail, deps = {}) {
    const win = deps.win || (typeof globalThis !== 'undefined' ? globalThis : null);
    const killEnv = deps.kill === true
        || (win && win.__TALARIA_DISABLE_ORDER_MC_PNL_REPLAY_FRAME_HUB_V1 === true)
        || (win && win.__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1 === true);
    if (killEnv) return false;
    if (!detail || detail.isPlaying !== true) return false;
    const om = deps.orderManager
        || (win && win.chart && win.chart.orderManager)
        || null;
    const open = (deps.openPositions != null)
        ? deps.openPositions
        : ((om && om.openPositions) || []);
    const pending = (deps.pendingOrders != null)
        ? deps.pendingOrders
        : ((om && om.pendingOrders) || []);
    const live = (Array.isArray(open) ? open.length : 0)
        + (Array.isArray(pending) ? pending.length : 0);
    return live > 0;
}

/**
 * One host scheduler call from a replayFrame detail (manager fast path).
 * Returns true when schedule() was invoked.
 */
export function scheduleHostPnlFromReplayFrame(detail, deps = {}) {
    if (!shouldScheduleHostPnlOnReplayFrame(detail, deps)) return false;
    const schedule = deps.schedule
        || (deps.win && typeof deps.win.__multichartScheduleHostPnlFanout === 'function'
            ? deps.win.__multichartScheduleHostPnlFanout
            : null);
    if (typeof schedule !== 'function') return false;
    schedule();
    return true;
}

/**
 * Executable ReplaySystem → manager fast path → host scheduler chain.
 * Mirrors production preference: when managerBroadcast exists, ReplaySystem
 * does NOT dispatch replayMultichartFrame.
 *
 * Production path uses requestAnimationFrame → __multichartScheduleHostPnlFanout.
 * Pass requestAnimationFrame (or a fake) to prove the rAF → scheduler hop.
 */
export function runReplaySystemManagerPnlChain({
    frames = 12,
    isPlaying = true,
    panelIds = ['A', 'B'],
    kill = false,
    coalesceMs = 50,
    setTimeout: setTimer,
    clearTimeout: clearTimer,
    requestAnimationFrame: rafFn,
    advanceTimers,
    openPositions,
    fanOut,
} = {}) {
    const timers = (!setTimer || !advanceTimers) ? null : { setTimer, clearTimer, advanceTimers };
    const applyCalls = [];
    const defaultFanOut = fanOut || ((opts) => {
        const peers = (panelIds || []).filter((id) => id !== 'A');
        for (const panelId of peers) {
            applyCalls.push({
                cmd: 'applyOrderSnapshot',
                runtimeOnly: !!(opts && opts.runtimeOnly),
                panelId,
            });
        }
        return { ok: true, panelIds: peers.length };
    });
    const scheduler = createHostPnlFanoutScheduler(defaultFanOut, {
        coalesceMs,
        setTimeout: setTimer,
        clearTimeout: clearTimer,
    });
    const positions = openPositions || [{ id: 1, unrealizedPnL: 0, openPrice: 1.1 }];
    const frameCmds = [];
    let rafScheduleCount = 0;
    let rafFlushCount = 0;

    // Production MultichartManager.__multichartManagerBroadcastReplay (rAF-coalesced).
    let coalescedDetail = null;
    let coalescedScheduled = false;
    const scheduleRaf = typeof rafFn === 'function'
        ? (fn) => {
            rafScheduleCount += 1;
            return rafFn(() => {
                rafFlushCount += 1;
                fn();
            });
        }
        : (typeof setTimer === 'function'
            ? (fn) => {
                rafScheduleCount += 1;
                return setTimer(() => {
                    rafFlushCount += 1;
                    fn();
                }, 0);
            }
            : (fn) => {
                rafScheduleCount += 1;
                rafFlushCount += 1;
                fn();
            });

    const managerBroadcastReplay = (detail) => {
        if (!detail || !Number.isFinite(Number(detail.timestamp))) return false;
        coalescedDetail = detail;
        if (coalescedScheduled) return true;
        coalescedScheduled = true;
        scheduleRaf(() => {
            coalescedScheduled = false;
            const payload = coalescedDetail;
            coalescedDetail = null;
            if (!payload) return;
            // Fan replayFrame to peers (count must not affect host schedule).
            for (const id of (panelIds || [])) {
                if (id === 'A') continue;
                frameCmds.push({ cmd: 'replayFrame', panelId: id, isPlaying: !!payload.isPlaying });
            }
            // ONE host scheduler call on the manager fast path.
            scheduleHostPnlFromReplayFrame(payload, {
                kill,
                openPositions: positions,
                pendingOrders: [],
                schedule: () => scheduler.schedule(),
            });
        });
        return true;
    };

    // Production ReplaySystem preference: manager path, no CustomEvent.
    const replaySystemBroadcast = (detail) => {
        managerBroadcastReplay(detail);
    };

    for (let i = 0; i < frames; i++) {
        replaySystemBroadcast({
            timestamp: 1_700_000_000_000 + i * 60_000,
            isPlaying,
            currentIndex: i,
        });
        if (advanceTimers) advanceTimers(16);
    }
    if (advanceTimers) advanceTimers(Math.max(coalesceMs, 50));
    else if (timers) { /* no-op */ }

    return {
        counts: scheduler.getCounts(),
        applyCalls,
        applyCount: applyCalls.length,
        frameCmds,
        frameCmdCount: frameCmds.length,
        peerPanelCount: (panelIds || []).filter((id) => id !== 'A').length,
        rafScheduleCount,
        rafFlushCount,
    };
}

/**
 * Host-owned coalesced runtime P&L fan-out scheduler.
 * schedule() may be called every play frame; fanOut runs at most once per
 * coalesceMs. scheduleCount grows with calls; fanCount stays O(frames), not
 * O(panels × frames).
 */
export function createHostPnlFanoutScheduler(fanOut, opts = {}) {
    const coalesceMs = Number.isFinite(Number(opts.coalesceMs)) ? Number(opts.coalesceMs) : 50;
    const setTimer = typeof opts.setTimeout === 'function' ? opts.setTimeout : setTimeout;
    const clearTimer = typeof opts.clearTimeout === 'function' ? opts.clearTimeout : clearTimeout;
    let timer = null;
    let scheduleCount = 0;
    let fanCount = 0;
    let lastFanResult = null;
    return {
        schedule(args) {
            scheduleCount += 1;
            if (timer != null) return { coalesced: true, scheduleCount, fanCount };
            timer = setTimer(() => {
                timer = null;
                fanCount += 1;
                try {
                    lastFanResult = typeof fanOut === 'function'
                        ? fanOut({ runtimeOnly: true, ...(args || {}) })
                        : null;
                } catch (err) {
                    lastFanResult = { ok: false, error: String(err && err.message || err) };
                }
            }, coalesceMs);
            return { coalesced: false, scheduleCount, fanCount };
        },
        flushNow(args) {
            if (timer != null) {
                clearTimer(timer);
                timer = null;
            }
            fanCount += 1;
            try {
                lastFanResult = typeof fanOut === 'function'
                    ? fanOut({ runtimeOnly: true, ...(args || {}) })
                    : null;
            } catch (err) {
                lastFanResult = { ok: false, error: String(err && err.message || err) };
            }
            return lastFanResult;
        },
        getCounts() {
            return {
                scheduleCount,
                fanCount,
                pending: timer != null,
                lastFanResult,
            };
        },
        resetCounts() {
            scheduleCount = 0;
            fanCount = 0;
            lastFanResult = null;
        },
        dispose() {
            if (timer != null) {
                clearTimer(timer);
                timer = null;
            }
        },
    };
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
    const snap = runtimeOnly === true
        ? buildHostRuntimePnlSnapshot(om, sessionId, versionHolder.current)
        : buildHostOrderStoreSnapshot(om, sessionId, versionHolder.current, { win: deps?.win });

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
    let payloadBytes = 0;
    try { payloadBytes = JSON.stringify(snap).length; } catch (_) { payloadBytes = 0; }
    return {
        ok: panelIds.length > 0,
        panelIds,
        snapshotVersion: versionHolder.current,
        openCount: (snap.openPositions || []).length,
        pendingCount: (snap.pendingOrders || []).length,
        runtimeOnly: runtimeOnly === true,
        payloadBytes,
        snapshot: snap,
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
