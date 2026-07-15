/**
 * RC-6 Phase 5 (M5) — indicator persist / rehydrate race helpers.
 */
(function (global) {
    'use strict';

    function rc6IndicatorPersistRehydrateV2Enabled(scope) {
        const g = scope || global;
        return !!(g && g.__TALARIA_RC6_INDICATOR_PERSIST_REHYDRATE_V2 !== false);
    }

    function beginIndicatorRehydrate(chart, pendingList) {
        if (!chart) return;
        chart._indicatorRehydrateInProgress = true;
        chart._indicatorRehydrateSuppressStoreIncremental = true;
        chart._indicatorRehydratePending = Array.isArray(pendingList) ? pendingList.slice() : [];
        chart._indicatorRehydrateExpectedCount = chart._indicatorRehydratePending.length;
    }

    function endIndicatorRehydrate(chart) {
        if (!chart) return;
        chart._indicatorRehydrateInProgress = false;
        chart._indicatorRehydrateSuppressStoreIncremental = false;
        chart._indicatorRehydratePending = null;
        chart._indicatorRehydrateExpectedCount = 0;
    }

    function isIndicatorRehydrateInProgress(chart) {
        return !!(chart && chart._indicatorRehydrateInProgress);
    }

    function shouldSuppressStoreIncrementalDuringRehydrate(chart, action) {
        if (!rc6IndicatorPersistRehydrateV2Enabled(global)) return false;
        if (!chart || !chart._indicatorRehydrateSuppressStoreIncremental) return false;
        return action === 'add' || action === 'remove' || action === 'update';
    }

    function shouldBlockIndicatorPersistSnapshot(chart, snapshot, options) {
        options = options || {};
        const list = Array.isArray(snapshot) ? snapshot : [];
        if (!rc6IndicatorPersistRehydrateV2Enabled(global)) return false;
        if (chart && chart._indicatorRehydrateInProgress) return true;
        if (!options.force && list.length === 0) {
            if (chart && Array.isArray(chart._indicatorRehydratePending) && chart._indicatorRehydratePending.length > 0) {
                return true;
            }
        }
        return false;
    }

    function countDuplicateIndicatorIds(active) {
        if (!Array.isArray(active)) return 0;
        const seen = new Set();
        let dupes = 0;
        active.forEach(function(ind) {
            if (!ind || ind.id == null) return;
            const id = String(ind.id);
            if (seen.has(id)) dupes += 1;
            else seen.add(id);
        });
        return dupes;
    }

    function rehydrateActiveMatchesPending(pending, active) {
        if (!Array.isArray(pending) || !Array.isArray(active)) return false;
        if (active.length !== pending.length) return false;
        return countDuplicateIndicatorIds(active) === 0;
    }

    function reconcileRehydrateStoreSnapshot(pending, active, storeSnapshot) {
        const count = storeSnapshot && typeof storeSnapshot.count === 'number' ? storeSnapshot.count : 0;
        const dupes = countDuplicateIndicatorIds(active);
        if (!rehydrateActiveMatchesPending(pending, active)) {
            return { ok: false, reason: 'active-pending-mismatch', dupes: dupes, storeCount: count };
        }
        if (count !== active.length) {
            return { ok: false, reason: 'store-count-mismatch', dupes: dupes, storeCount: count };
        }
        return { ok: true, dupes: 0, storeCount: count };
    }

    global.rc6IndicatorPersistRehydrateV2Enabled = rc6IndicatorPersistRehydrateV2Enabled;
    global.beginIndicatorRehydrate = beginIndicatorRehydrate;
    global.endIndicatorRehydrate = endIndicatorRehydrate;
    global.isIndicatorRehydrateInProgress = isIndicatorRehydrateInProgress;
    global.shouldSuppressStoreIncrementalDuringRehydrate = shouldSuppressStoreIncrementalDuringRehydrate;
    global.shouldBlockIndicatorPersistSnapshot = shouldBlockIndicatorPersistSnapshot;
    global.countDuplicateIndicatorIds = countDuplicateIndicatorIds;
    global.rehydrateActiveMatchesPending = rehydrateActiveMatchesPending;
    global.reconcileRehydrateStoreSnapshot = reconcileRehydrateStoreSnapshot;
})(typeof window !== 'undefined' ? window : globalThis);
