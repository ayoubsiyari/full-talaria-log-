/**
 * sync-bridge.js
 *
 * Runs INSIDE each chart iframe. Wires `chart.js` events to outbound
 * postMessage to the parent shell, and applies inbound sync messages
 * from the parent to the local chart.
 *
 * Strict allowlist enforced via `MultichartGuards.FORBIDDEN_SYNC_FIELDS`
 * and the postMessage envelope schema — only `time`, `startTime`,
 * `endTime`, `symbol` ever cross the bridge.
 *
 * Loop guard: every outbound message carries a `causationId`. When the
 * bridge applies an inbound sync, it tags the chart with that causationId.
 * Native chart events fired in response to that programmatic update are
 * matched by the recently-applied causationId and DROPPED before forwarding.
 *
 * Loaded by `chart-host.html` after `chart.js` and after the chart
 * instance is created.
 */
(function (global) {
    'use strict';

    const G = global.MultichartGuards;
    if (!G) {
        console.error('[sync-bridge] MultichartGuards not loaded — load engine-api-guards.js first');
        return;
    }

    /** Ring buffer for loop guard. */
    function RingBuffer(cap) {
        this.cap = cap;
        this.arr = [];
    }
    RingBuffer.prototype.add = function (v) {
        this.arr.push(v);
        if (this.arr.length > this.cap) this.arr.shift();
    };
    RingBuffer.prototype.has = function (v) {
        return this.arr.indexOf(v) !== -1;
    };

    /** Generate a v4-ish UUID. Doesn't need to be cryptographically strong. */
    function uuid() {
        const r = (Math.random() * 1e9 | 0).toString(16);
        return Date.now().toString(16) + '-' + r + '-' + (Math.random() * 1e9 | 0).toString(16);
    }

    /** Heuristic ms->s: chart.js stores `t` in seconds at our backend, but
     *  legacy paths sometimes hold ms. >1e12 must be ms.  */
    function toSeconds(t) {
        if (!Number.isFinite(t)) return 0;
        return t > 1e12 ? Math.floor(t / 1000) : Math.floor(t);
    }
    function toMillis(t) {
        if (!Number.isFinite(t)) return 0;
        return t > 1e12 ? Math.floor(t) : Math.floor(t) * 1000;
    }

    /** Snap helpers per Phase 0 Decision 3. */
    function floorToBucket(timeSec, bucketSec) {
        return Math.floor(timeSec / bucketSec) * bucketSec;
    }
    function ceilToBucket(timeSec, bucketSec) {
        return Math.ceil(timeSec / bucketSec) * bucketSec;
    }

    // Inline timeframe-to-seconds map. v10: this used to be sourced from
    // sample-data.js (TIMEFRAME_SECONDS export), but sample-data.js was
    // removed when we switched to real-data-only mode.
    const TIMEFRAME_SECONDS = {
        '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800,
        '1h': 3600, '2h': 7200, '4h': 14400,
        '1d': 86400, '1w': 604800, '1M': 2592000,
    };
    function tfSec(tf) { return TIMEFRAME_SECONDS[tf] || 60; }

    /**
     * Apply a sync'd visible time-range to the recipient chart.
     *
     * Modeled after chart.js's own internal cross-panel sync (chart.js:2015-
     * 2053). Key safety properties:
     *
     *   • Never sets candleWidth so small that candles disappear (MIN_BARS).
     *   • Always centres on the closest candle to the synced midpoint.
     *   • If post-alignment the visible bar count would be 0 (e.g. midpoint
     *     fell outside this chart's data range), falls back to fitToView()
     *     so the user always sees SOMETHING. Without this guard, panning
     *     chart A (1m) by a small delta would leave chart B (1h) showing an
     *     empty canvas — which is exactly the "jump and hide" bug.
     *   • Forces autoScale=true so the recipient's price axis re-fits its OWN
     *     newly-visible candles. NEVER reads min/max from the source chart.
     *
     * @param {object} chart   recipient chart instance
     * @param {number} startSec  inclusive start of source visible window (seconds)
     * @param {number} endSec    exclusive end of source visible window (seconds)
     */
    function setVisibleTimeRange(chart, startSec, endSec) {
        if (!chart || !chart.data || chart.data.length === 0) return;
        if (!chart.canvas) return;

        const m = chart.margin || { l: 60, r: 60 };
        const widthPx = (chart.w || chart.canvas.width || 800) - (m.l + m.r);
        if (widthPx <= 0) return;

        // Bar duration of THIS chart (recipient), in seconds.
        let barSec = 60;
        try {
            const ms = chart.inferBarDurationMs ? chart.inferBarDurationMs() : 60000;
            if (Number.isFinite(ms) && ms > 0) barSec = Math.max(1, Math.floor(ms / 1000));
        } catch (_) {}

        // How many recipient-bars are in the source's visible window?
        const spanSec = Math.max(1, endSec - startSec);
        const desiredBars = spanSec / barSec;
        // Floor so we always show enough candles to be visually useful.
        // E.g. 30-min source window on a 1h recipient = 0.5 bars; clamping to
        // 30 gives the user 30 hours of context centred on the midpoint instead
        // of an essentially empty chart.
        const MIN_BARS_TO_SHOW = 30;
        const MAX_BARS_TO_SHOW = chart.data.length;
        const targetBars = Math.max(MIN_BARS_TO_SHOW, Math.min(MAX_BARS_TO_SHOW, desiredBars));

        // Compute the candleWidth that would fit targetBars in widthPx pixels.
        const idealCandleWidth = widthPx / targetBars;

        // Snap to the chart's allowed zoom levels (TradingView-style discrete
        // zoom rungs). Keeps the chart's own zoom state consistent with what a
        // user could reach via the wheel.
        if (chart.zoomLevel && Array.isArray(chart.zoomLevel.allowedWidths)
            && chart.zoomLevel.allowedWidths.length > 0) {
            const allowed = chart.zoomLevel.allowedWidths;
            let nearestIdx = 0, best = Infinity;
            for (let i = 0; i < allowed.length; i++) {
                const d = Math.abs(allowed[i] - idealCandleWidth);
                if (d < best) { best = d; nearestIdx = i; }
            }
            chart.zoomLevel.candleWidthIndex = nearestIdx;
            chart.candleWidth = allowed[nearestIdx];
        } else {
            chart.candleWidth = Math.max(0.5, Math.min(80, idealCandleWidth));
        }

        // Find the recipient candle closest to the midpoint of the source's
        // visible window. Linear scan — chart.data is small (≤20k) and this
        // runs at most once per rAF on the recipient.
        const midMs = ((startSec + endSec) / 2) * 1000;
        let bestIdx = 0;
        let bestDiff = Infinity;
        for (let i = 0; i < chart.data.length; i++) {
            const t = +chart.data[i].t;
            if (!Number.isFinite(t)) continue;
            const d = Math.abs(t - midMs);
            if (d < bestDiff) { bestDiff = d; bestIdx = i; }
        }

        // Position offsetX so bestIdx is at the horizontal CENTER of the chart
        // drawing area. Same arithmetic chart.js uses in its own jumpToTimestamp
        // (chart.js:11167-11172) and cross-panel align (chart.js:2041).
        const cw = (chart.w || widthPx) - m.l - m.r;
        const candleSpacing = (typeof chart.getCandleSpacing === 'function')
            ? chart.getCandleSpacing()
            : chart.candleWidth;
        if (candleSpacing > 0 && cw > 0) {
            const centerX = cw / 2;
            const candleX = bestIdx * candleSpacing;
            chart.offsetX = centerX - candleX;
            if (typeof chart.constrainOffset === 'function') {
                try { chart.constrainOffset(); } catch (_) {}
            }
        }

        // Safety net (mirrors chart.js:2050-2053): if our alignment left zero
        // bars on screen, fall back to fitToView so we never produce a blank
        // chart. This is the actual fix for the "jump and hide" report.
        const visibleBarCount = function () {
            const cs = (typeof chart.getCandleSpacing === 'function')
                ? chart.getCandleSpacing() : chart.candleWidth;
            if (cs <= 0 || cw <= 0) return chart.data.length;
            const i0 = Math.max(0, -Math.floor(chart.offsetX / cs));
            const i1 = Math.min(chart.data.length, i0 + Math.ceil(cw / cs));
            return Math.max(0, i1 - i0);
        };
        if (visibleBarCount() === 0) {
            try { chart.fitToView && chart.fitToView(); } catch (_) {}
        }

        // Force price autoScale ON so the recipient's price axis recomputes
        // from its OWN newly-visible candles. NEVER set min/max from outside.
        if (chart.priceScale) chart.priceScale.autoScale = true;
        chart.autoScale = true;

        if (typeof chart.scheduleRender === 'function') chart.scheduleRender();
    }

    /**
     * Read the chart's visible time range as { startSec, endSec }.
     * Uses the same fields chart.js dispatches on `chartScrolled`.
     */
    function readVisibleTimeRange(chart) {
        if (!chart || !chart.data || chart.data.length === 0) return null;
        const startIdx = typeof chart.getVisibleStartIndex === 'function' ? chart.getVisibleStartIndex() : 0;
        const endIdx   = typeof chart.getVisibleEndIndex   === 'function' ? chart.getVisibleEndIndex()   : chart.data.length - 1;
        const startT   = chart.data[startIdx] && chart.data[startIdx].t;
        const endT     = chart.data[endIdx]   && chart.data[endIdx].t;
        const barMs    = chart.inferBarDurationMs ? chart.inferBarDurationMs() : 60000;
        if (!Number.isFinite(startT) || !Number.isFinite(endT)) return null;
        return {
            startSec: toSeconds(startT),
            endSec:   toSeconds(endT) + Math.floor(barMs / 1000),
        };
    }

    /**
     * Install the bridge on the global window. Call ONCE per iframe after
     * `window.chart` exists.
     */
    function installBridge(chart, opts) {
        opts = opts || {};
        const chartId = opts.chartId || 'chart-?';
        const parentOrigin = opts.parentOrigin || '*';
        const log = (...a) => { if (opts.verbose) console.log('[bridge:' + chartId + ']', ...a); };
        const warn = (...a) => console.warn('[bridge:' + chartId + ']', ...a);

        const state = {
            chartId,
            parentOrigin,
            applied: new RingBuffer(16),
            tick: 0,
            // ──────────────────────────────────────────────────────────────
            // v10.4.8 (Phase 6.2 sync regression fix):
            //
            // Previous design used a `suppressOutbound` integer counter:
            // every inbound apply pre-paid +N to the budget expecting +N
            // native echoes from chart.js. That assumption was wrong —
            // setVisibleTimeRange in this bridge only mutates fields and
            // schedules a render, it never calls dispatchScrollSync, so the
            // counter accumulated. After a few B->A syncs, A's
            // suppressOutbound was a large positive number; the user's
            // genuine pan events on A were silently drained from the
            // counter and never broadcast — A appeared dead.
            //
            // New design: a boolean `applying` window that is set true at
            // the start of an inbound apply and cleared on the next two
            // animation frames (chart.js render & chartScrolled paths are
            // rAF-deferred). Because the window is time-bounded, it cannot
            // accumulate across syncs. Programmatic echoes that land
            // within the window are dropped; user input that fires after
            // the window passes through normally.
            applying: false,
            applyingClearRaf: 0,
            inboundSnap: null,
            inboundMode: null,
        };

        global.__multichartBridgeState = state;

        function beginApplying() {
            state.applying = true;
            if (state.applyingClearRaf) cancelAnimationFrame(state.applyingClearRaf);
            // Double rAF: chart.js's render is rAF-deferred and the
            // chartScrolled echo lands one more frame later.
            state.applyingClearRaf = requestAnimationFrame(function () {
                state.applyingClearRaf = requestAnimationFrame(function () {
                    state.applying = false;
                    state.applyingClearRaf = 0;
                });
            });
        }

        // ─── outbound: chart -> parent ─────────────────────────────────────

        function send(envelope) {
            const cleaned = G.filterForbiddenFields(envelope);
            if (cleaned.dropped.length) {
                console.error('[bridge:' + chartId + '] dropped forbidden fields:', cleaned.dropped);
            }
            // Inject envelope metadata
            cleaned.clean.source = chartId;
            cleaned.clean.causationId = cleaned.clean.causationId || uuid();
            cleaned.clean.syncTick = ++state.tick;
            try {
                global.parent.postMessage(cleaned.clean, parentOrigin);
                log('out', cleaned.clean.type, cleaned.clean);
            } catch (e) {
                warn('postMessage failed', e);
            }
        }

        // ── rAF coalescer ─────────────────────────────────────────────────
        // mouse moves fire at 60-120Hz; chart.js's updateCrosshair calls
        // broadcastCrosshairSync on every move. Postmessage round-trips at
        // that rate make the peer chart visibly lag. Coalesce so at most one
        // crosshair postMessage goes out per animation frame, with the LATEST
        // value. Same for visible-range pan.
        const pending = { crosshair: null, crosshairClear: false, visibleRange: null };
        let rafScheduled = false;
        function flushPending() {
            rafScheduled = false;
            if (pending.crosshairClear) {
                pending.crosshairClear = false;
                send({ type: 'crosshair-clear' });
            } else if (pending.crosshair !== null) {
                const t = pending.crosshair; pending.crosshair = null;
                send({ type: 'crosshair', time: toSeconds(t) });
            }
            if (pending.visibleRange) {
                const r = pending.visibleRange; pending.visibleRange = null;
                send({ type: 'visibleRange', startTime: r.startSec, endTime: r.endSec });
            }
        }
        function scheduleFlush() {
            if (rafScheduled) return;
            rafScheduled = true;
            requestAnimationFrame(flushPending);
        }

        // 1) Crosshair — monkey-patch broadcastCrosshairSync.
        //
        // We chain the original implementation (if any) so that within-chart
        // sub-panel sync (e.g. an indicator panel below the price panel)
        // continues to work after the bridge is installed. Without this, the
        // host parent's #chartWrapper (where indicators may be present) would
        // lose its internal crosshair sync the moment we go multi-panel.
        chart._crosshairPanelSyncAllowed = function () {
            return !!chart.syncCrosshair;
        };
        const __origBroadcastCrosshairSync = (typeof chart.broadcastCrosshairSync === 'function')
            ? chart.broadcastCrosshairSync.bind(chart)
            : null;
        chart.broadcastCrosshairSync = function (timestamp, price) {
            // Bridge fan-out (cross-chart) — gated by the applying window.
            if (!state.applying) {
                if (timestamp === null || timestamp === undefined) {
                    pending.crosshair = null;
                    pending.crosshairClear = true;
                } else {
                    pending.crosshair = timestamp;
                    pending.crosshairClear = false;
                }
                scheduleFlush();
            }
            // Preserve original within-chart sub-panel sync if it existed.
            if (__origBroadcastCrosshairSync) {
                try { __origBroadcastCrosshairSync(timestamp, price); } catch (_) {}
            }
        };

        // 2) Visible range — listen to chartScrolled (also rAF-coalesced)
        global.addEventListener('chartScrolled', function (ev) {
            if (state.applying) return;
            const d = ev.detail || {};
            if (d.chart !== chart) return;
            const startT = d.startTimestamp;
            const endT   = d.timeSyncEndTimestamp || d.endTimestamp;
            if (!Number.isFinite(startT) || !Number.isFinite(endT)) return;
            pending.visibleRange = { startSec: toSeconds(startT), endSec: toSeconds(endT) };
            scheduleFlush();
        });

        // 3) Symbol / data load — re-emit chart-state, NOT a sync event.
        //    v10.3: also include firstBarMs/lastBarMs so the shell can detect
        //    cross-panel date-range mismatches (different files covering
        //    non-overlapping periods → crosshair sync visibly no-ops because
        //    receiveCrosshairSync hides when synced time is outside view).
        global.addEventListener('chartDataLoaded', function (ev) {
            const d = ev.detail || {};
            let firstBarMs = null, lastBarMs = null;
            if (chart.data && chart.data.length > 0) {
                const t0 = +chart.data[0].t;
                const tN = +chart.data[chart.data.length - 1].t;
                if (Number.isFinite(t0)) firstBarMs = t0 > 1e12 ? t0 : t0 * 1000;
                if (Number.isFinite(tN)) lastBarMs  = tN > 1e12 ? tN : tN * 1000;
            }
            try {
                global.parent.postMessage({
                    type: 'chart-state',
                    source: chartId,
                    state: {
                        // v10.5.0: report fileId so the shell can persist
                        // which file each panel has loaded for session
                        // restore. Forbidden-fields filter still applies
                        // on inbound; fileId is not in the forbidden list.
                        fileId: d.fileId || null,
                        symbol: d.symbol || chart.currentSymbol || null,
                        timeframe: d.timeframe || chart.currentTimeframe || null,
                        candleCount: chart.data ? chart.data.length : 0,
                        firstBarMs: firstBarMs,
                        lastBarMs: lastBarMs,
                    },
                }, parentOrigin);
            } catch (_) {}
        });

        // 4) Timeframe — chart-state only (NOT a sync field per Decision 1)
        global.addEventListener('timeframeChanged', function (ev) {
            const d = ev.detail || {};
            if (d.chart !== chart) return;
            try {
                global.parent.postMessage({
                    type: 'chart-state',
                    source: chartId,
                    state: { timeframe: d.timeframe },
                }, parentOrigin);
            } catch (_) {}
        });

        // 5) Drawings — monkey-patch broadcastDrawingChange.
        //
        // chart.js's native broadcastDrawingChange (chart.js:21008) walks
        // window.panelManager.panels and calls receiveDrawingChange on
        // each peer. window.panelManager doesn't exist in the multichart
        // architecture (we replaced it with iframes + this bridge), so
        // the native impl returns early on line 21010 — no drawing ever
        // syncs. We replace it with a postMessage-based fan-out.
        //
        // Outbound: every add/update/remove/clear from chart.js's drawing
        // tools manager flows through here, gets serialized to JSON, and
        // posted to parent. The manager fans it out to peers; each peer's
        // bridge calls chart.receiveDrawingChange (which does NOT check
        // window.panelManager — see chart.js:21047) so the drawing
        // appears on every other panel.
        //
        // Loop guard: we set chart._receivingDrawingSync = true while
        // applying inbound drawings (same flag chart.js's native impl
        // uses), and skip outbound while it's true. This prevents the
        // received drawing from being re-broadcast back to its source.
        //
        // We chain the original impl for in-process (legacy panel-manager
        // sub-panels). Defensive even though it's a no-op without
        // panelManager — keeps behavior matching what chart.js expects
        // if the legacy system ever returns.
        const __origBroadcastDrawingChange = (typeof chart.broadcastDrawingChange === 'function')
            ? chart.broadcastDrawingChange.bind(chart)
            : null;
        chart.broadcastDrawingChange = function (action, drawing, drawingIndex) {
            // Skip outbound while we're applying an inbound drawing
            // change — the drawing manager will call this from inside
            // receiveDrawingChange, and we don't want a loop.
            if (chart._receivingDrawingSync) {
                if (__origBroadcastDrawingChange) {
                    try { __origBroadcastDrawingChange(action, drawing, drawingIndex); } catch (_) {}
                }
                return;
            }
            // Serialize drawing for transport. Use toJSON if the drawing
            // class provides it (most do, see drawing-tools-base.js); else
            // fall back to a JSON.parse(JSON.stringify) deep-clone so we
            // don't accidentally postMessage a class instance with cyclic
            // refs.
            let drawingData = null;
            try {
                if (drawing && typeof drawing.toJSON === 'function') {
                    drawingData = drawing.toJSON();
                } else if (drawing != null) {
                    drawingData = JSON.parse(JSON.stringify(drawing));
                }
            } catch (e) {
                warn('drawing serialize failed', action, e && e.message);
                drawingData = null;
            }
            if (action !== 'clear' && !drawingData) {
                if (__origBroadcastDrawingChange) {
                    try { __origBroadcastDrawingChange(action, drawing, drawingIndex); } catch (_) {}
                }
                return;
            }
            try {
                global.parent.postMessage({
                    type:        'drawing-' + action, // 'drawing-add' | 'drawing-update' | 'drawing-remove' | 'drawing-clear'
                    source:      chartId,
                    causationId: uuid(),
                    syncTick:    ++state.tick,
                    drawing:     drawingData,
                    drawingIndex: (typeof drawingIndex === 'number') ? drawingIndex : null,
                }, parentOrigin);
                log('out', 'drawing-' + action, drawingData && drawingData.id);
            } catch (e) {
                warn('drawing postMessage failed', e && e.message);
            }
            // Preserve original (no-op without panelManager but keeps
            // behavior matching what chart.js expects).
            if (__origBroadcastDrawingChange) {
                try { __origBroadcastDrawingChange(action, drawing, drawingIndex); } catch (_) {}
            }
        };

        // ─── inbound: parent -> chart ──────────────────────────────────────
        //
        // The same handler is used in two ways:
        //   (a) iframe panels — receives MessageEvent via window.postMessage
        //       from the parent shell.
        //   (b) host panel (parent's own window.chart) — invoked DIRECTLY by
        //       the manager's `_send` via the exposed `deliver` method.
        //       Direct invocation avoids the manager hearing its own outbound
        //       message back through window.postMessage and re-fanning it to
        //       all peers (which would loop indefinitely because the manager
        //       has no outbound causationId guard of its own; only the bridge
        //       does).
        // The set of message types this bridge actually CARES about.
        // Everything else (chart-state metadata reports, panel-cmd, panel-
        // focus, cmd-result, panel-cmd-ready, host-log, bridge-ready, …)
        // is meant for the manager / parent React tree, not for this
        // bridge to apply to the chart. We must NOT run those through
        // filterForbiddenFields because chart-state legitimately carries
        // metadata fields named like sync fields ("timeframe" reports the
        // panel's CURRENT tf to the parent UI, it doesn't dictate it to
        // peers). Filtering them spams the console with `inbound forbidden
        // fields dropped` errors many times per second on every
        // visible-range update, which is a real UX problem even though
        // the messages themselves are silently ignored by the type switch
        // below.
        const SYNC_MSG_TYPES = {
            'crosshair':       true,
            'crosshair-clear': true,
            'visibleRange':    true,
            'symbol':          true,
            'bridge-config':   true,
            'guard-self-test': true,
            // Drawing sync types — handled by applyDrawingChange below.
            // These do NOT carry FORBIDDEN_SYNC_FIELDS payloads (drawings
            // are pure user content), so the filter is a defensive no-op
            // for them.
            'drawing-add':     true,
            'drawing-update':  true,
            'drawing-remove':  true,
            'drawing-clear':   true,
        };

        function applyInbound(msg) {
            if (!msg || typeof msg !== 'object') return;
            // Ignore messages we ourselves originated. For iframe bridges
            // this matches strictly. For the host bridge this is also the
            // mechanism that prevents the manager-to-host directDeliver of
            // host-originated messages from being applied (manager skips
            // source==chartId in _fanOut already, but defense-in-depth here
            // protects against any future fan-out that forgets to filter).
            if (msg.source && msg.source === chartId) return;

            // Skip filter+apply entirely for non-sync types. The forbidden-
            // fields filter is a SYNC-channel guard (no chart should
            // dictate another's price/timeframe via sync); applying it to
            // metadata reports is a category error.
            if (!SYNC_MSG_TYPES[msg.type]) return;

            const cleaned = G.filterForbiddenFields(msg);
            if (cleaned.dropped.length) {
                console.error('[bridge:' + chartId + '] inbound forbidden fields dropped:', cleaned.dropped);
            }
            const m = cleaned.clean;

            // Loop guard — drop any message whose causationId we've recently
            // applied (i.e. it's the echo of our OWN outbound).
            if (m.causationId && state.applied.has(m.causationId)) {
                log('drop loop echo', m.type, m.causationId);
                return;
            }

            try {
                if (m.type === 'crosshair') {
                    applyCrosshair(m);
                } else if (m.type === 'crosshair-clear') {
                    applyCrosshairClear(m);
                } else if (m.type === 'visibleRange') {
                    applyVisibleRange(m);
                } else if (m.type === 'symbol') {
                    applySymbol(m);
                } else if (m.type === 'bridge-config') {
                    applyBridgeConfig(m);
                } else if (m.type === 'guard-self-test') {
                    runSelfTest();
                } else if (m.type === 'drawing-add'
                        || m.type === 'drawing-update'
                        || m.type === 'drawing-remove'
                        || m.type === 'drawing-clear') {
                    applyDrawingChange(m);
                }
                // unknown types are silently ignored
            } catch (e) {
                warn('inbound apply error', m.type, e);
            }
        }

        function applyDrawingChange(m) {
            if (typeof chart.receiveDrawingChange !== 'function') {
                warn('chart.receiveDrawingChange missing — cannot apply drawing sync');
                return;
            }
            const action = m.type.slice('drawing-'.length); // 'add' | 'update' | 'remove' | 'clear'
            state.applied.add(m.causationId);

            // ── Diagnostic snapshot BEFORE ────────────────────────────
            // Drawings on this panel show price-axis labels but no shape =
            // drawing entered dm.drawings (so showAxisHighlights ran) but
            // its SVG group is empty / off-screen / clipped. Print the
            // before/after state so we can see exactly what happened in
            // the iframe DevTools console without rebuilding.
            const dmBefore = (chart.drawingManager && chart.drawingManager.drawings)
                ? chart.drawingManager.drawings.length : -1;
            const incoming = m.drawing || {};
            console.log('[bridge:' + chartId + '] drawing-' + action,
                'id=' + (incoming.id || '?'),
                'type=' + (incoming.type || '?'),
                'cs=' + (incoming.coordinateSystem || '?'),
                'pts=' + (Array.isArray(incoming.points) ? incoming.points.length : '0'),
                'dm.drawings.before=' + dmBefore);

            // chart.js's receiveDrawingChange already sets _receivingDrawingSync
            // around its internal work, but we set it again here so the
            // wrapped broadcastDrawingChange (above) recognizes any nested
            // re-broadcast and short-circuits. Belt-and-suspenders.
            const wasReceiving = chart._receivingDrawingSync;
            chart._receivingDrawingSync = true;
            try {
                chart.receiveDrawingChange(action, m.drawing, m.drawingIndex);
            } catch (e) {
                warn('receiveDrawingChange threw', action, e && e.message);
                console.error('[bridge:' + chartId + '] receiveDrawingChange error stack:', e && e.stack);
            } finally {
                chart._receivingDrawingSync = wasReceiving;
            }

            // ── Diagnostic snapshot AFTER ─────────────────────────────
            try {
                const dm = chart.drawingManager;
                const dmAfter = dm && dm.drawings ? dm.drawings.length : -1;
                let last = null;
                if (dm && dm.drawings) {
                    last = dm.drawings.find(function (d) { return d && d.id === incoming.id; }) || null;
                }
                if (last) {
                    const groupNode = last.group && last.group.node ? last.group.node() : null;
                    const groupKids = groupNode ? groupNode.childNodes.length : -1;
                    const firstPt = (last.points && last.points[0]) ? last.points[0] : null;
                    console.log('[bridge:' + chartId + '] applied drawing-' + action,
                        'dm.drawings.after=' + dmAfter,
                        'group=' + (groupNode ? 'YES' : 'NO'),
                        'group.children=' + groupKids,
                        'firstPoint=' + (firstPt ? JSON.stringify(firstPt) : 'null'),
                        'tsPoints=' + (last.timestampPoints ? last.timestampPoints.length : '0'));
                } else {
                    console.warn('[bridge:' + chartId + '] applied drawing-' + action
                        + ' but drawing not in dm.drawings (id=' + (incoming.id || '?') + ')');
                }

                // Force the chart to schedule a render. receiveDrawingChange
                // calls dm.renderDrawing directly (which appends SVG nodes),
                // but the canvas underneath also drives some drawing-aware
                // rendering paths (axis highlights, hit-test caches, …). On
                // panels that just finished loadFileData, the chart's first
                // render may have already completed before the drawing
                // arrived — without an explicit nudge, the SVG nodes are
                // there but their pixel coords were computed against an
                // older xScale/yScale and look "wrong" or sit outside the
                // current clip rect. scheduleRender re-applies the current
                // scales to all drawings via dm.renderAllDrawings (called
                // from chart.render → dm.render).
                if (typeof chart.scheduleRender === 'function') {
                    chart.scheduleRender();
                }

                // Belt-and-suspenders: re-render this specific drawing on
                // the next animation frame, after scheduleRender's render
                // pass has settled and dataIndexToPixel reflects the
                // current view. Catches race conditions where the panel
                // was still mid-fitToView when receiveDrawingChange ran.
                if (last && dm && typeof dm.renderDrawing === 'function') {
                    requestAnimationFrame(function () {
                        try {
                            dm.renderDrawing(last);
                        } catch (e) {
                            console.warn('[bridge:' + chartId + '] re-render in rAF failed:', e && e.message);
                        }
                    });
                }
            } catch (e) {
                console.warn('[bridge:' + chartId + '] post-apply diagnostic threw:', e && e.message);
            }
        }

        global.addEventListener('message', function (ev) {
            applyInbound(ev.data);
        });

        function applyCrosshair(m) {
            const before = G.snapshotPriceState(chart);
            state.applied.add(m.causationId);
            beginApplying();
            // chart.js receiveCrosshairSync expects MILLISECONDS
            chart.receiveCrosshairSync(toMillis(m.time), null, null);
            const after = G.snapshotPriceState(chart);
            const violations = G.diffPriceState(before, after, 'crosshair');
            if (violations.length) {
                console.error('[bridge:' + chartId + '] CROSSHAIR PRICE-AXIS LEAK:', violations);
                reportAssertion('crosshair', violations);
            } else {
                reportAssertion('crosshair', null, before, after);
            }
        }

        function applyCrosshairClear(m) {
            state.applied.add(m.causationId);
            beginApplying();
            chart.receiveCrosshairSync(null, null, null);
        }

        function applyVisibleRange(m) {
            const before = G.snapshotPriceState(chart);
            state.applied.add(m.causationId);
            beginApplying();

            // Snap to recipient TF buckets per Decision 3.
            const myTf = chart.currentTimeframe || '1m';
            const myBucket = tfSec(myTf);
            const startSnapped = floorToBucket(m.startTime, myBucket);
            const endSnapped   = ceilToBucket(m.endTime,   myBucket);
            setVisibleTimeRange(chart, startSnapped, endSnapped);

            // Defer assertion until raf so render() has applied autoScale
            requestAnimationFrame(function () {
                const after = G.snapshotPriceState(chart);
                const v = G.diffPriceState(before, after, 'visibleRange');
                if (v.length) {
                    console.error('[bridge:' + chartId + '] VISIBLE-RANGE LEAK (non-autoFit fields changed):', v);
                    reportAssertion('visibleRange', v);
                } else {
                    reportAssertion('visibleRange', null, before, after);
                }
            });
        }

        function applySymbol(m) {
            // Symbol changes are NOT incremental sync — they're a user-driven
            // global swap. Each chart reloads its own data for the new symbol.
            // The host page is responsible for the actual data swap; we just
            // forward the request to the host.
            global.dispatchEvent(new CustomEvent('multichart:symbol-change', {
                detail: { symbol: m.symbol }
            }));
        }

        function applyBridgeConfig(m) {
            if (m.config && m.config.chartId) state.chartId = m.config.chartId;
            if (m.config && m.config.parentOrigin) state.parentOrigin = m.config.parentOrigin;
        }

        function reportAssertion(syncType, violations, before, after) {
            try {
                global.parent.postMessage({
                    type: 'assertion-report',
                    source: chartId,
                    syncType,
                    ok: !violations,
                    violations: violations || [],
                    snapshot: { before: before || null, after: after || null },
                }, parentOrigin);
            } catch (_) {}
        }

        function runSelfTest() {
            const result = G.runGuardSelfTest(chart);
            try {
                global.parent.postMessage({
                    type: 'guard-self-test-result',
                    source: chartId,
                    ok: result.ok,
                    failures: result.failures,
                }, parentOrigin);
            } catch (_) {}
        }

        // ─── ready ────────────────────────────────────────────────────────
        try {
            global.parent.postMessage({
                type: 'bridge-ready',
                source: chartId,
                api: {
                    crosshair: true,
                    visibleRange: true,
                    symbol: true,
                    selfTest: true,
                },
            }, parentOrigin);
        } catch (_) {}

        return {
            state,
            chartId: chartId,
            send,
            // Direct-deliver entry point used by the manager when this bridge
            // is installed on the parent's host chart (Phase 7.2.5). For
            // iframe bridges this is also called by the global 'message'
            // listener — same code path either way.
            deliver: applyInbound,
            setVisibleTimeRange: function (s, e) { setVisibleTimeRange(chart, s, e); },
            readVisibleTimeRange: function () { return readVisibleTimeRange(chart); },
        };
    }

    global.MultichartBridge = {
        installBridge,
        setVisibleTimeRange,
        readVisibleTimeRange,
        toSeconds,
        toMillis,
        floorToBucket,
        ceilToBucket,
        tfSec,
    };
})(typeof window !== 'undefined' ? window : globalThis);
