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

    function markViewportBootSettle(chart, ms) {
        if (!chart) return;
        var now = (typeof performance !== 'undefined' && performance.now)
            ? performance.now()
            : Date.now();
        chart._multichartViewportSettleUntil = now + (ms || 2500);
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

    function suppressEmbedChartBrand() {
        try {
            var styleId = 'multichart-embed-hide-brand';
            if (!document.getElementById(styleId)) {
                var s = document.createElement('style');
                s.id = styleId;
                s.textContent = [
                    'html.multichart-embed .chart-brand,',
                    'html.multichart-embed a.brand-lockup,',
                    'html.multichart-embed #chartWrapper .logo-top,',
                    'html.multichart-embed #chartWrapper .logo-bottom',
                    '{ display:none !important; visibility:hidden !important; pointer-events:none !important; }'
                ].join(' ');
                document.head.appendChild(s);
            }
            document.querySelectorAll('.chart-brand').forEach(function (el) {
                try { el.remove(); } catch (_) {}
            });
        } catch (_) {}
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

        installSettingsParentProxy();
        installMultichartSettingsModalGuard();
        suppressEmbedChartBrand();
        var brandSweep = 0;
        var brandSweepTimer = setInterval(function () {
            suppressEmbedChartBrand();
            if (++brandSweep >= 40) clearInterval(brandSweepTimer);
        }, 250);
        pollFor(
            function () { return installSettingsParentProxy(); },
            100,
            60000,
            function () {},
            function () {}
        );

        applyInitialContext();
    }

    /**
     * Iframe tiles must never host tv-settings-modal locally. Forward every
     * settings open to the parent main-chart shell (same UX as panel A).
     */
    function forwardDrawingSettingsToParent(drawing, x, y) {
        var drawId = drawing && drawing.id != null ? drawing.id : null;
        var px = typeof x === 'number' && !isNaN(x) ? x : 0;
        var py = typeof y === 'number' && !isNaN(y) ? y : 0;
        try {
            var parent = window.parent;
            if (parent && parent !== window) {
                if (typeof parent.__multichartOpenShapeSettings === 'function') {
                    parent.__multichartOpenShapeSettings(chartId, drawing && drawing.type ? drawing : drawId, px, py);
                    return true;
                }
                var grid = parent.__multichartGrid;
                if (grid && typeof grid.openDrawingSettingsForPanel === 'function') {
                    grid.openDrawingSettingsForPanel(chartId, drawing && drawing.type ? drawing : drawId, px, py);
                    return true;
                }
            }
        } catch (_) {}
        try {
            window.parent.postMessage({
                type: 'multichart-open-drawing-settings',
                source: chartId,
                drawingId: drawId,
                x: px,
                y: py,
            }, '*');
            return true;
        } catch (_pm) {}
        return false;
    }

    function installMultichartSettingsModalGuard() {
        if (window.__mcSettingsModalGuardInstalled) return;
        window.__mcSettingsModalGuardInstalled = true;
        try {
            var guardStyle = document.createElement('style');
            guardStyle.id = 'multichart-settings-modal-guard';
            guardStyle.textContent = [
                'html.multichart-embed .tv-settings-modal {',
                '  display: none !important;',
                '  visibility: hidden !important;',
                '  pointer-events: none !important;',
                '}',
            ].join('\n');
            document.head.appendChild(guardStyle);
        } catch (_) {}
    }

    function installSettingsParentProxy() {
        var ch = window.chart;
        var dm = ch && ch.drawingManager;
        if (!dm || !dm.settingsPanel) return false;
        if (dm.settingsPanel.__mcParentProxyInstalled) return true;

        dm.settingsPanel.show = function (drawing, x, y /*, onSave, onDelete */) {
            forwardDrawingSettingsToParent(drawing, x, y);
        };
        dm.settingsPanel.__mcParentProxyInstalled = true;

        if (window.DrawingSettingsPanel
            && window.DrawingSettingsPanel.prototype
            && !window.DrawingSettingsPanel.prototype.__mcParentProxyInstalled) {
            window.DrawingSettingsPanel.prototype.show = function (drawing, x, y) {
                forwardDrawingSettingsToParent(drawing, x, y);
            };
            window.DrawingSettingsPanel.prototype.__mcParentProxyInstalled = true;
        }
        return true;
    }

    // Apply the file/tf the parent told us to boot with.
    // Without this, each iframe would land on whatever default the dist-v9
    // React app picks (usually empty, "No data to display"), even though the
    // user just picked a layout from a /chart/ that already had data.
    function applyInitialContext() {
        var fileId    = params.get('fileId');
        var tf        = params.get('tf');
        var sessionId = params.get('sessionId');

        var readParentChart = function () {
            try {
                return (window.parent && window.parent !== window)
                    ? window.parent.chart : null;
            } catch (_) { return null; }
        };
        var readParentPlayhead = function () {
            try {
                var pc = readParentChart();
                var prs = pc && pc.replaySystem ? pc.replaySystem : null;
                if (prs && prs.isActive) {
                    var t = Number(prs.replayTimestamp);
                    if (isFinite(t) && t > 0) return t;
                }
            } catch (_) {}
            return null;
        };

        if (!fileId) {
            var pcFid = readParentChart();
            if (pcFid && pcFid.currentFileId != null) {
                fileId = String(pcFid.currentFileId);
            }
        }
        if (!fileId) {
            reportToShell('warn', 'no fileId yet — polling parent chart (max 12s)');
            pollFor(
                function () {
                    var pc = readParentChart();
                    return !!(pc && pc.currentFileId);
                },
                120,
                12000,
                function () {
                    var pc = readParentChart();
                    if (pc && pc.currentFileId != null) {
                        params.set('fileId', String(pc.currentFileId));
                    }
                    applyInitialContext();
                },
                function () {
                    reportToShell('error', 'fileId never available from parent — no data load');
                }
            );
            return;
        }
        var ch = window.chart;
        if (!ch || typeof ch.loadFileData !== 'function') {
            reportToShell('warn', 'cannot apply fileId=' + fileId + ': window.chart.loadFileData missing');
            return;
        }
        try {
            markViewportBootSettle(ch, 2800);
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

            // ── Force iframe's replaySystem to treat ALL enterReplayMode calls as backtest ──
            //
            // chart.js's replay-system.js enterReplayMode picks the
            // start index via:
            //   isBacktesting = (urlMode === 'backtest' || 'propfirm')
            //                   || options.startAtBeginning
            //   if (isBacktesting) startIdx = sessionStartIdx;
            //   else               startIdx = floor(rd.length * 0.1);
            //
            // The iframe URL deliberately omits mode=backtest (we don't
            // want the splash + duplicate auto-init pipeline), so when
            // chart.js's autoLoadBacktestingData internally fires
            //   this.replaySystem.enterReplayMode();
            // (no opts), isBacktesting falls to false and the iframe
            // lands at the 10% mark — NOT at session start. Parent's
            // playhead-broadcast (panel-cmd-bridge replayEnter) will
            // later seek to the right timestamp, but if the parent is
            // PAUSED at session start (the typical post-creation state)
            // the iframe momentarily renders the wrong slice and the
            // user perceives "ranges don't match".
            //
            // Patch the method to default options.startAtBeginning=true
            // when the chart has a backtestingSession. Only the iframe
            // sees this monkey-patch (embed-bridge runs only inside
            // ?multichart=1).
            try {
                var rsEarly = ch.replaySystem;
                if (rsEarly && typeof rsEarly.enterReplayMode === 'function'
                    && !rsEarly.__multichartStartAtBeginningPatched) {
                    rsEarly.__multichartStartAtBeginningPatched = true;
                    var __originalEnterReplayMode = rsEarly.enterReplayMode.bind(rsEarly);
                    rsEarly.enterReplayMode = function (options) {
                        var opts = options || {};
                        if (this.chart && this.chart.backtestingSession
                            && opts.startAtBeginning === undefined) {
                            opts = Object.assign({}, opts, { startAtBeginning: true });
                        }
                        return __originalEnterReplayMode(opts);
                    };
                }
            } catch (_) {}

            // ── CRITICAL: copy the parent's backtestingSession into the iframe ──
            //
            // Without this, the iframe boots with chart.backtestingSession=null
            // because we deliberately don't forward `mode=backtest` in the
            // iframe URL (would trigger the splash + duplicate orderManager
            // setup). The downstream effects of a missing session are
            // visible to the user as:
            //
            //   1. loadFileData reads `this.backtestingSession ||
            //      JSON.parse(userStorage.getItem('backtestingSession'))`
            //      and uses session.startDate/endDate to build the
            //      _fetchSmartWindow params. With session=null, the
            //      iframe pulls a DIFFERENT data window than the parent
            //      (typically the full file ending at "now") — explains
            //      "Panel B already loaded complete data" and "the date
            //      of the last candle is wrong" reports.
            //
            //   2. enterReplayMode (called via panel-cmd-bridge replayEnter
            //      after loadFileData) hunts for sessionStartMs from
            //      this.backtestingSession → window.userStorage →
            //      localStorage. None present → fallback startIdx=10 →
            //      replay starts 10 bars in instead of at the user's
            //      configured session start date. Even when goToReplayTimestamp
            //      moves the cursor to parentTs afterwards, the chart.data
            //      slice still doesn't reflect the session's intended
            //      window because of (1).
            //
            // Because parent + iframe share an origin (both /chart/* on the
            // same host), window.parent.chart is directly readable from the
            // iframe. Pull the live object — newer than userStorage if the
            // user just created the session in this tab — and stash it on
            // the iframe's chart BEFORE loadFileData runs so smart-window
            // param building sees it on the very first call.
            try {
                var parentChart = (window.parent && window.parent !== window)
                    ? window.parent.chart : null;
                var parentSess = parentChart && parentChart.backtestingSession;
                if (parentSess) {
                    ch.backtestingSession = parentSess;
                    if (parentChart.activeTradingSessionId
                        && !ch.activeTradingSessionId) {
                        ch.activeTradingSessionId = parentChart.activeTradingSessionId;
                    }
                    if (typeof parentChart.isPropFirmMode === 'boolean') {
                        ch.isPropFirmMode = parentChart.isPropFirmMode;
                    }
                    // Also mirror into userStorage so any code path that
                    // reads JSON.parse(userStorage.getItem('backtestingSession'))
                    // — including replay-system enterReplayMode's fallback —
                    // sees the same session.
                    try {
                        if (window.userStorage
                            && typeof window.userStorage.setItem === 'function') {
                            window.userStorage.setItem(
                                'backtestingSession',
                                JSON.stringify(parentSess)
                            );
                        }
                    } catch (_) {}
                    reportToShell('info',
                        'mirrored parent backtestingSession (startDate='
                        + (parentSess.startDate || parentSess.start_date || '?')
                        + ', endDate='
                        + (parentSess.endDate || parentSess.end_date || '?')
                        + ')');
                }
            } catch (e) {
                reportToShell('warn',
                    'mirror parent backtestingSession failed: '
                    + (e && e.message || e));
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

            // ── Wipe protection + diagnostics for dm.drawings ─────────
            //
            // The user reports "drawings flash for ~1ms then disappear"
            // even after the loadTradingSessionStateIfNeeded patches +
            // ResizeObserver clip-path fix above. That pattern can ONLY
            // be produced by something WIPING dm.drawings (or the SVG
            // drawingsGroup's children) AFTER the initial render but
            // BEFORE the user can interact.
            //
            // Known internal wipe sites in drawing-tools-manager.js:
            //   • loadDrawings line 7193-7197 (wipes BEFORE reading
            //     storage; if the second call's read sees a stale
            //     localStorage entry, drawings stay wiped)
            //   • loadDrawingsFromData line 7308-7316 (already patched
            //     above)
            //   • redrawAll line 6613 (wipes SVG group only, then
            //     re-renders from dm.drawings — if dm.drawings is empty
            //     here, SVG stays empty)
            //   • clearDrawings line 6663 (user-triggered, harmless)
            //
            // Strategy:
            //   1. Wrap dm.loadDrawings in a guard: once we have shown
            //      drawings to the user (drawings.length > 0 after a
            //      successful call), refuse to invoke the original again.
            //      The destructive wipe-then-reload pattern is only
            //      "safe" on first load when drawings = []; after that,
            //      it's a footgun.
            //   2. Trap writes to dm.drawings via Object.defineProperty
            //      so any caller that does `dm.drawings = []` to nuke
            //      the array gets a console.warn + parent host-log with
            //      a stack trace. This tells us EXACTLY who wiped.
            //
            // Both are iframe-only (we're in embed-bridge); single-chart
            // /chart/ users see no behavior change.
            try {
                var dmGuard = ch.drawingManager;
                if (dmGuard && !dmGuard.__multichartGuardsInstalled) {
                    dmGuard.__multichartGuardsInstalled = true;

                    // (1) loadDrawings idempotency wrapper.
                    if (typeof dmGuard.loadDrawings === 'function') {
                        var __originalLoadDrawings = dmGuard.loadDrawings.bind(dmGuard);
                        var __loadCallCount = 0;
                        dmGuard.loadDrawings = function () {
                            __loadCallCount++;
                            var pre = (dmGuard.__rawDrawings && dmGuard.__rawDrawings.length)
                                || (dmGuard._drawingsArr && dmGuard._drawingsArr.length)
                                || 0;
                            try {
                                window.parent.postMessage({
                                    type: 'host-log', source: chartId, level: 'info',
                                    text: '[embed:' + chartId + '] loadDrawings call #'
                                        + __loadCallCount + ' (pre=' + pre + ')',
                                }, '*');
                            } catch (_) {}
                            // Once we've successfully loaded ≥1 drawing
                            // and another call comes in, SKIP. Don't let
                            // the destructive wipe-at-top fire a second
                            // time. If the caller wanted to refresh due
                            // to a tf change, refreshDrawingsForTimeframe
                            // is the correct entry point and it's not
                            // affected by this guard.
                            if (pre > 0 && __loadCallCount > 1) {
                                try {
                                    window.parent.postMessage({
                                        type: 'host-log', source: chartId, level: 'info',
                                        text: '[embed:' + chartId + '] loadDrawings call #'
                                            + __loadCallCount + ' SKIPPED — would wipe '
                                            + pre + ' existing drawings',
                                    }, '*');
                                } catch (_) {}
                                return Promise.resolve();
                            }
                            try {
                                var ret = __originalLoadDrawings();
                                if (ret && typeof ret.then === 'function') {
                                    return ret.then(function (r) {
                                        var post = (dmGuard.__rawDrawings && dmGuard.__rawDrawings.length)
                                            || (dmGuard._drawingsArr && dmGuard._drawingsArr.length)
                                            || 0;
                                        try {
                                            window.parent.postMessage({
                                                type: 'host-log', source: chartId, level: 'info',
                                                text: '[embed:' + chartId + '] loadDrawings call #'
                                                    + __loadCallCount + ' done (post=' + post + ')',
                                            }, '*');
                                        } catch (_) {}
                                        return r;
                                    });
                                }
                                return ret;
                            } catch (e) {
                                try {
                                    window.parent.postMessage({
                                        type: 'host-log', source: chartId, level: 'error',
                                        text: '[embed:' + chartId + '] loadDrawings threw: ' + (e && e.message || e),
                                    }, '*');
                                } catch (_) {}
                                throw e;
                            }
                        };
                    }

                    // (2) dm.drawings setter trap. Logs every assignment
                    // that wipes a populated array (length > 0 → 0).
                    // _drawingsArr is the backing storage; the property
                    // descriptor proxies reads/writes through it.
                    try {
                        var __initialDrawings = dmGuard.drawings;
                        Object.defineProperty(dmGuard, '_drawingsArr', {
                            value: Array.isArray(__initialDrawings) ? __initialDrawings : [],
                            writable: true, configurable: true, enumerable: false,
                        });
                        Object.defineProperty(dmGuard, 'drawings', {
                            configurable: true,
                            enumerable: true,
                            get: function () { return this._drawingsArr; },
                            set: function (v) {
                                var prev = this._drawingsArr;
                                var prevLen = (prev && prev.length) || 0;
                                var nextLen = (Array.isArray(v) && v.length) || 0;
                                if (prevLen > 0 && nextLen === 0) {
                                    var stack = '';
                                    try { stack = new Error().stack || ''; } catch (_) {}
                                    var firstFrames = stack.split('\n').slice(1, 6).join(' | ');
                                    try {
                                        console.warn('[embed:' + chartId + '] dm.drawings WIPE '
                                            + '(' + prevLen + ' → 0)\n', stack);
                                    } catch (_) {}
                                    try {
                                        window.parent.postMessage({
                                            type: 'host-log', source: chartId, level: 'warn',
                                            text: '[embed:' + chartId + '] dm.drawings WIPE ('
                                                + prevLen + ' → 0) at: ' + firstFrames,
                                        }, '*');
                                    } catch (_) {}
                                }
                                this._drawingsArr = Array.isArray(v) ? v : [];
                            },
                        });
                    } catch (e) {
                        try {
                            window.parent.postMessage({
                                type: 'host-log', source: chartId, level: 'error',
                                text: '[embed:' + chartId + '] dm.drawings setter trap install failed: '
                                    + (e && e.message || e),
                            }, '*');
                        } catch (_) {}
                    }
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
                // One redraw after bars land — avoids 4 extra full redraw passes that
                // made multichart tiles flash during boot.
                var onDataRedraw = function () {
                    global.removeEventListener('chartDataLoaded', onDataRedraw);
                    scheduleMcRedraw('chartDataLoaded');
                };
                global.addEventListener('chartDataLoaded', onDataRedraw);
                requestAnimationFrame(function () {
                    scheduleMcRedraw('boot-raf');
                });
            } catch (_) {}
            var afterLoad = function () {
                markViewportBootSettle(ch, 500);
                // Only switch tf when it actually differs — calling
                // setTimeframe with the already-loaded tf would trigger a
                // redundant re-fetch that, in replay, can re-anchor the
                // window and undo the playhead-matched load above.
                if (tf && typeof ch.setTimeframe === 'function'
                    && ch.currentTimeframe !== tf) {
                    try { ch.setTimeframe(tf); } catch (_) {}
                }
                try {
                    if (typeof ch.render === 'function') ch.render();
                } catch (_) {}
                try {
                    if (typeof ch.updateChartOHLCSymbol === 'function' && ch.currentSymbol) {
                        ch.updateChartOHLCSymbol(ch.currentSymbol);
                    }
                } catch (_) {}
                try {
                    if (ch.drawingManager && typeof ch.drawingManager.redrawAll === 'function'
                        && ch.xScale && ch.yScale) {
                        ch.drawingManager.redrawAll();
                    }
                } catch (_) {}
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

            // ── Pick the right data-fetch entry point ──────────────────
            //
            // When the parent is in a backtest session the iframe MUST
            // mirror parent's data window or the two panels visibly load
            // different ranges.
            //
            //   • Parent (URL has mode=backtest) runs autoLoadBacktestingData
            //     via its own checkBacktestingMode constructor hook. That
            //     calls _fetchSmartWindow with anchor='end',
            //     skipSessionDates:true, windowRange.endTs=sessionEndMs
            //     → up to 100k 1D bars ENDING at session end → user sees
            //     the whole "lead-up before replay start".
            //
            //   • Iframe via loadFileData(fileId) builds a DIFFERENT
            //     param set: requestTimeframe='1m', no anchor, no
            //     windowRange, BOTH start_ts and end_ts pulled from
            //     session.startDate / session.endDate (no skip flag).
            //     Result: 1m bars only inside the session window — a
            //     much SHORTER history with no pre-session lead-up.
            //     Visible to the user as "Panel A shows last year,
            //     Panel B only shows last two months — why?".
            //
            // Fix: forward `mode=backtest|propfirm` from parent into
            // every iframe URL (see MultichartGrid.buildIframeSrc).
            // chart.js's checkBacktestingMode then runs autoLoadBacktestingData
            // INSIDE the iframe with identical params to the parent →
            // identical data window. The dist-v9 multichart shim hides
            // the splash overlay (#backtestingLoader) + bt-preload
            // visibility gate so users never see the iframe's loader.
            //
            // When mode=backtest is in URL, embed-bridge MUST NOT call
            // loadFileData / autoLoadBacktestingData itself — that would
            // double-load (chart.js handles it asynchronously via the
            // constructor → checkBacktestingMode chain). Instead we just
            // wait for chartDataLoaded (or wait a tick) and then apply
            // the user's preferred timeframe (chart.js forces '1d' in
            // backtest mode; if the parent was on a different tf when
            // the user split, we want the iframe to follow).
            //
            // For non-backtest panels (no mode in URL) we keep the
            // explicit loadFileData(fileId) path — chart.js does no
            // automatic load when there's no mode= param.
            var paramMode = (params.get('mode') || '').toLowerCase();
            var deferToCheckBacktestingMode = (paramMode === 'backtest'
                || paramMode === 'propfirm');
            var p;
            if (deferToCheckBacktestingMode) {
                reportToShell('info', 'mode=' + paramMode
                    + ' in URL; deferring data-load to chart.js checkBacktestingMode');
                // Apply user's preferred tf once data lands — chart.js
                // forces '1d' on backtest open, but if the parent was
                // on e.g. 1h before the split we want the iframe to
                // match. setTimeframe is a no-op when current tf
                // already equals the requested one, so this is safe to
                // run unconditionally.
                if (tf && tf !== '1d' && typeof ch.setTimeframe === 'function') {
                    var applyTfOnce = function () {
                        try {
                            // Re-read currentTimeframe to avoid
                            // re-fetching when chart.js already
                            // converged on the requested tf via some
                            // other code path (defensive).
                            if (ch.currentTimeframe !== tf) {
                                ch.setTimeframe(tf);
                            }
                        } catch (e) {
                            reportToShell('warn', 'setTimeframe(' + tf
                                + ') threw: ' + (e && e.message || e));
                        }
                    };
                    // chartDataLoaded fires after autoLoad's
                    // _commitLoadedBars. Wait for it once, then apply
                    // the tf override (which itself triggers a re-load
                    // and a second chartDataLoaded — but that won't
                    // re-enter this listener because of {once:true}).
                    global.addEventListener('chartDataLoaded', function onceTf() {
                        global.removeEventListener('chartDataLoaded', onceTf);
                        // Defer one tick so chart.js post-load
                        // bookkeeping (rawData index, lastBarMs) settles
                        // before setTimeframe re-fetches.
                        setTimeout(applyTfOnce, 0);
                    });
                }
                reportToShell('info', 'initial context applied (deferred): fileId=' + fileId
                    + ' tf=' + (tf || '(default)')
                    + ' sessionId=' + (sessionId || '(none)'));
                return;
            }
            // ── Backtest / replay panel → same path as host pair switch ──
            var btSession = ch.backtestingSession
                || (function () {
                    try {
                        var pc = readParentChart();
                        return pc && pc.backtestingSession ? pc.backtestingSession : null;
                    } catch (_) { return null; }
                })();
            if (btSession) {
                try { ch.backtestingSession = btSession; } catch (_) {}
                var runPanelLoad = function () {
                    var pc = readParentChart();
                    try {
                        if (pc && typeof pc._ensureMultichartHostExportReady === 'function') {
                            pc._ensureMultichartHostExportReady();
                        }
                    } catch (_) {}
                    var playheadTs = readParentPlayhead();
                    var loadFid = fileId;
                    if (!loadFid && pc && pc.currentFileId) {
                        loadFid = String(pc.currentFileId);
                    }
                    if (!loadFid) {
                        reportToShell('warn', 'loadFileData: no fileId');
                        return;
                    }
                    var pcBoot = readParentChart();
                    var samePairBoot = pcBoot && String(pcBoot.currentFileId || '') === String(loadFid);
                    if (samePairBoot
                        && pcBoot.replaySystem
                        && Array.isArray(pcBoot.replaySystem.fullRawData)
                        && pcBoot.replaySystem.fullRawData.length > 0) {
                        reportToShell('info', 'boot: parent native master (no /smart) fileId=' + loadFid);
                    }
                    reportToShell('info', 'loadMultichartPanelFile fileId=' + loadFid + ' tf=' + (tf || '?')
                        + (playheadTs != null ? ' playhead=' + playheadTs : ''));
                    ch._multichartPairLoadInFlight = true;
                    var useMcBoot = typeof ch.loadMultichartPanelFile === 'function';
                    var lp = useMcBoot
                        ? ch.loadMultichartPanelFile(String(loadFid), {
                            timeframe: tf || undefined,
                            replayTimestamp: playheadTs,
                        })
                        : ch.loadFileData(String(loadFid));
                    var bootReplay = function () {
                        ch._multichartPairLoadInFlight = false;
                        markViewportBootSettle(ch, 500);
                        if (useMcBoot) {
                            afterLoad();
                            return;
                        }
                        if (!Number.isFinite(playheadTs)) {
                            afterLoad();
                            return;
                        }
                        try {
                            var rs = ch.replaySystem;
                            if (!rs && typeof ch.initReplaySystem === 'function') ch.initReplaySystem();
                            rs = ch.replaySystem;
                            if (rs && !rs.isActive && typeof rs.enterReplayMode === 'function') {
                                rs.enterReplayMode({ suppressInitialUpdateChartData: true });
                            }
                            if (rs && rs.isActive && typeof rs.goToReplayTimestamp === 'function') {
                                rs.goToReplayTimestamp(playheadTs, { centerOnCandle: true });
                            }
                            if (typeof ch._reseedReplayFullRawFromLoadedData === 'function') {
                                ch._reseedReplayFullRawFromLoadedData();
                            }
                        } catch (_) {}
                        afterLoad();
                    };
                    if (lp && typeof lp.then === 'function') {
                        lp.then(bootReplay, function (err) {
                            ch._multichartPairLoadInFlight = false;
                            reportToShell('error', 'loadFileData failed: '
                                + (err && err.message || err));
                        });
                    } else {
                        bootReplay();
                    }
                };
                var hostReadyForMirror = function () {
                    var pc = readParentChart();
                    if (!pc) return true;
                    var fid = fileId || (pc.currentFileId != null ? String(pc.currentFileId) : '');
                    if (!fid || String(pc.currentFileId || '') !== String(fid)) return true;
                    try {
                        if (typeof pc._ensureMultichartHostExportReady === 'function') {
                            pc._ensureMultichartHostExportReady();
                        }
                    } catch (_) {}
                    var ch = window.chart;
                    if (ch && typeof ch._parentMultichartMasterReady === 'function') {
                        return ch._parentMultichartMasterReady(pc, fid);
                    }
                    var prs = pc.replaySystem;
                    if (prs && Array.isArray(prs.fullRawData) && prs.fullRawData.length > 0) {
                        return true;
                    }
                    return Array.isArray(pc.rawData) && pc.rawData.length > 0;
                };
                if (hostReadyForMirror()) {
                    runPanelLoad();
                } else {
                    // Wait for tile A's replay master before boot — avoids tiny seek-buffer islands.
                    pollFor(hostReadyForMirror, 50, 3000, runPanelLoad, runPanelLoad);
                }
                return;
            }

            // Live / no session — loadFileData clones parent memory when same pair
            try {
                var pcLive = readParentChart();
                if (pcLive && typeof pcLive._ensureMultichartHostExportReady === 'function') {
                    pcLive._ensureMultichartHostExportReady();
                }
            } catch (_) {}
            p = ch.loadFileData(fileId);
            if (p && typeof p.then === 'function') {
                p.then(afterLoad, function (err) {
                    reportToShell('error', 'loadFileData failed: '
                        + (err && err.message || err));
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
        suppressEmbedChartBrand();
        pollFor(
            function () {
                return !!window.chart
                    && !!window.MultichartGuards
                    && !!window.MultichartBridge;
            },
            150,
            30000,
            installOnce,
            function () {
                reportToShell('error',
                    'multichart boot timeout after 30s — need window.chart + MultichartGuards + MultichartBridge. '
                    + 'If chart exists but bridge globals are missing, bridge scripts ran out of order or '
                    + '/chart/multichart-prod/*.js failed to load (check Network tab). '
                    + 'If chart is missing: auth redirect, bundle error, or chart.js init threw '
                    + '(open this iframe URL in a new tab).');
            }
        );
    }

    if (document.readyState === 'loading') {
        suppressEmbedChartBrand();
        document.addEventListener('DOMContentLoaded', boot, { once: true });
    } else {
        boot();
    }
})();
