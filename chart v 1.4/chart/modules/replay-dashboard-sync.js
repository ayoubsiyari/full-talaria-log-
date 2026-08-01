/**
 * Debounced bridge: replay virtual clock → PATCH /api/sessions/:id/state replay.dashboard
 * (furthest bar reached vs configured session dates). Loaded after replay-system.js.
 *
 * DASHBOARD-SYNC-COALESCE-V1. The heavy work here was already coalesced — the 1200 ms
 * trailing debounce predates this row. What was not coalesced is the debounce's own
 * re-arm. `updateTimeDisplay` (replay-system.js:8754) dispatches replayVirtualTimeChanged
 * synchronously from inside an `m20Q6CaptureEffects` window, so inside this listener
 * `clearTimeout` is `m20Q6CapturedClear` (replay-system.js:9816): a linear scan of
 * `state.schedulers`, which is pruned only by `m20Q6DrainState` (replay-system.js:10199)
 * at teardown and which the paired `setTimeout` grows by one entry per tick. Re-arming
 * once per tick is therefore quadratic in session length, and it is that re-arm — not
 * `_onReplayVirtualTimeForDashboard` — that the freeze profile attributes here.
 *
 * A deadline that is re-read rather than re-armed touches the scheduler once per quiet
 * period instead of once per tick, and the pending flag collapses every tick in a frame
 * into one write on the next frame.
 *
 * The trailing write must always land: dropping it leaves the dashboard showing a stale
 * replay time for the rest of the session.
 *
 * Kill-switch: window.__TALARIA_DASHBOARD_SYNC_COALESCE_V1 = <truthy> restores the
 * per-tick re-arm. Absent / falsy ⇒ coalescer active. Read per call, never at init.
 */
(function () {
    if (typeof window === 'undefined') return;

    var DEBOUNCE_MS = 1200;

    var legacyTimer = null;
    var pendingDetail = null;
    var writePending = false;
    var deadlineAt = 0;
    var deadlineTimer = null;
    var frameHandle = null;

    function coalesceDisabled() {
        var read = window._talariaDisableFlagTruthy;
        if (typeof read !== 'function') return false;
        try {
            return !!read('__TALARIA_DASHBOARD_SYNC_COALESCE_V1');
        } catch (_e) {
            return false;
        }
    }

    function targetChart() {
        var chart = window.chart;
        if (!chart || typeof chart._onReplayVirtualTimeForDashboard !== 'function') return null;
        return chart;
    }

    function deliver() {
        frameHandle = null;
        if (!writePending) return;
        writePending = false;
        var det = pendingDetail;
        pendingDetail = null;
        var chart = targetChart();
        if (chart) chart._onReplayVirtualTimeForDashboard(det);
    }

    function onDeadline() {
        deadlineTimer = null;
        var remaining = deadlineAt - Date.now();
        if (remaining > 0) {
            deadlineTimer = setTimeout(onDeadline, remaining);
            return;
        }
        if (!writePending || frameHandle !== null) return;
        // rAF never fires in a hidden document, and the trailing write cannot wait for
        // the tab to come back.
        if (typeof window.requestAnimationFrame === 'function'
            && !(window.document && window.document.hidden)) {
            frameHandle = window.requestAnimationFrame(deliver);
            return;
        }
        deliver();
    }

    window.addEventListener(
        'replayVirtualTimeChanged',
        function (ev) {
            var chart = targetChart();
            if (!chart) return;
            var det = ev && ev.detail ? ev.detail : {};
            if (coalesceDisabled()) {
                if (legacyTimer) clearTimeout(legacyTimer);
                legacyTimer = setTimeout(function () {
                    legacyTimer = null;
                    chart._onReplayVirtualTimeForDashboard(det);
                }, DEBOUNCE_MS);
                return;
            }
            pendingDetail = det;
            writePending = true;
            deadlineAt = Date.now() + DEBOUNCE_MS;
            if (deadlineTimer === null) {
                deadlineTimer = setTimeout(onDeadline, DEBOUNCE_MS);
            }
        },
        false
    );
})();
