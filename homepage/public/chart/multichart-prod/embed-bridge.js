/**
 * embed-bridge.js — Phase 7.2.1 foundation
 *
 * Runs INSIDE each dist-v9 iframe spawned by the future MultichartGrid React
 * component (Phase 7.2.2). Loaded ONLY when the iframe URL contains
 * ?multichart=1; on plain /chart/ this file is never injected.
 *
 * Responsibilities:
 *   1. Wait for window.chart to exist (the dist-v9 React app boots chart.js
 *      asynchronously after the React tree mounts; auth redirects can delay
 *      this by seconds).
 *   2. Once present, install MultichartBridge (sync-bridge.js) on it. From
 *      that moment crosshair / visible-range / symbol events flow to the
 *      parent shell via postMessage, governed by FORBIDDEN_SYNC_FIELDS.
 *   3. Apply initial viewing context (?fileId=N&tf=1m) so each panel boots
 *      with the same data the user was viewing on /chart/ before they
 *      picked a multi-panel layout.
 *   4. Heartbeat host-log message every 5s for the first 30s while we wait
 *      for window.chart, so the parent can surface boot diagnostics.
 *
 * What this file does NOT do:
 *   - Does not push price-axis state — sync-bridge.js + engine-api-guards.js
 *     enforce that on both inbound and outbound.
 *   - Does not change React state directly. Per-panel drawings/indicators/
 *     orders rely on each iframe's own React tree being independent.
 *   - Does not handle parent→iframe COMMAND messages (file change, indicator
 *     add, drawing tool select, place order). That's panel-cmd-bridge.js,
 *     coming in Phase 7.2.4 alongside the topbar action redirect.
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
                + 'check that /chart/multichart-prod/ static mount is serving them');
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

        applyInitialContext();
    }

    // Apply the file/tf the parent told us to boot with.
    // Without this, each iframe would land on whatever default the dist-v9
    // React app picks (usually empty, "No data to display"), even though the
    // user just picked a layout from a /chart/ that already had data.
    function applyInitialContext() {
        var fileId    = params.get('fileId');
        var tf        = params.get('tf');
        var sessionId = params.get('sessionId');
        if (!fileId) return;
        var ch = window.chart;
        if (!ch || typeof ch.loadFileData !== 'function') {
            reportToShell('warn', 'cannot apply fileId=' + fileId + ': window.chart.loadFileData missing');
            return;
        }
        try {
            // Hint timeframe BEFORE load so first-paint resamples to the
            // correct tf instead of paint-then-resample.
            if (tf && typeof ch.currentTimeframe === 'string') {
                try { ch.currentTimeframe = tf; } catch (_) {}
            }
            // Stash sessionId on the chart instance so getDrawingsStorageKey
            // builds the same per-session key as the parent. chart.js's
            // getActiveTradingSessionId reads URL → instance →
            // localStorage; setting it here makes the URL value win even
            // if some legacy localStorage key from a different session
            // is hanging around.
            if (sessionId) {
                try { ch.activeTradingSessionId = sessionId; } catch (_) {}
            }
            var afterLoad = function () {
                if (tf && typeof ch.setTimeframe === 'function') {
                    try { ch.setTimeframe(tf); } catch (_) {}
                }
                // Belt-and-suspenders: explicitly tell the drawing manager
                // to load drawings now that data + sessionId + fileId are
                // all in place. The DM's chartDataLoaded listener should
                // also retry, but in some boot orderings (e.g. setTimeframe
                // resamples before the listener runs) loadDrawings() is
                // skipped because chart.data is briefly empty. Calling
                // here guarantees one attempt with all context set.
                try {
                    if (ch.drawingManager && typeof ch.drawingManager.loadDrawings === 'function') {
                        Promise.resolve(ch.drawingManager.loadDrawings()).catch(function () {});
                    }
                } catch (_) {}
                reportToShell('info', 'initial context applied: fileId=' + fileId
                    + ' tf=' + (tf || '(default)')
                    + ' sessionId=' + (sessionId || '(none)'));
            };
            var p = ch.loadFileData(fileId);
            if (p && typeof p.then === 'function') {
                p.then(afterLoad, function (err) {
                    reportToShell('error', 'loadFileData failed: ' + (err && err.message || err));
                });
            } else {
                afterLoad();
            }
        } catch (e) {
            reportToShell('error', 'applyInitialContext threw: ' + (e && e.message || e));
        }
    }

    // Heartbeat for the first 30s of boot — helps diagnose iframes whose
    // window.chart never appears (auth redirect, bundle parse failure, etc.).
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

    window.addEventListener('pagehide', function () {
        clearInterval(heartbeatId);
    }, { once: true });

    function boot() {
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
