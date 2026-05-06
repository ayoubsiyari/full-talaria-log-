/**
 * Debounced bridge: replay virtual clock → PATCH /api/sessions/:id/state replay.dashboard
 * (furthest bar reached vs configured session dates). Loaded after replay-system.js.
 */
(function () {
    if (typeof window === 'undefined') return;
    var timer = null;
    window.addEventListener(
        'replayVirtualTimeChanged',
        function (ev) {
            var chart = window.chart;
            if (!chart || typeof chart._onReplayVirtualTimeForDashboard !== 'function') return;
            var det = ev && ev.detail ? ev.detail : {};
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                timer = null;
                chart._onReplayVirtualTimeForDashboard(det);
            }, 1200);
        },
        false
    );
})();
