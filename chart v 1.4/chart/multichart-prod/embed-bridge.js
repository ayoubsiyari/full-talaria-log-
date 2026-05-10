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

            // ── CRITICAL: neutralize loadTradingSessionStateIfNeeded ──
            //
            // chart.js's initReplaySystem schedules this fetch via
            // setTimeout(0) at chart.js:3124. It hits
            // /api/sessions/{sessionId}/state and, if state.drawings is
            // non-empty, calls drawingManager.loadDrawingsFromData(state.drawings)
            // — which SYNCHRONOUSLY WIPES dm.drawings + dm.drawingsGroup
            // (drawing-tools-manager.js:7308-7316) before re-pushing from
            // the server snapshot. In the multichart iframe context this
            // produces the user-visible "drawing flashes for ~5ms then
            // disappears" because:
            //   1. dm.loadDrawings() (called from chart.loadFileData on
            //      first load) reads localStorage → drawings appear.
            //   2. setTimeout(loadTradingSessionStateIfNeeded, 0) fires
            //      → fetch returns state.drawings.
            //   3. loadDrawingsFromData wipes dm.drawings synchronously.
            //   4. If state.drawings differs from local (server hadn't
            //      received the latest writes yet, or the iframe race
            //      causes the re-render to fail), drawings stay gone.
            //   5. User changes tf → loadFileData runs again → loadDrawings
            //      reads localStorage → drawings reappear and stay.
            //
            // The iframe panel does NOT need session state restoration —
            // it's purely a sync display tied to the parent's chart, and
            // its drawings come from the same localStorage the parent
            // writes to (per-session key). Make the session-state fetch
            // a no-op on the iframe's chart so it cannot clobber what
            // dm.loadDrawings just put there.
            try {
                ch.loadTradingSessionStateIfNeeded = function () {
                    return Promise.resolve();
                };
                // Prevent the same fetch from being kicked off by the
                // backup-only fallback path used inside
                // _applyTradingSessionFromLocalBackupOnly (chart.js).
                if (typeof ch._applyTradingSessionFromLocalBackupOnly === 'function') {
                    ch._applyTradingSessionFromLocalBackupOnly = function () {};
                }
            } catch (_) {}

            // ── Belt-and-suspenders: neutralize loadDrawingsFromData ──
            //
            // loadTradingSessionStateIfNeeded is scheduled by chart.js
            // initReplaySystem via setTimeout(0). That setTimeout might
            // FIRE before applyInitialContext gets to monkey-patch above
            // (defer-script ordering vs DOMContentLoaded race). If it
            // does, the fetch is in flight and will eventually call
            // drawingManager.loadDrawingsFromData(state.drawings) — which
            // unconditionally wipes dm.drawings + dm.drawingsGroup at
            // drawing-tools-manager.js:7308-7316 before re-rendering.
            //
            // The iframe panel never wants this clobber path: the local
            // dm.loadDrawings (kicked by chart.loadFileData on first load
            // and by chartDataLoaded listener on subsequent reloads) is
            // the single source of truth here. Replace with a no-op so
            // any late-arriving session-state fetch cannot wipe what's
            // already on screen.
            //
            // Also covers the second call site (line 2202) inside
            // _applyPendingSessionDrawingsAfterManagerLoad — if a stale
            // _pendingSessionDrawingsFromState was set by a fetch that
            // already returned, the same wipe would happen.
            try {
                var dm = ch.drawingManager;
                if (dm && typeof dm.loadDrawingsFromData === 'function'
                    && !dm.__multichartLoadFromDataNoOp) {
                    dm.__multichartLoadFromDataNoOp = true;
                    dm.loadDrawingsFromData = function () {
                        try {
                            window.parent.postMessage({
                                type: 'host-log',
                                source: chartId,
                                level: 'info',
                                text: '[embed:' + chartId + '] loadDrawingsFromData no-op'
                                    + ' (multichart iframe; localStorage is source of truth)',
                            }, '*');
                        } catch (_) {}
                    };
                }
            } catch (_) {}

            // ── Drawings-clip-path race fix ──
            //
            // chart.js renders into its drawingsGroup, which is clipped by
            // <clipPath id="chart-clip-path"><rect x y w h /></clipPath>.
            // updateClipPath sets w/h from chart.w / chart.h (the canvas's
            // CSS pixel dimensions). On iframe boot, the canvas is briefly
            // 0×0 (CSS layout, fonts, defer script ordering all collide
            // with chart.js's first init pass). The bug:
            //
            //   T0  chart.js inits → createSVGLayers → updateClipPath
            //       sets clipRect to (m.l, m.t, 0-m.l-m.r, 0-m.t-m.b)
            //       → effectively NEGATIVE width/height → drawings are
            //       fully clipped (invisible).
            //   T+ε loadDrawings fires → drawings ARE in dm.drawings
            //       AND ARE in the SVG drawingsGroup — they're just
            //       invisible because the clipPath's rect is 0×0.
            //   T+? chart eventually resizes (ResizeObserver picks up
            //       the iframe's actual cell dims). chart.render fires
            //       → redrawDrawings → dm.redrawAll → updateClipPath
            //       → clip rect is now correct → drawings VISIBLE.
            //   T+?? if the user pans/scrolls/changes tf, chart.render
            //       fires again with correct clip → drawings stay
            //       VISIBLE.
            //
            // Reported as: "drawings flash for ~1ms, then disappear,
            // until I change the timeframe."  The ~1ms flash is the
            // window between dm.loadDrawings rendering into the SVG and
            // the next chart.render that wipes the SVG (redrawAll)
            // BEFORE the canvas has its final dimensions — at that
            // moment, the wipe leaves an empty SVG and the new
            // updateClipPath is still wrong, so nothing draws back.
            //
            // Fix: install a ResizeObserver on the canvas. Whenever the
            // canvas dimensions change, fire dm.redrawAll() on the next
            // animation frame. This catches:
            //   - the initial CSS-layout settle (canvas goes 0 → real)
            //   - any future cell resize (user dragging panel splits)
            //   - DPR change (device rotation, multi-monitor drag)
            // updateClipPath is idempotent and cheap; redrawAll is
            // O(num_drawings) which is small. We also schedule a few
            // belt-and-suspenders rAF calls in the first 1s after boot
            // for browsers/edge cases where the ResizeObserver fires
            // before canvas dims settle (canvas dims are set in
            // chart.resize()).
            try {
                var __mcLastBox = { w: 0, h: 0 };
                var __mcRedrawScheduled = false;
                function scheduleMcRedraw(reason) {
                    if (__mcRedrawScheduled) return;
                    __mcRedrawScheduled = true;
                    requestAnimationFrame(function () {
                        __mcRedrawScheduled = false;
                        try {
                            if (ch.drawingManager
                                && typeof ch.drawingManager.redrawAll === 'function'
                                && ch.xScale && ch.yScale) {
                                ch.drawingManager.redrawAll();
                                if (verbose) {
                                    console.log('[embed:' + chartId + '] dm.redrawAll fired (' + reason + ')');
                                }
                            }
                        } catch (e) {
                            console.warn('[embed:' + chartId + '] dm.redrawAll threw (' + reason + '):', e && e.message);
                        }
                    });
                }
                var canvas = ch.canvas;
                if (canvas && typeof ResizeObserver === 'function') {
                    var ro = new ResizeObserver(function (entries) {
                        for (var i = 0; i < entries.length; i++) {
                            var box = entries[i].contentRect;
                            if (!box) continue;
                            var w = Math.round(box.width);
                            var h = Math.round(box.height);
                            if (w !== __mcLastBox.w || h !== __mcLastBox.h) {
                                __mcLastBox.w = w;
                                __mcLastBox.h = h;
                                scheduleMcRedraw('canvas-resize ' + w + 'x' + h);
                            }
                        }
                    });
                    ro.observe(canvas);
                    ch.__multichartResizeObserver = ro;
                }
                // Belt-and-suspenders: schedule extra redraws at
                // increasing delays to catch any edge case where the
                // ResizeObserver does not fire before drawings are
                // first rendered (e.g. canvas dims set synchronously
                // before observer attaches, or browser batching).
                [50, 200, 500, 1000].forEach(function (ms) {
                    setTimeout(function () {
                        scheduleMcRedraw('boot-delay ' + ms + 'ms');
                    }, ms);
                });
            } catch (_) {}
            var afterLoad = function () {
                if (tf && typeof ch.setTimeframe === 'function') {
                    try { ch.setTimeframe(tf); } catch (_) {}
                }
                // DO NOT call ch.drawingManager.loadDrawings() here.
                //
                // chart.js's loadFileData already invokes loadDrawings on
                // first load (chart.js:1540) with the correct sessionId
                // (we set ch.activeTradingSessionId BEFORE loadFileData,
                // and getActiveTradingSessionId reads from URL too — both
                // paths see the right sessionId on the first call).
                //
                // Calling loadDrawings AGAIN here causes a destructive
                // race: the second call wipes dm.drawings synchronously
                // at the top (line 7193-7197), then awaits for localStorage
                // / cloud API again. If that re-read is briefly empty
                // (storage write hadn't flushed yet, API returned null,
                // etc.) the drawings stay wiped — visible to the user as
                // "drawings flash for ~5ms then disappear, only reappear
                // after a tf change". The tf change calls
                // refreshDrawingsForTimeframe which iterates the existing
                // drawings array — but if our wipe killed it, that
                // refresh has nothing to render either. The fact that
                // drawings reappear after tf is because the user TRIGGERS
                // setTimeframe → _loadTimeframeFromServer → loadFileData
                // path which calls loadDrawings AGAIN, and by then the
                // localStorage write has settled.
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
