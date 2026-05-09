/**
 * embed-bridge.js — production multichart embed
 *
 * Runs INSIDE each dist-v9 iframe spawned by /chart/multi (the production
 * multichart shell). Loaded ONLY when the iframe URL contains ?multichart=1.
 *
 * Responsibilities:
 *   1. Wait for `window.chart` to exist (the dist-v9 React app mounts
 *      chart.js asynchronously after the React tree boots).
 *   2. Once present, install MultichartBridge on it. From that moment on,
 *      crosshair / visible-range / symbol events flow to the parent shell
 *      via postMessage, governed by the same allowlist + loop guard verified
 *      through Phase 6 of multi_chart_rebuild_roadmap.md.
 *   3. Forward chart instrument changes via the existing dispatch pipeline
 *      (chart.js dispatches `chartDataLoaded` when a file/symbol loads;
 *      sync-bridge.js already listens for that and forwards `chart-state`).
 *   4. Emit a heartbeat `host-log` message every 5s for the first 30s of an
 *      iframe's life so the parent shell can surface boot diagnostics if
 *      `window.chart` never materialises (which usually means the React app
 *      failed to mount, e.g. unauthenticated).
 *
 * What this file does NOT do (deliberately):
 *   - It does NOT push price-axis state. The forbidden-fields filter is
 *     enforced inside sync-bridge.js for inbound and outbound; this file
 *     never even touches priceScale.
 *   - It does NOT change the React app's state. Each iframe's React app is
 *     fully independent; the user picks file/tf/indicators/orders/drawings
 *     using the native dist-v9 UI inside each panel. Cross-panel sharing of
 *     drawings/indicators/orders is intentionally a Phase 7.2 follow-up.
 */

(function () {
    'use strict';

    var params  = new URLSearchParams(location.search);
    var chartId = params.get('panelId') || params.get('id') || ('chart-' + Math.random().toString(36).slice(2, 6));
    var verbose = params.get('verbose') === '1';

    function reportToShell(level, text) {
        try {
            window.parent.postMessage({
                type: 'host-log',
                source: chartId,
                level: level,
                text: '[embed:' + chartId + '] ' + text,
            }, '*');
        } catch (_) {}
        var fn = (level === 'error') ? console.error : (level === 'warn' ? console.warn : console.log);
        try { fn.call(console, '[multichart-embed:' + chartId + ']', text); } catch (_) {}
    }

    function pollFor(predicate, intervalMs, maxMs, onReady, onTimeout) {
        var start = Date.now();
        var tick = function () {
            try {
                if (predicate()) { onReady(); return; }
            } catch (e) { /* ignore */ }
            if (Date.now() - start >= maxMs) { onTimeout(); return; }
            setTimeout(tick, intervalMs);
        };
        tick();
    }

    function installOnce() {
        if (window.__multichartBridge) {
            reportToShell('info', 'bridge already installed; ignoring duplicate boot');
            return;
        }
        if (!window.MultichartBridge || !window.MultichartGuards) {
            reportToShell('error', 'sync-bridge.js or engine-api-guards.js did not load — '
                + 'check that /chart/multi/ static mount is serving them');
            return;
        }
        var ch = window.chart;
        if (!ch) {
            reportToShell('error', 'window.chart missing at install time (race condition)');
            return;
        }
        try {
            window.__multichartBridge = window.MultichartBridge.installBridge(ch, {
                chartId: chartId,
                parentOrigin: '*',
                verbose: verbose,
            });
            reportToShell('info', 'bridge installed on dist-v9 chart instance (guards v='
                + (window.MultichartGuards.VERSION || '?') + ')');
        } catch (e) {
            reportToShell('error', 'installBridge threw: ' + (e && e.message || e));
            return;
        }

        // Apply initial viewing context (fileId/tf forwarded from /chart/ via
        // the shell). Without this, each panel boots empty ("No data to
        // display") because the shell URL knows the file but the React app
        // inside the iframe has no per-panel selection yet — fixes the
        // "open backtest with data, click 2 panels, data is gone" regression.
        applyInitialContext();
    }

    function applyInitialContext() {
        var fileId = params.get('fileId');
        var tf     = params.get('tf');
        if (!fileId) {
            // Nothing to load — user opened /chart/multi directly with no
            // initial context. They can pick a file using the dist-v9 React
            // UI inside the panel. (NOTE: dist-v9 chrome is hidden by the
            // multichart-embed CSS today, so picking a file per-panel will
            // need a v1.2 shell-side picker. For v1.1 the boot context is
            // the only path.)
            return;
        }
        var ch = window.chart;
        if (!ch || typeof ch.loadFileData !== 'function') {
            reportToShell('warn', 'cannot apply fileId=' + fileId + ': window.chart.loadFileData missing');
            return;
        }
        try {
            // Hint the timeframe BEFORE loadFileData so the engine resamples
            // raw 1m data into the right timeframe on first paint instead of
            // first showing 1m and then re-resampling.
            if (tf && typeof ch.currentTimeframe === 'string') {
                try { ch.currentTimeframe = tf; } catch (_) {}
            }
            var p = ch.loadFileData(fileId);
            // loadFileData is async; if it returns a promise, finish the tf
            // setup after it resolves so we don't race a setTimeframe call
            // against an in-flight resample.
            if (p && typeof p.then === 'function') {
                p.then(function () {
                    if (tf && typeof ch.setTimeframe === 'function') {
                        try { ch.setTimeframe(tf); } catch (_) {}
                    }
                    reportToShell('info', 'initial context applied: fileId=' + fileId + ' tf=' + (tf || '(default)'));
                }, function (err) {
                    reportToShell('error', 'loadFileData failed: ' + (err && err.message || err));
                });
            } else {
                if (tf && typeof ch.setTimeframe === 'function') {
                    try { ch.setTimeframe(tf); } catch (_) {}
                }
                reportToShell('info', 'initial context applied (sync): fileId=' + fileId + ' tf=' + (tf || '(default)'));
            }
        } catch (e) {
            reportToShell('error', 'applyInitialContext threw: ' + (e && e.message || e));
        }
    }

    // Heartbeat + startup diagnostics — emit a log line every 5s for 30s while
    // we wait for the chart to come up. Helps diagnose iframes that hang on
    // auth redirect or module load failure (the parent shell prints these in
    // its log panel).
    var heartbeatStart = Date.now();
    var heartbeatId = setInterval(function () {
        var elapsed = Math.floor((Date.now() - heartbeatStart) / 1000);
        if (window.__multichartBridge || elapsed >= 30) {
            clearInterval(heartbeatId);
            return;
        }
        reportToShell('info', 'waiting for window.chart to appear (' + elapsed + 's elapsed, '
            + 'document.readyState=' + document.readyState + ')');
    }, 5000);

    // pagehide cleanup so the heartbeat can't outlive a torn-down iframe.
    window.addEventListener('pagehide', function () {
        clearInterval(heartbeatId);
    }, { once: true });

    function boot() {
        // chart.js sets window.chart inside its constructor; the React app may
        // boot the chart up to a few seconds after DOMContentLoaded depending
        // on auth redirect and bundle parse time. 30s timeout matches the
        // sandbox's chart-host.html grace period.
        pollFor(
            function () { return !!window.chart; },
            150,
            30000,
            installOnce,
            function () {
                reportToShell('error',
                    'window.chart never appeared after 30s — '
                    + 'either the dist-v9 chart bundle failed to load, the user is unauthenticated '
                    + '(check Network tab for a redirect to /signin), or chart.js threw during init '
                    + '(open this iframe directly in a new tab to see its console)');
            }
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
