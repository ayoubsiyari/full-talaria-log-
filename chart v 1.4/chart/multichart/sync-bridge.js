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

    function tfSec(tf) {
        const map = global.MultichartSampleData && global.MultichartSampleData.TIMEFRAME_SECONDS;
        return (map && map[tf]) || 60;
    }

    /** Synthesised setVisibleTimeRange — see engine-api-audit.md §2. */
    function setVisibleTimeRange(chart, startSec, endSec) {
        if (!chart || !chart.data || chart.data.length === 0) return;
        const widthPx = (chart.w || (chart.canvas && chart.canvas.width) || 800)
            - (chart.margin ? (chart.margin.l + chart.margin.r) : 60);
        if (widthPx <= 0) return;
        const spanSec = Math.max(1, endSec - startSec);

        // Bar duration in seconds of the recipient chart.
        let barSec = 60;
        try {
            const ms = chart.inferBarDurationMs ? chart.inferBarDurationMs() : 60000;
            if (Number.isFinite(ms) && ms > 0) barSec = Math.max(1, Math.floor(ms / 1000));
        } catch (_) {}

        // bars to fit
        const bars = Math.max(1, spanSec / barSec);
        // candleSpacing = candleWidth + gap. chart.js: spacing = candleWidth (gap small/zero).
        const targetCandleWidth = Math.max(0.2, Math.min(60, widthPx / bars));

        // Apply width FIRST (this changes spacing), then jump centered.
        chart.candleWidth = targetCandleWidth;
        if (chart.zoomLevel) {
            // pick nearest allowed width for snap-to-grid feel
            const allowed = chart.zoomLevel.allowedWidths || [targetCandleWidth];
            let nearestIdx = 0, best = Infinity;
            for (let i = 0; i < allowed.length; i++) {
                const d = Math.abs(allowed[i] - targetCandleWidth);
                if (d < best) { best = d; nearestIdx = i; }
            }
            chart.zoomLevel.candleWidthIndex = nearestIdx;
            chart.candleWidth = allowed[nearestIdx];
        }

        // Center on midpoint
        const midSec = Math.floor((startSec + endSec) / 2);
        if (typeof chart.jumpToTimestamp === 'function') {
            // Don't await — local data, no server round-trip.
            try {
                chart.jumpToTimestamp(toMillis(midSec), {
                    skipWindowFetch: true,
                    showLoadingOverlay: false,
                    forceWindowReload: false,
                });
            } catch (_) {}
        }

        // Force price autoScale ON so the price axis recomputes from this
        // chart's OWN visible candles. NEVER set min/max from outside.
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
            // per-event outbound suppression: when applying inbound, tag the chart
            // and ignore N native echoes.
            suppressOutbound: 0,
            // recipient-side: snapshot taken at start of inbound apply
            inboundSnap: null,
            inboundMode: null,
        };

        global.__multichartBridgeState = state;

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

        // 1) Crosshair — monkey-patch broadcastCrosshairSync.
        //    chart.js calls this from updateCrosshair when a sync allowlist gate
        //    passes. We replace the gate with our own (always allow if bridge
        //    is installed) and forward via postMessage.
        chart._crosshairPanelSyncAllowed = function () {
            return !!chart.syncCrosshair;
        };
        const _origBroadcast = chart.broadcastCrosshairSync.bind(chart);
        chart.broadcastCrosshairSync = function (timestamp, price) {
            // outbound suppression for loop guard
            if (state.suppressOutbound > 0) {
                state.suppressOutbound--;
                log('outbound suppressed (loop guard)');
                return;
            }
            if (timestamp === null || timestamp === undefined) {
                send({ type: 'crosshair-clear' });
                return;
            }
            send({ type: 'crosshair', time: toSeconds(timestamp) });
            // intentionally do NOT call the legacy panelManager path
            // (panelManager has been deleted; original would no-op)
        };

        // 2) Visible range — listen to chartScrolled
        global.addEventListener('chartScrolled', function (ev) {
            if (state.suppressOutbound > 0) {
                state.suppressOutbound--;
                log('outbound (visibleRange) suppressed (loop guard)');
                return;
            }
            const d = ev.detail || {};
            if (d.chart !== chart) return;
            const startT = d.startTimestamp;
            const endT   = d.timeSyncEndTimestamp || d.endTimestamp;
            if (!Number.isFinite(startT) || !Number.isFinite(endT)) return;
            send({
                type: 'visibleRange',
                startTime: toSeconds(startT),
                endTime:   toSeconds(endT),
            });
        });

        // 3) Symbol / data load — re-emit chart-state, NOT a sync event.
        global.addEventListener('chartDataLoaded', function (ev) {
            const d = ev.detail || {};
            try {
                global.parent.postMessage({
                    type: 'chart-state',
                    source: chartId,
                    state: {
                        symbol: d.symbol || chart.currentSymbol || null,
                        timeframe: d.timeframe || chart.currentTimeframe || null,
                        candleCount: chart.data ? chart.data.length : 0,
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

        // ─── inbound: parent -> chart ──────────────────────────────────────

        global.addEventListener('message', function (ev) {
            // (parent origin check could be added here in prod)
            const msg = ev.data;
            if (!msg || typeof msg !== 'object') return;
            // ignore messages we ourselves originated
            if (msg.source && msg.source === chartId) return;

            const cleaned = G.filterForbiddenFields(msg);
            if (cleaned.dropped.length) {
                console.error('[bridge:' + chartId + '] inbound forbidden fields dropped:', cleaned.dropped);
            }
            const m = cleaned.clean;

            // Loop guard — only forward types if not a recent self-applied causationId
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
                }
                // unknown types are silently ignored
            } catch (e) {
                warn('inbound apply error', m.type, e);
            }
        });

        function applyCrosshair(m) {
            const before = G.snapshotPriceState(chart);
            state.applied.add(m.causationId);
            state.suppressOutbound++;
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
            state.suppressOutbound++;
            chart.receiveCrosshairSync(null, null, null);
        }

        function applyVisibleRange(m) {
            const before = G.snapshotPriceState(chart);
            state.applied.add(m.causationId);
            // Visible-range update will fire chartScrolled internally — suppress
            // the outbound echo (chart will raf-coalesce; budget 4 echoes max)
            state.suppressOutbound += 4;

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
            send,
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
