/**
 * panel-cmd-bridge.js — Phase 7.2.4 (per-panel command routing)
 *
 * Runs INSIDE each dist-v9 iframe spawned by MultichartGrid. Listens for
 * `panel-cmd` postMessages from the parent and applies them to the
 * iframe's window.chart instance. This is the PER-PANEL action redirect
 * mechanism that lets the parent's topbar (timeframe buttons, file picker,
 * indicator menu, etc.) target a specific panel instead of always
 * mutating window.chart in the parent.
 *
 * Message envelope (from parent → iframe):
 *   {
 *     type:      'panel-cmd',
 *     target:    'B' | 'C' | '*',          // panelId; '*' = broadcast
 *     cmd:       'setTimeframe' | 'loadFile' | …,
 *     args:      { tf: '5m' } | { fileId: 123 } | …,
 *     requestId: 'cmd-…',                  // echoed back in cmd-result
 *   }
 *
 * Reply envelope (iframe → parent):
 *   {
 *     type:      'cmd-result',
 *     source:    'B',
 *     requestId: 'cmd-…',
 *     ok:        true | false,
 *     error:     null | 'message',
 *   }
 *
 * Why a separate file from sync-bridge.js:
 *   • Commands are intentional user actions, not sync events. They are
 *     NOT subject to FORBIDDEN_SYNC_FIELDS, NOT bound by the loop-guard
 *     ring buffer, and don't fan out to peers (the parent's command bus
 *     fans out if it wants to).
 *   • Decoupled lifecycle: a future sync-only embed could ship without
 *     panel-cmd-bridge.js, and a future cmd-only embed could ship without
 *     sync-bridge.js.
 *   • Different failure modes: a sync drop is silent; a command failure
 *     should surface to the parent (cmd-result.ok=false) so the toolbar
 *     can show a toast.
 *
 * Loaded only inside iframes via the dist-v9 ?multichart=1 shim
 * (talaria-design/live/index.html → chart/dist-v9/index.html).
 */
(function (global) {
    'use strict';

    var params  = new URLSearchParams(global.location.search);
    var panelId = params.get('panelId') || params.get('id') || ('panel-' + Math.random().toString(36).slice(2, 6));

    function log() {
        if (params.get('verbose') !== '1') return;
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[panel-cmd:' + panelId + ']');
            console.log.apply(console, args);
        } catch (_) {}
    }
    function warn() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[panel-cmd:' + panelId + ']');
            console.warn.apply(console, args);
        } catch (_) {}
    }

    function warn() {
        try {
            var args = Array.prototype.slice.call(arguments);
            args.unshift('[panel-cmd:' + panelId + ']');
            console.warn.apply(console, args);
        } catch (_) {}
    }

    function orderMcRestoreDedupeV1Enabled() {
        try {
            if (global.__TALARIA_DISABLE_ORDER_MC_RESTORE_DEDUPE_V1) return false;
        } catch (_) {}
        return true;
    }

    function orderIdExistsInOm(om2, ordId) {
        if (ordId == null) return false;
        if ((om2.orders || []).some(function (o) { return o && o.id === ordId; })) return true;
        if (!orderMcRestoreDedupeV1Enabled()) return false;
        if ((om2.openPositions || []).some(function (o) { return o && o.id === ordId; })) return true;
        if ((om2.pendingOrders || []).some(function (o) { return o && o.id === ordId; })) return true;
        return false;
    }

    function cloneOrderList(arr) {
        try {
            return JSON.parse(JSON.stringify(Array.isArray(arr) ? arr : []));
        } catch (_) {
            return Array.isArray(arr) ? arr.slice() : [];
        }
    }

    function orderMcStateConvergeFixEnabledBridge() {
        try { if (global.__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX) return false; } catch (_) {}
        return true;
    }

    function orderMcHostPlaceV1EnabledBridge() {
        return orderMcStateConvergeFixEnabledBridge() && !global.__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1;
    }

    function orderMcSnapshotProjectionV1EnabledBridge() {
        return orderMcStateConvergeFixEnabledBridge() && !global.__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1;
    }

    function orderMcLegacyIframeOrderV1EnabledBridge() {
        return orderMcStateConvergeFixEnabledBridge() && !global.__TALARIA_DISABLE_ORDER_MC_LEGACY_IFRAME_ORDER_V1;
    }

    function orderMcPnlHubV1EnabledBridge() {
        return orderMcStateConvergeFixEnabledBridge() && !global.__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1;
    }

    function applyOrderSnapshotProjection(ch, snapshot) {
        var om = ch && ch.orderManager;
        if (!om || !snapshot) return { ok: false, reason: 'missing' };
        var sym = String(ch.currentSymbol || '').replace(/\//g, '').toUpperCase();
        var fid = ch.currentFileId != null ? String(ch.currentFileId) : '';
        // FileId match is sufficient; symbol match is fallback. Do NOT reject a
        // same-symbol multi-entry sibling just because one leg still carries the
        // host tile's sourceFileId (host-canonical place stamps focus panel on
        // only one of the new rows).
        function matchRow(row) {
            if (!row) return false;
            var rs = String(row.symbol || row.ticker || '').replace(/\//g, '').toUpperCase();
            var rf = row.sourceFileId != null ? String(row.sourceFileId) : '';
            if (fid && rf && rf === fid) return true;
            if (sym && rs && rs === sym) return true;
            return false;
        }
        function expandSplitSiblings(matched, all) {
            var gids = {};
            var i;
            for (i = 0; i < matched.length; i++) {
                var m = matched[i];
                if (m && m.isSplitEntry && m.splitGroupId != null) {
                    gids[String(m.splitGroupId)] = true;
                }
            }
            var gidKeys = Object.keys(gids);
            if (!gidKeys.length) return matched;
            var byId = {};
            for (i = 0; i < matched.length; i++) {
                if (matched[i] && matched[i].id != null) byId[matched[i].id] = matched[i];
            }
            for (i = 0; i < all.length; i++) {
                var o = all[i];
                if (!o || o.id == null || !o.isSplitEntry || o.splitGroupId == null) continue;
                if (!gids[String(o.splitGroupId)]) continue;
                if (!byId[o.id]) byId[o.id] = o;
            }
            var out = [];
            Object.keys(byId).forEach(function (k) { out.push(byId[k]); });
            return out;
        }
        var openAll = snapshot.openPositions || [];
        var pendingAll = snapshot.pendingOrders || [];
        var open = expandSplitSiblings(openAll.filter(matchRow), openAll);
        var pending = expandSplitSiblings(pendingAll.filter(matchRow), pendingAll);
        om.openPositions = cloneOrderList(open);
        om.pendingOrders = cloneOrderList(pending);
        var ids = new Set();
        open.forEach(function (p) { if (p && p.id != null) ids.add(p.id); });
        pending.forEach(function (p) { if (p && p.id != null) ids.add(p.id); });
        om.orders = cloneOrderList(snapshot.orders || []).filter(function (o) {
            return o && ids.has(o.id);
        });
        om._hostSnapshotVersion = snapshot.version;
        // Full strip+redraw so pending→open fills keep every multi-entry leg
        // (and correct aggregate TP/SL lots). Piecemeal drawOrderLine left stale
        // pending graphics and raced with pending-removed mirror deletes.
        try {
            if (typeof om.syncOrderVisualsToActiveChart === 'function') {
                om.syncOrderVisualsToActiveChart();
            } else {
                open.forEach(function (ord) {
                    if (typeof om.drawOrderLine === 'function') om.drawOrderLine(ord, ch);
                    if (typeof om.drawSLTPLines === 'function') om.drawSLTPLines(ord, ch);
                });
                pending.forEach(function (ord) {
                    if (typeof om.scheduleRefreshPendingOrderGraphicsForChart === 'function') {
                        om.scheduleRefreshPendingOrderGraphicsForChart(ord, ch);
                    } else if (typeof om.refreshPendingOrderGraphicsForChart === 'function') {
                        om.refreshPendingOrderGraphicsForChart(ord, ch);
                    }
                });
                if (typeof om._rebuildSplitGroupAvgLines === 'function') om._rebuildSplitGroupAvgLines();
                if (typeof om.updateOrderLines === 'function') om.updateOrderLines(ch);
                if (typeof ch.render === 'function') ch.render();
            }
        } catch (_) {}
        return { ok: true, version: snapshot.version };
    }

    /** T1 step 14 — same switch as drawing-tools-manager / TalariaV8bLive (I13). */
    function v9QuickBarPanelEmbedFixEnabled() {
        try {
            if (global.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2) return false;
        } catch (_) {}
        return true;
    }

    /** Parent-authoritative flag: this iframe is a V9 multichart panel tile. */
    function clearV9PanelEmbedFlag() {
        try { delete global.__talariaV9PanelEmbed; } catch (_) {}
    }

    /**
     * Delete legacy #drawing-toolbar in panel iframes — parent V9 quick-bar owns UI.
     * Keys off window.__talariaV9PanelEmbed set by setV9PanelEmbed panel-cmd.
     */
    function killLegacyDrawingToolbarForV9PanelEmbed(ch) {
        try {
            global.__talariaV9PanelEmbed = true;
            var doc = global.document;
            if (doc) {
                var nodes = doc.querySelectorAll('#drawing-toolbar, .drawing-toolbar');
                for (var i = 0; i < nodes.length; i++) {
                    try { nodes[i].parentNode && nodes[i].parentNode.removeChild(nodes[i]); } catch (_) {}
                }
                if (!doc.getElementById('talaria-v9-panel-embed-toolbar-kill')) {
                    var st = doc.createElement('style');
                    st.id = 'talaria-v9-panel-embed-toolbar-kill';
                    st.textContent = '#drawing-toolbar,.drawing-toolbar{display:none!important;visibility:hidden!important;pointer-events:none!important;}';
                    doc.head.appendChild(st);
                }
            }
            var dm = ch && ch.drawingManager;
            if (dm && dm.toolbar) {
                dm.toolbar.visible = false;
                if (dm.toolbar.toolbar) {
                    try { dm.toolbar.toolbar.remove(); } catch (_) {}
                    dm.toolbar.toolbar = null;
                }
                dm.toolbar.show = function () {
                    dm.toolbar.visible = false;
                    return undefined;
                };
            }
        } catch (eKill) {
            warn('killLegacyDrawingToolbarForV9PanelEmbed failed', eKill && eKill.message);
        }
    }

    function reportResult(requestId, ok, error, data) {
        if (!requestId) return;
        try {
            global.parent.postMessage({
                type:      'cmd-result',
                source:    panelId,
                requestId: requestId,
                ok:        !!ok,
                error:     error || null,
                data:      (data === undefined) ? null : data,
            }, '*');
        } catch (_) {}
    }

    // Wait for window.chart to exist (chart.js boots asynchronously after
    // the React tree mounts). Returns a promise that resolves with the
    // chart instance, or rejects after `timeoutMs`.
    function waitForChart(timeoutMs) {
        return new Promise(function (resolve, reject) {
            var t0 = Date.now();
            var tick = function () {
                if (global.chart) { resolve(global.chart); return; }
                if (Date.now() - t0 >= timeoutMs) {
                    reject(new Error('window.chart not available after ' + timeoutMs + 'ms'));
                    return;
                }
                setTimeout(tick, 100);
            };
            tick();
        });
    }

    // ─── replay sync deferral state ────────────────────────────────────
    //
    // Replay commands (replayEnter / replayTick) frequently arrive BEFORE
    // the iframe finishes loading its dataset:
    //   T0   embed-bridge.installOnce → MultichartBridge.installBridge
    //         → bridge-ready postMessage → parent marks panel ready.
    //   T+ε  parent's _primeReplayFromParent fires (if parent is in
    //         active replay) → sendCommand('replayEnter', { ts }).
    //   T+δ  embed-bridge.applyInitialContext kicks loadFileData(fileId)
    //         — STILL IN FLIGHT.
    //   T+δ+ chart.rawData populated, chartDataLoaded fires.
    //
    // If replayEnter executes during the (T+ε, T+δ+) window, rawData is
    // empty → enterReplayMode would alert("Please load data first") and
    // bail. To avoid that we stash the LATEST requested timestamp here
    // and a single chartDataLoaded listener (installed lazily on the
    // first deferred command) drains it the moment data arrives.
    //
    // Only the LATEST timestamp is kept — replay seek is idempotent and
    // the parent fires replayTick at ~playback rate, so there's no
    // value in queueing a backlog.
    var pendingReplayTs = null;
    // Tri-state: null (no opinion yet), true (parent wants replay
    // active at pendingReplayTs), false (parent wants replay OFF).
    // Set by replayEnter / replayTick / replayExit; consumed every
    // time chartDataLoaded fires so the iframe matches the parent's
    // current intent EVEN IF its own autoLoadBacktestingData re-enters
    // replay between commands (the parent's exit-then-split case).
    var pendingReplayDesired = null;
    var dataLoadedListenerInstalled = false;

    // ─── deferred play-state intent ─────────────────────────────────────
    //
    // Parent broadcasts `replayPlay` (with speed + mode) and
    // `replayPause` whenever its own state changes. If those land
    // BEFORE the iframe's replay system is active (e.g. iframe data
    // is still loading when the user hits play in the parent), the
    // command was previously DROPPED — no retry, iframe stayed
    // paused until the user clicked play again.
    //
    // Now we stash the latest desired state in `pendingPlayDesired`
    // (true=play, false=pause, null=no opinion yet) and the latest
    // speed/mode in `pendingPlaySpeed` / `pendingPlayMode`. The
    // moment applyReplayEnter completes successfully, drainPendingPlay
    // applies these so the iframe boots straight into the right
    // playback state. This is the key fix that makes "join mid-play"
    // and "deferred play during data load" actually work.
    var pendingPlayDesired = null;
    var pendingPlaySpeed = null;
    var pendingPlayMode = null;

    /** Cached chart + rAF-coalesced replayFrame hot path (matches host paint rate). */
    var chartInstance = null;
    var coalescedReplayFrameArgs = null;
    var coalescedReplayFrameRaf = null;

    function getChartInstance() {
        if (chartInstance) return chartInstance;
        if (global.chart) {
            chartInstance = global.chart;
            return chartInstance;
        }
        return null;
    }

    var rollbackPickActive = false;
    var rollbackPickCleanup = null;

    function teardownRollbackPick() {
        if (rollbackPickCleanup) {
            try { rollbackPickCleanup(); } catch (_) {}
        }
        rollbackPickCleanup = null;
        rollbackPickActive = false;
    }

    function installRollbackPick(ch) {
        teardownRollbackPick();
        if (!ch) return;
        var wrapper = global.document.getElementById('chartWrapper')
            || (ch.canvas && ch.canvas.parentElement);
        if (!wrapper) return;
        rollbackPickActive = true;
        var onClick = function (e) {
            if (!rollbackPickActive) return;
            if (e.target && e.target.closest && e.target.closest('.ohlc-info')) return;
            var rs = ch.replaySystem;
            if (!rs) return;
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            var rect = wrapper.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var ml = (ch.margin && ch.margin.l) || 0;
            var w = Number(ch.w) || rect.width;
            var mr = (ch.margin && ch.margin.r) || 0;
            if (x < ml || x > w - mr) return;
            var candleIndex = -1;
            if (typeof rs.getCandleIndexAtXForChart === 'function') {
                candleIndex = rs.getCandleIndexAtXForChart(ch, x);
            } else if (typeof rs.getCandleIndexAtX === 'function') {
                candleIndex = rs.getCandleIndexAtX(x);
            }
            if (candleIndex < 0 || !ch.data || !ch.data[candleIndex]) return;
            var ts = ch.data[candleIndex].t;
            teardownRollbackPick();
            try {
                global.parent.postMessage({
                    type: 'v9-replay-rollback-cut',
                    source: panelId,
                    timestamp: ts,
                    candleIndex: candleIndex,
                }, '*');
            } catch (_) {}
        };
        wrapper.addEventListener('click', onClick, true);
        rollbackPickCleanup = function () {
            wrapper.removeEventListener('click', onClick, true);
        };
    }
    var pendingPlaySpeed = null;
    var pendingPlayMode = null;

    // ─── coalesced replay-tick seek state ──────────────────────────────
    //
    // Parent fires `replayVirtualTimeChanged` once per CANDLE advance.
    // At 60x speed that's ~60 events/sec; each turns into an iframe
    // replayTick → goToReplayTimestamp → updateChartData + render
    // (~10-30ms of work in iframe context — slower than parent's main
    // window). Without coalescing the iframe queues seeks faster than
    // it can process, so Panel B visibly lags behind Panel A
    // ("Panel B moves slow not like Panel A" report).
    //
    // Solution: every replayTick stashes the LATEST timestamp into
    // `coalescedSeekTs` and schedules a single rAF. When the rAF
    // fires we seek to whatever ts is currently stashed — older
    // timestamps that arrived in the same frame are dropped. Result:
    // iframe seeks at most once per refresh frame, always to the
    // newest ts the parent broadcast → iframe never falls behind.
    //
    // The first applyReplayEnter is NOT coalesced — we want it to
    // run synchronously so the initial enterReplayMode + first seek
    // happen as fast as possible. Coalescing kicks in only for
    // SUBSEQUENT seeks once isActive=true.
    var coalescedSeekTs = null;
    var coalescedSeekScheduled = false;
    // When set, the pending coalesced seek MUST advance this panel on its OWN
    // replay master only (forceReplaySeek) and MUST NOT pull the host's TF-
    // switched display data/master via the parent-mirror payload. See
    // peerPlayMustStayOnOwnMaster (BL-10 D-037 sync-off host-TF isolation).
    var coalescedSeekOwnMasterOnly = false;
    var coalescedMirrorCatchUpTs = null;
    var coalescedMirrorCatchUpArgs = null;
    var coalescedMirrorCatchUpScheduled = false;

    function isMultichartIframePanel() {
        try {
            return !!(global.parent && global.parent !== global
                && /(?:^|[?&])multichart=1(?:&|$)/.test(String(global.location.search || '')));
        } catch (_) {
            return false;
        }
    }

    function mirrorParentBacktestSession(ch) {
        if (!ch) return;
        try {
            var pc = (global.parent && global.parent !== global) ? global.parent.chart : null;
            if (!pc) return;
            if (pc.backtestingSession) ch.backtestingSession = pc.backtestingSession;
            if (pc.activeTradingSessionId && !ch.activeTradingSessionId) {
                ch.activeTradingSessionId = pc.activeTradingSessionId;
            }
            if (typeof pc.isBacktestMode === 'boolean') ch.isBacktestMode = pc.isBacktestMode;
            if (typeof pc.isPropFirmMode === 'boolean') ch.isPropFirmMode = pc.isPropFirmMode;
            var poc = pc.orderManager && pc.orderManager.orderService;
            var ioc = ch.orderManager && ch.orderManager.orderService;
            if (poc && ioc && typeof ioc.setSessionInstruments === 'function') {
                var inst = poc.multiInstrumentSession && poc.multiInstrumentSession.instruments;
                if (inst && typeof inst === 'object') {
                    ioc.setSessionInstruments(inst);
                }
            }
        } catch (_) {}
    }

    function panelHasLoadedFile(ch, fidStr) {
        return String(ch.currentFileId || '') === String(fidStr)
            && ch.rawData && ch.rawData.length > 0;
    }

    function reseedReplayFromChart(ch) {
        if (!ch || typeof ch._reseedReplayFullRawFromLoadedData !== 'function') return;
        try { ch._reseedReplayFullRawFromLoadedData(); } catch (_) {}
    }

    function ensurePanelReplaySeries(ch) {
        if (!ch || !isMultichartIframePanel()) return;
        if (!Array.isArray(ch._panelFullRawData) || ch._panelFullRawData.length === 0) return;
        var rs = ch.replaySystem;
        if (!rs || !rs.isActive) return;
        reseedReplayFromChart(ch);
    }

    function clearReplayBufferForPairSwitch(ch) {
        var rs = ch && ch.replaySystem;
        if (!rs) return;
        rs.animatingCandle = null;
        rs.tickProgress = 0;
        rs.tickElapsedMs = 0;
        // Keep fullRawData during async pair fetch — nulling it lets mirror/sync
        // frames paint an empty slice and leaves offsetX pointing off-screen.
        rs.tickPathCache = {};
        rs.tickPathCacheBuilt = false;
    }

    /** Seed iframe replay timestamp from parent tile A before pair fetch. */
    function primeIframeReplayPlayheadFromParent(ch) {
        if (!ch || !isMultichartIframePanel()) return null;
        try {
            var pc = global.parent && global.parent.chart;
            var prs = pc && pc.replaySystem;
            if (!prs || !prs.isActive) return null;
            var ts = Number(prs.replayTimestamp);
            if (!Number.isFinite(ts)) return null;
            var rs = ch.replaySystem;
            if (rs) rs.replayTimestamp = ts;
            if (typeof pc.isBacktestMode === 'boolean') ch.isBacktestMode = pc.isBacktestMode;
            return ts;
        } catch (_) {
            return null;
        }
    }

    function afterLoadFile(ch, usedMultichartLoader) {
        const coalesceOn = ch
            && typeof ch._mcMountViewportCoalesceFixActive === 'function'
            && ch._mcMountViewportCoalesceFixActive();
        if (ch) {
            try {
                ch._multichartViewportSettleUntil = performance.now()
                    + (coalesceOn ? 3500 : 1200);
            } catch (_) {}
        }
        if (usedMultichartLoader || coalesceOn) {
            // Loader / coalesce path owns replay viewport + single authoritative commit.
            return;
        }
        try { drainPendingReplay(); } catch (_d) {}
        reseedReplayFromChart(ch);
        ensurePanelReplaySeries(ch);
        setTimeout(function () {
            try { scheduleMultichartPanelReplayFollow(ch); } catch (_s) {}
        }, 0);
    }

    function isParentReplayPlaying() {
        try {
            var pc = (global.parent && global.parent !== global)
                ? global.parent.chart : null;
            var prs = pc && pc.replaySystem;
            return !!(prs && prs.isActive && prs.isPlaying);
        } catch (_) {
            return false;
        }
    }

    function isViewportSettling(ch) {
        if (!ch) return false;
        // Viewport settle must not stall replay mirror while parent tile A is playing.
        if (isParentReplayPlaying()) return false;
        var until = ch._multichartViewportSettleUntil;
        return Number.isFinite(until) && performance.now() < until;
    }

    function shouldUseMultichartPanelLoader(ch) {
        if (!ch || typeof ch.loadMultichartPanelFromHost !== 'function') return false;
        return !!(ch.isBacktestMode || ch.backtestingSession);
    }

    /**
     * Load host file on an iframe tile — prefer host master clone (no server fetch).
     * Runs async; callers that need fire-and-forget should not return this promise.
     */
    function startSyncFromHostLoad(ch, syncFidStr, syncTs, afterCb) {
        if (!ch || !syncFidStr) return null;
        mirrorParentBacktestSession(ch);
        var primedPlayheadTs = Number.isFinite(syncTs)
            ? syncTs
            : primeIframeReplayPlayheadFromParent(ch);
        var useMcLoader = shouldUseMultichartPanelLoader(ch);
        var loadPromise = null;
        if (useMcLoader) {
            if (typeof ch.loadMultichartPanelFile === 'function') {
                loadPromise = ch.loadMultichartPanelFile(syncFidStr, {
                    force: true,
                    replayTimestamp: primedPlayheadTs,
                    timeframe: ch.currentTimeframe,
                });
            } else if (typeof ch.loadMultichartPanelFromHost === 'function') {
                loadPromise = ch.loadMultichartPanelFromHost({
                    fileId: syncFidStr,
                    force: true,
                    replayTimestamp: primedPlayheadTs,
                    timeframe: ch.currentTimeframe,
                });
            }
        }
        if (!loadPromise && typeof ch.loadFileData === 'function') {
            loadPromise = ch.loadFileData(syncFidStr);
        }
        if (loadPromise && typeof loadPromise.then === 'function') {
            return loadPromise.then(function () {
                if (typeof afterCb === 'function') afterCb();
            }).catch(function (e) {
                warn('syncFromHost: load failed', e && e.message);
            });
        }
        if (typeof afterCb === 'function') afterCb();
        return null;
    }

    function runSyncFromHostLoadDetached(ch, syncFidStr, syncTs, afterCb) {
        var p = startSyncFromHostLoad(ch, syncFidStr, syncTs, afterCb);
        if (p && typeof p.catch === 'function') {
            p.catch(function (e) {
                warn('syncFromHost: detached load failed', e && e.message);
            });
        }
    }

    function isPanelBootSettling(ch) {
        try {
            if (ch && typeof ch._isMultichartBootViewportLocked === 'function'
                && ch._isMultichartBootViewportLocked()) {
                return true;
            }
            if (typeof window !== 'undefined'
                && Number.isFinite(window.__multichartBootRevealAfter)
                && performance.now() < window.__multichartBootRevealAfter) {
                return true;
            }
        } catch (_) {}
        return false;
    }

    // B-FIX-I (fast-switch self-heal): under RAPID host TF switching the settling machinery
    // (B-FIX-F/G/H) can race — a held panel's one-shot settled re-mirror can be lost or coalesced
    // when the next switch starts before the previous one finishes, leaving the panel parked on a
    // stale window/scale (candles are the right TF, but offsetX + price scale are wrong). This is a
    // panel-local, host-data-independent backstop: whenever we HOLD a panel during a host switch we
    // (re)arm a debounced timer; it fires only once the host is FULLY settled (each new switch
    // resets it, so a storm of fast switches collapses into ONE heal at the end) and re-anchors this
    // panel's viewport to its OWN playhead + refits its OWN price scale. Only heals panels that were
    // actually held (ch._mcNeedsSelfHeal), so it never yanks correctly-positioned panels. Kill-switch:
    // window.__TALARIA_MC_DISABLE_PANEL_SETTLED_SELFHEAL.
    function _mcScheduleSettledSelfHeal(ch) {
        if (typeof window !== 'undefined' && window.__TALARIA_MC_DISABLE_PANEL_SETTLED_SELFHEAL) return;
        if (!ch) return;
        try {
            ch._mcNeedsSelfHeal = true;
            if (ch._mcSelfHealTimer) { clearTimeout(ch._mcSelfHealTimer); }
            ch._mcSelfHealTimer = setTimeout(function () {
                ch._mcSelfHealTimer = null;
                try {
                    var pc = readParentChart();
                    // Host still mid-switch → re-arm and wait for a quiet window (coalesces fast switching).
                    if (pc && (pc._timeframeSwitching || pc._switchingToTimeframe || pc._pairSwitchLoading)) {
                        _mcScheduleSettledSelfHeal(ch);
                        return;
                    }
                    if (ch._mcNeedsSelfHeal !== true) return;
                    ch._mcNeedsSelfHeal = false;
                    var rs = ch.replaySystem;
                    if (!rs || !rs.isActive) return;
                    // Only heal a panel whose playhead is actually OFF-SCREEN. A panel still showing
                    // its playhead is fine (e.g. a cross-TF panel that correctly ignored the host
                    // switch); force-recentering it would move offsetX and trip a needless history
                    // refetch (the "4h panels re-fetch when host goes 1m" regression). Compare the
                    // playhead timestamp against this panel's own visible time window.
                    try {
                        var _phTs = Number(rs.replayTimestamp);
                        var _dd = Array.isArray(ch.data) ? ch.data : [];
                        if (Number.isFinite(_phTs) && _dd.length) {
                            var _vs = Number.isFinite(ch.visibleStartIndex) ? ch.visibleStartIndex : 0;
                            var _ve = Number.isFinite(ch.visibleEndIndex) ? ch.visibleEndIndex : _dd.length;
                            var _lo = Math.max(0, Math.min(_dd.length - 1, _vs));
                            var _hi = Math.max(0, Math.min(_dd.length - 1, _ve - 1));
                            var _firstT = Number(_dd[_lo] && _dd[_lo].t);
                            var _lastT = Number(_dd[_hi] && _dd[_hi].t);
                            if (Number.isFinite(_firstT) && Number.isFinite(_lastT)
                                && _phTs >= _firstT && _phTs <= _lastT) {
                                return; // playhead already in view — nothing to heal
                            }
                        }
                    } catch (_) {}
                    if (typeof rs.syncReplayViewportToPlayhead === 'function') {
                        rs.syncReplayViewportToPlayhead(ch, { forceRecenter: true, resetPriceScale: true, render: true });
                    }
                } catch (_) {}
            }, 320);
        } catch (_) {}
    }

    /**
     * Apply one replay animation frame from parent tile A. Iframe panels stay
     * paused locally — parent is the single playhead driver.
     */
    function applyReplayFrame(ch, args) {
        global.__talariaBl2bMark && global.__talariaBl2bMark(ch, 'replay', 'panel-cmd-bridge.js:applyReplayFrame');
        markHostReplayContext(ch);
        if (!ch || !args || typeof args !== 'object') return;
        if (ch._multichartPairLoadInFlight) return;
        // Never block replay frames during boot settle — only viewport mirrors
        // are held then. Dropping frames here freezes B/C/D on Play.
        var rs = ch.replaySystem;
        if (!rs) return;
        var ts = Number(args.timestamp);
        if (!Number.isFinite(ts)) return;

        // D-016 / T8: pin shared virtual market timestamp on every play frame so
        // coarse panels stay byte-aligned with the host finest-TF clock (parity).
        if (args.isPlaying
            && !(typeof window !== 'undefined'
                && window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE)) {
            rs.replayTimestamp = ts;
        }

        // Host mid timeframe-switch: it rebuilds its master data and its broadcast
        // playhead can momentarily regress. Applying those transient frames drags
        // panels (especially ones on a different TF) BACKWARD while the host loads
        // history. Hold this panel steady until the host finishes switching.
        try {
            var pcSwitching = readParentChart();
            if (pcSwitching
                && (pcSwitching._timeframeSwitching || pcSwitching._pairSwitchLoading)) {
                _mcScheduleSettledSelfHeal(ch);
                return;
            }
            // B-FIX-F (panel flash on host TF-switch): the host clears _timeframeSwitching
            // BEFORE its deferred post-switch reload settles (bulk ingest / ensureGoToWindow /
            // backward prepends). During that window the host master does NOT yet bracket the
            // playhead and its broadcast frames are transient/regressing — mirroring them makes
            // panels flash and paint old data (the same class of bug B-FIX-E fixed host-side,
            // but on the panel mirror path which bypasses the cache guard). Hold this panel on
            // its last good frame until the host playhead is back inside the host master window.
            if (pcSwitching
                && !(typeof window !== 'undefined' && window.__TALARIA_MC_DISABLE_PANEL_MIRROR_UNSETTLED_HOST)
                && typeof pcSwitching._replayPlayheadOutsideMasterWindow === 'function') {
                var _hostRs = pcSwitching.replaySystem;
                if (_hostRs && _hostRs.isActive) {
                    var _hostPhTs = Number.isFinite(_hostRs.replayTimestamp)
                        ? _hostRs.replayTimestamp
                        : ts;
                    if (pcSwitching._replayPlayheadOutsideMasterWindow(_hostPhTs, _hostRs)) {
                        // B-FIX-G: remember we held this panel during the host switch so that,
                        // once the host settles and re-broadcasts, we force a one-shot re-mirror
                        // even though the paused playhead timestamp has not advanced.
                        ch._mcMirrorHeldUnsettled = true;
                        _mcScheduleSettledSelfHeal(ch);
                        return;
                    }
                }
            }
        } catch (_) {}

        // B-FIX-G (panel settled resync): if this same-pair, same-TF panel was HELD during the
        // host TF-switch (flag set above), it MUST re-mirror the host's now-settled frame even
        // though the paused playhead ts is unchanged — otherwise the idle dedups below keep it
        // on stale pre-switch bars ("all candles outside viewport", old prices, content jumps).
        // One-shot: we only reach here once the B-FIX-F hold gate has released (host settled),
        // so clear the flag now and let this single frame apply. Panel B is unaffected (if it
        // already mirrored during the race, this just re-clones the identical host data).
        var _mcForceSettledResync = false;
        try {
            if (ch._mcMirrorHeldUnsettled === true
                && !(typeof window !== 'undefined' && window.__TALARIA_MC_DISABLE_PANEL_SETTLED_RESYNC)) {
                var _pcResync = readParentChart();
                var _hTfRS = _pcResync ? String(_pcResync.currentTimeframe || '').toLowerCase().trim() : '';
                var _pTfRS = String(ch.currentTimeframe || '').toLowerCase().trim();
                if (isSameSymbolAsHost(ch) && _hTfRS && _pTfRS && _hTfRS === _pTfRS) {
                    _mcForceSettledResync = true;
                }
                ch._mcMirrorHeldUnsettled = false;
            }
        } catch (_) {}

        if (!ch.rawData || ch.rawData.length === 0) {
            pendingReplayTs = ts;
            return applyReplayEnter(ch, ts);
        }
        if (!rs.isActive) {
            return applyReplayEnter(ch, ts);
        }

        // GENERAL IDLE-FRAME DEDUP (fixes "changing TF on panel B re-renders C/D").
        // The parent re-primes / re-broadcasts the CURRENT playhead frame whenever
        // any single panel reloads (e.g. a sibling's timeframe switch). For a panel
        // the user did NOT touch, re-applying a frame at the SAME timestamp it
        // already shows just re-slices + repaints for nothing — the visible
        // re-render + drift. Skip it unless: we are actively playing, animating a
        // forming candle, or this panel is explicitly viewport-synced to the host
        // (visibleRange/time sync ON — then it is SUPPOSED to follow host changes).
        // Genuine scrubs/advances change ts (or set isPlaying/anim) so they apply.
        try {
            var _animActiveG = !!(args.animatedCandle && Number(args.tickProgress) > 0);
            if (!_mcForceSettledResync && !ch._multichartVisibleRangeSyncOn && !args.isPlaying && !_animActiveG
                && Number.isFinite(ch._mcLastAppliedFrameTs) && ch._mcLastAppliedFrameTs === ts) {
                return;
            }
            ch._mcLastAppliedFrameTs = ts;
        } catch (_) {}

        // INDEPENDENT-PANEL FRAME DEDUP (fixes "host TF switch re-renders B/C/D").
        // An independent panel — a DIFFERENT symbol than the host, or the same
        // symbol on a DIFFERENT timeframe — follows ONLY the shared playhead
        // TIMESTAMP; the host's own TF/data changes are irrelevant to it. When the
        // host switches timeframe (or otherwise re-emits the SAME playhead) it
        // rebroadcasts a frame at a timestamp this panel already shows. Re-applying
        // it re-slices + resamples + repaints for no reason (the visible re-render).
        // Skip it when the timestamp has not advanced and we are neither actively
        // playing nor animating a forming candle. Genuine scrubs/advances change ts
        // (or set isPlaying/anim) so they still apply.
        try {
            var _pcInd = readParentChart();
            var _hTf = _pcInd ? String(_pcInd.currentTimeframe || '').toLowerCase().trim() : '';
            var _pTf = String(ch.currentTimeframe || '').toLowerCase().trim();
            var _independentFrame = !isSameSymbolAsHost(ch) || (!!_hTf && !!_pTf && _hTf !== _pTf);
            var _animActive = !!(args.animatedCandle && Number(args.tickProgress) > 0);
            if (_independentFrame && !_mcForceSettledResync && !args.isPlaying && !_animActive
                && Number.isFinite(ch._mcLastIndepFrameTs) && ch._mcLastIndepFrameTs === ts) {
                return;
            }
            if (_independentFrame) ch._mcLastIndepFrameTs = ts;
        } catch (_) {}

        if (rs.isPlaying) {
            if (!ch._multichartPassivePlayActive) {
                try {
                    if (typeof rs.stopTickAnimation === 'function') rs.stopTickAnimation();
                    if (typeof rs.pause === 'function') rs.pause();
                } catch (_) {}
            } else if (!ch._mcPassivePlayPausedOnce) {
                try {
                    if (typeof rs.stopTickAnimation === 'function') rs.stopTickAnimation();
                    if (typeof rs.pause === 'function') rs.pause();
                } catch (_) {}
                ch._mcPassivePlayPausedOnce = true;
            }
        }

        // Only mark "parent is playing" during active playback — paused step/scrub
        // frames must not block subsequent replayTick seeks on iframes.
        if (args.isPlaying) {
            pendingPlayDesired = true;
        }

        // D-015 (T8 step 5): unified play edge-park advance — during PLAY every
        // panel advances on its OWN loaded master at the shared playhead ts.
        // scheduleMirrorCatchUp / breaker park is fallback-only (paused / fix OFF).
        // Kill-switch __TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE (default fix ON).
        // Retires __TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE (aliased only).
        if (args.isPlaying && isPlayEdgeParkAdvanceEnabled()) {
            var _pcD015 = readParentChart();
            var _hTfD015 = _pcD015 ? String(_pcD015.currentTimeframe || '').toLowerCase().trim() : '';
            var _pTfD015 = String(ch.currentTimeframe || '').toLowerCase().trim();
            // Interval-sync + mixed TF: skip D-015 only for SAME-symbol peers that
            // are about to mirror the host TF. Independent tickers (different fileId)
            // must keep own-master advance — otherwise they fall into catch-up breaker
            // cooldown and the fine panel looks stuck, then resumes (~2.5s).
            var _skipD015ForIntervalTfSync = !!(ch._mcIntervalSyncOn
                && _hTfD015 && _pTfD015 && _hTfD015 !== _pTfD015
                && !ch._timeframeSwitching
                && isSameSymbolAsHost(ch));
            if (!_skipD015ForIntervalTfSync) {
                try {
                    if (typeof ch._multichartFinerSamePairPanelSelfOwns === 'function'
                        && ch._multichartFinerSamePairPanelSelfOwns()) {
                        ch._mcFinerOwnerActiveReplayCatchUp = true;
                    }
                } catch (_) {}
                // Same-symbol + same-TF: keep the fast host-batch mirror when it
                // succeeds (H-S25 eased follow); on miss, own-master coalesced seek
                // replaces the catch-up breaker primary path (D-015 edge-park fix).
                if (isSameSymbolAsHost(ch) && _hTfD015 && _pTfD015 && _hTfD015 === _pTfD015) {
                    if (typeof ch._syncReplayMasterFromParentIfCovers === 'function') {
                        try { ch._syncReplayMasterFromParentIfCovers(ts); } catch (_) {}
                    }
                    if (forceSamePairParentDataMirror(ch, args)) {
                        ch._mcCatchUpFails = 0;
                        ch._mcCatchUpCooldownUntil = 0;
                        return;
                    }
                }
                // BL-10 coarser same-pair: mirror-first coalesced seek (ownMaster=false)
                // keeps _serverCursors aligned with loaded edges (H-S20). Finer self-
                // owner + independent/same-TF-miss stay own-master (D-015 edge-park).
                // Mixed-TF flash fix lives in replay-system _mirrorSharesHostDataset
                // (same TF required): mirror-first then takes the independent-pair
                // anim path instead of samePairEmbed → goToReplayTimestamp thrash.
                var _ownMasterD015 = true;
                if (isSameSymbolAsHost(ch) && _hTfD015 && _pTfD015 && _hTfD015 !== _pTfD015) {
                    try {
                        if (typeof ch._multichartFinerSamePairPanelSelfOwns === 'function'
                            && ch._multichartFinerSamePairPanelSelfOwns()) {
                            _ownMasterD015 = true;
                        } else if (!(typeof window !== 'undefined'
                            && window.__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE)) {
                            _ownMasterD015 = peerPlayMustStayOnOwnMaster(ch);
                        }
                    } catch (_) {}
                }
                scheduleCoalescedSeek(ch, ts, _ownMasterD015);
                return;
            }
        }

        if (typeof rs.applyMultichartMirrorFrame !== 'function') {
            scheduleCoalescedSeek(ch, ts);
            return;
        }

        // Same symbol as host A: always paint host's batch — never the
        // furthest-loaded / per-candle catch-up path (panel C one-by-one).
        if (isSameSymbolAsHost(ch)) {
            var pcSym = readParentChart();
            var hostTf = pcSym ? String(pcSym.currentTimeframe || '').toLowerCase().trim() : '';
            var panelTf = String(ch.currentTimeframe || '').toLowerCase().trim();
            if (ch._mcIntervalSyncOn
                && hostTf && panelTf && hostTf !== panelTf && !ch._timeframeSwitching) {
                if (!ch._mcPendingHostTf) {
                    ch._mcPendingHostTf = hostTf;
                    setTimeout(function () {
                        ch._mcPendingHostTf = null;
                        try {
                            if (typeof ch._multichartMirrorHostTfSwitchIfReady === 'function'
                                && ch._multichartMirrorHostTfSwitchIfReady(hostTf)) {
                                return;
                            }
                            if (typeof ch.setTimeframe === 'function') ch.setTimeframe(hostTf);
                        } catch (_) {}
                    }, 0);
                }
                return;
            }
            // Independent TF by user choice (host switched TF, this panel kept its
            // own): NEVER mirror/step from the host's bars. This MUST run before
            // _syncReplayMasterFromParentIfCovers — that helper re-slices/renders
            // from the host master (goToReplayTimestamp), which is exactly the
            // re-render + backward drift we want to avoid on a different-TF panel.
            // This panel owns its own replay view; it only follows the shared
            // playhead timestamp, applied via applyMultichartMirrorFrame on its
            // OWN bars (handled by the earlier mirror path / dedup).
            if (hostTf && panelTf && hostTf !== panelTf) {
                try {
                    if (typeof ch._multichartFinerSamePairPanelSelfOwns === 'function'
                        && ch._multichartFinerSamePairPanelSelfOwns()) {
                        ch._mcFinerOwnerActiveReplayCatchUp = !!args.isPlaying;
                        // A7 (§6co, D-048): the finer-SELF-OWNER play-advance seek (peer
                        // finer than the host's committed NATIVE cadence) was the ONLY
                        // follow-less exit on the peer play-advance paths — the playhead
                        // advanced on the peer's own master while its viewport stayed put
                        // ("the candles run, the panels stop moving"). Carry the SAME
                        // settle-time leading-edge follow the own-master coalesced exit
                        // (:1849) and the mirror exits (:1837/:1843) already use. The
                        // follow tracks the peer's OWN leading edge
                        // (maybePanelPlayViewportFollow -> getReplayAutoScrollState) — NO
                        // host/parent data pull, so the b99 (BL-10/D-037) isolation cannot
                        // regress — and respects the D-038 drag-disengage contract
                        // (maybePanelPlayViewportFollow gates on userHasPanned /
                        // autoScrollEnabled). Default ON; kill-switch
                        // __TALARIA_MC_DISABLE_FINER_OWNER_PLAY_VIEWPORT_FOLLOW reverts to
                        // the follow-less seek.
                        if (typeof window !== 'undefined'
                            && window.__TALARIA_MC_DISABLE_FINER_OWNER_PLAY_VIEWPORT_FOLLOW) {
                            forceReplaySeek(ch, ts, false);
                        } else {
                            forceReplaySeek(ch, ts, false, function () { maybePanelPlayViewportFollow(ch); });
                        }
                    } else if (args.isPlaying
                        && !(typeof window !== 'undefined' && window.__TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE)) {
                        // BL-10 (D-037): a COARSER same-pair panel (not a finer self-
                        // owner) had NO play-advance cell here — it froze while the host
                        // played on ("host runs alone"), violating the shared-playhead
                        // invariant. During PLAY ONLY, advance this panel's playhead +
                        // forming candle on its OWN coarser master via the COALESCED
                        // seek: one seek per rAF no matter how many 1m host frames
                        // arrive, so the coarse panel repaints at its own cadence and
                        // never reslices per 1m tick (the BL-5 storm). scheduleCoalesced
                        // Seek already routes through the BL-5 coarse-host-switch guard
                        // (PAUSED-only — returns false during play, so it does NOT re-
                        // freeze here) and the BL-8 paused-aligned guard; paused/scrub
                        // behaviour is unchanged (those take the replayTick path, not
                        // this branch). Kill-switch:
                        // __TALARIA_MC_DISABLE_COARSE_PANEL_PLAY_ADVANCE.
                        //
                        // BL-10 (D-037) sync-off host-TF isolation: when the host's
                        // committed DISPLAY cadence differs from this peer's TF (host
                        // switched to another display TF), advance on the peer's OWN
                        // master ONLY — do NOT pull the host's TF-switched display
                        // data/master via the parent mirror (see
                        // peerPlayMustStayOnOwnMaster / kill-switch
                        // __TALARIA_MC_DISABLE_SYNCOFF_PEER_PLAY_HOST_TF_ISOLATION).
                        scheduleCoalescedSeek(ch, ts, peerPlayMustStayOnOwnMaster(ch));
                    }
                } catch (_) {}
                return;
            }
            // SAME symbol + SAME TF idle dedup. Once this panel's TF matches the
            // host's, it becomes a same-pair authoritative mirror: every host
            // replayFrame below re-clones host data + re-anchors the viewport. When
            // replay is PAUSED and the playhead has NOT advanced, re-mirroring the
            // identical frame on every rebroadcast just makes this panel re-render
            // and drift ("keeps moving") — and the general idle dedup above is
            // bypassed whenever Time/Date-range sync is on. Mirror once to align,
            // then no-op until replay actually plays or the playhead ts changes.
            var _samePairAnim = !!(args.animatedCandle && Number(args.tickProgress) > 0);
            if (!_mcForceSettledResync && !args.isPlaying && !_samePairAnim
                && Number.isFinite(ch._mcLastSamePairMirrorTs)
                && ch._mcLastSamePairMirrorTs === ts) {
                return;
            }
            ch._mcLastSamePairMirrorTs = ts;
            if (typeof ch._syncReplayMasterFromParentIfCovers === 'function') {
                try { ch._syncReplayMasterFromParentIfCovers(ts); } catch (_) {}
            }
            if (forceSamePairParentDataMirror(ch, args)) {
                ch._mcCatchUpFails = 0;
                ch._mcCatchUpCooldownUntil = 0;
                return;
            }
        }

        var applied = rs.applyMultichartMirrorFrame(args);
        if (applied) {
            ch._mcCatchUpFails = 0;
            ch._mcCatchUpCooldownUntil = 0;
            return;
        }

        // Same symbol + TF as host: parent tile A is authoritative — never
        // advance this panel on its own stale master (that is what made B/C
        // show different last candles and scrambled time axes vs A).
        if (forceSamePairParentDataMirror(ch, args)) {
            ch._mcCatchUpFails = 0;
            ch._mcCatchUpCooldownUntil = 0;
            return;
        }

        // Independent pair only — same-symbol panels never step one candle at a time.
        if (isSameSymbolAsHost(ch)) {
            var hostTfNow = readParentChart();
            hostTfNow = hostTfNow ? String(hostTfNow.currentTimeframe || '').toLowerCase().trim() : '';
            var panelTfNow = String(ch.currentTimeframe || '').toLowerCase().trim();
            if (hostTfNow && panelTfNow && hostTfNow !== panelTfNow) {
                return; // independent TF by user choice — do not step/mirror from host bars
            }
            scheduleMirrorCatchUp(ch, ts, args);
            return;
        }

        renderFurthestLoadedMirrorFrame(ch, rs, args);

        scheduleMirrorCatchUp(ch, ts, args);
    }

    function flushCoalescedReplayFrameApply() {
        coalescedReplayFrameRaf = null;
        var args = coalescedReplayFrameArgs;
        coalescedReplayFrameArgs = null;
        if (!args) return;
        var ch = getChartInstance();
        if (!ch) return;
        applyReplayFrame(ch, args);
    }

    function scheduleCoalescedReplayFrameApply(args) {
        coalescedReplayFrameArgs = args;
        if (coalescedReplayFrameRaf != null) return;
        var raf = global.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };
        coalescedReplayFrameRaf = raf(flushCoalescedReplayFrameApply);
    }

    function applyReplayFrameHot(args, directApply) {
        var ch = getChartInstance();
        if (!ch) return false;
        if (directApply) {
            applyReplayFrame(ch, args);
        } else {
            scheduleCoalescedReplayFrameApply(args);
        }
        return true;
    }

    /**
     * Advance this panel to the latest candle its loaded master already covers,
     * clamping the host timestamp down to the panel's last loaded bar. No-op when
     * the panel actually covers `ts` (handled by the normal mirror) or has no
     * resolvable master. Pure render — does not fetch.
     */
    function renderFurthestLoadedMirrorFrame(ch, rs, args) {
        try {
            if (!rs || typeof rs.applyMultichartMirrorFrame !== 'function') return;
            var ts = Number(args && args.timestamp);
            if (!Number.isFinite(ts)) return;
            var master = (Array.isArray(ch._panelFullRawData) && ch._panelFullRawData.length)
                ? ch._panelFullRawData
                : (rs.fullRawData && rs.fullRawData.length ? rs.fullRawData : null);
            if (!master || !master.length) return;
            var lastT = Number(master[master.length - 1] && master[master.length - 1].t);
            if (!Number.isFinite(lastT)) return;
            // Only step to the loaded edge when the host is genuinely ahead of it.
            if (lastT >= ts) return;
            var clamped = Object.assign({}, args, {
                timestamp: lastT,
                tickProgress: 0,
                tickElapsedMs: 0,
            });
            delete clamped.animatedCandle;
            rs.applyMultichartMirrorFrame(clamped);
        } catch (_) { /* best-effort only */ }
    }

    // ─── per-panel order forwarding state ──────────────────────────────
    //
    // panelOrderState.suppressEmitId — when the iframe is told to mirror
    //   an order (case 'addOrder'), it calls registerOpenOrder /
    //   registerPendingOrder which synchronously emit on
    //   chart.orderManager.orderService.eventBus. Without a guard, our
    //   own `order:opened` listener would forward that emission back
    //   to the parent which would broadcast back to us → infinite loop.
    //   Setting suppressEmitId=order.id while the register call runs
    //   (cleared on the next microtask) lets the listener skip the
    //   matching id ONCE.
    //
    // panelOrderState.busSubscribed — guard so the eventBus.on(...)
    //   subscription installs at most once even if waitForChart resolves
    //   multiple times (e.g. a future re-init path).
    var panelOrderState = {
        suppressEmitId: null,
        busSubscribed:  false,
    };

    function postIframeOrder(kind, order) {
        if (!orderMcLegacyIframeOrderV1EnabledBridge()) return;
        if (!order || order.id == null) return;
        if (panelOrderState.suppressEmitId === order.id) return;
        try {
            global.parent.postMessage({
                type:   'iframe-order',
                source: panelId,
                kind:   kind,
                order:  order,
                symbol: order.symbol || order.ticker || null,
            }, '*');
        } catch (e) {
            warn('postIframeOrder failed', e && e.message);
        }
    }

    function installOrderForwarders(ch) {
        if (panelOrderState.busSubscribed) return;
        var om  = ch && ch.orderManager;
        var svc = om && om.orderService;
        var bus = svc && svc.eventBus;
        if (!bus || typeof bus.on !== 'function') {
            // No service-style bus (legacy in-manager mode). Skip
            // silently — order-mirror still works for host-placed
            // orders because the host owns its own lifecycle.
            return;
        }
        panelOrderState.busSubscribed = true;
        bus.on('order:opened',          function (o) { postIframeOrder('opened',          o); });
        bus.on('order:pending',         function (o) { postIframeOrder('pending',         o); });
        bus.on('order:pending-updated', function (o) { postIframeOrder('pending-updated', o); });
        bus.on('order:closed',          function (o) { postIframeOrder('closed',          o); });
        bus.on('order:pending-removed', function (o) { postIframeOrder('pending-removed', o); });
        log('order forwarders installed');
    }

    function readParentReplayTimestamp() {
        try {
            var pc = global.parent && global.parent !== global ? global.parent.chart : null;
            var prs = pc && pc.replaySystem;
            if (prs && Number.isFinite(Number(prs.replayTimestamp))) {
                return Number(prs.replayTimestamp);
            }
        } catch (_) {}
        return null;
    }

    /** Mirror payload from host tile A (includes mid-tick pause state in _savedTickState). */
    function readParentReplayMirrorPayload() {
        try {
            var pc = global.parent && global.parent !== global ? global.parent.chart : null;
            var prs = pc && pc.replaySystem;
            if (!prs || !prs.isActive) return null;
            var ts = Number(prs.replayTimestamp);
            if (!Number.isFinite(ts)) return null;

            var tickProgress = 0;
            var tickElapsedMs = 0;
            var animSrc = null;

            // Host pause() clears tickProgress but keeps partial candle in _savedTickState.
            if (prs._savedTickState) {
                tickProgress = Number(prs._savedTickState.tickProgress) || 0;
                tickElapsedMs = Number(prs._savedTickState.tickElapsedMs) || 0;
                animSrc = prs._savedTickState.animatingCandle;
            }
            if (!animSrc && prs.animatingCandle) {
                tickProgress = Number(prs.tickProgress) || tickProgress;
                tickElapsedMs = Number(prs.tickElapsedMs) || tickElapsedMs;
                animSrc = prs.animatingCandle;
            }

            var payload = {
                timestamp: ts,
                isPlaying: !!prs.isPlaying,
                tickProgress: tickProgress,
                tickElapsedMs: tickElapsedMs,
                hostFileId: readParentHostFileId(),
                ticksPerCandle: prs.currentTicksPerCandle || prs.ticksPerCandle || 72,
            };

            if (animSrc && tickProgress > 0) {
                payload.animatedCandle = {
                    t: Number(animSrc.t),
                    o: Number(animSrc.open != null ? animSrc.open : animSrc.o),
                    h: Number(animSrc.high != null ? animSrc.high : animSrc.h),
                    l: Number(animSrc.low != null ? animSrc.low : animSrc.l),
                    c: Number(animSrc.close != null ? animSrc.close : animSrc.c),
                    v: Number(animSrc.volume != null ? animSrc.volume : animSrc.v) || 0,
                };
            }
            return payload;
        } catch (_) {}
        return null;
    }

    function applyParentReplayMirror(ch, seekTs, isPlayingOverride) {
        var rs = ch && ch.replaySystem;
        if (!rs || !rs.isActive || typeof rs.applyMultichartMirrorFrame !== 'function') {
            return false;
        }
        var payload = readParentReplayMirrorPayload();
        if (!payload) return false;
        if (Number.isFinite(seekTs)) payload.timestamp = seekTs;
        if (typeof isPlayingOverride === 'boolean') payload.isPlaying = isPlayingOverride;
        if (!payload.animatedCandle || !(Number(payload.tickProgress) > 0)) return false;
        try {
            // Preserve the exact viewport the play stream left behind — same guard
            // as applyStaticMirrorFrame. On PAUSE this path renders the host's frozen
            // partial candle, but the mirror's auto-scroll recompute re-fits the
            // viewport and drifts the playhead left, so play then snaps it back to
            // the right ("multichart jumps when I click play"). Snapshot the offset/
            // zoom, freeze auto-scroll for this single frame, then restore.
            var prevOffsetX = ch.offsetX;
            var prevCandleWidth = ch.candleWidth;
            var prevAutoScroll = rs.autoScrollEnabled;
            rs.autoScrollEnabled = false;
            var ok = !!rs.applyMultichartMirrorFrame(payload);
            rs.autoScrollEnabled = prevAutoScroll;
            if (ok) {
                var keepOffset = Number.isFinite(prevOffsetX);
                if (rs.userHasPanned || ch._multichartVisibleRangeSyncOn) {
                    keepOffset = Number.isFinite(prevOffsetX);
                } else if (keepOffset && typeof ch._multichartViewportNeedsRecovery === 'function'
                    && ch._multichartViewportNeedsRecovery()) {
                    keepOffset = false;
                }
                if (keepOffset) ch.offsetX = prevOffsetX;
                if (Number.isFinite(prevCandleWidth) && prevCandleWidth > 0) ch.candleWidth = prevCandleWidth;
                if (!keepOffset && typeof ch._syncIndependentPanelViewportIfNeeded === 'function') {
                    try {
                        ch._syncIndependentPanelViewportIfNeeded({ resetPriceScale: false, render: false });
                    } catch (_) {}
                }
                if (typeof ch.constrainOffset === 'function') {
                    try { ch.constrainOffset(); } catch (_) {}
                }
                ch.renderPending = true;
                if (typeof ch.render === 'function') ch.render();
            }
            return ok;
        } catch (e) {
            warn('applyParentReplayMirror threw', e && e.message);
            return false;
        }
    }

    /**
     * Independent-pair iframes can lag when mirror frames arrive faster than
     * /bars prefetch. Coalesce to the latest ts and refetch once per frame.
     */
    function scheduleMirrorCatchUp(ch, ts, args) {
        // Circuit-breaker: a panel that genuinely cannot reach the host playhead
        // (e.g. same symbol but a different / shorter session) would otherwise fire
        // a /bars fetch on every animation frame × every panel → the browser runs
        // out of sockets/memory (net::ERR_INSUFFICIENT_RESOURCES) and the page
        // freezes. After repeated failures we back off for a cooldown and just keep
        // showing the furthest candle the panel already holds.
        if (ch && Number.isFinite(ch._mcCatchUpCooldownUntil)
            && Date.now() < ch._mcCatchUpCooldownUntil) {
            // During Play on a different ticker, do not hard-park on cooldown —
            // clear and retry cover (saved-session restore often trips the breaker).
            if (pendingPlayDesired && !isSameSymbolAsHost(ch) && isPlayEagerCoverEnabled()) {
                clearIndependentCatchUpCooldown(ch);
            } else {
                // Soft park: still paint the furthest loaded bar + pin shared playhead
                // so independent fine panels don't look fully frozen during cooldown.
                try {
                    var rsCd = ch.replaySystem;
                    if (rsCd && args) {
                        renderFurthestLoadedMirrorFrame(ch, rsCd, args);
                        if (Number.isFinite(ts)) rsCd.replayTimestamp = ts;
                    }
                } catch (_) {}
                return;
            }
        }
        if (Number.isFinite(ts)) {
            coalescedMirrorCatchUpTs = coalescedMirrorCatchUpTs == null
                ? ts
                : Math.max(coalescedMirrorCatchUpTs, ts);
        }
        if (args && typeof args === 'object') {
            coalescedMirrorCatchUpArgs = args;
        }
        if (coalescedMirrorCatchUpScheduled) return;
        coalescedMirrorCatchUpScheduled = true;
        var raf = global.requestAnimationFrame || function (fn) {
            return setTimeout(fn, 16);
        };
        raf(function () {
            coalescedMirrorCatchUpScheduled = false;
            var seekTs = coalescedMirrorCatchUpTs;
            var frameArgs = coalescedMirrorCatchUpArgs;
            coalescedMirrorCatchUpTs = null;
            coalescedMirrorCatchUpArgs = null;
            if (seekTs == null || !ch) return;
            var rs = ch.replaySystem;
            if (!rs || !rs.isActive) return;

            function buildPayload() {
                if (frameArgs && typeof frameArgs === 'object') {
                    return Object.assign({}, frameArgs, { timestamp: seekTs });
                }
                return {
                    timestamp: seekTs,
                    isPlaying: ch._multichartPassivePlayActive === true,
                    tickProgress: rs.tickProgress || 0,
                    tickElapsedMs: rs.tickElapsedMs || 0,
                    hostFileId: readParentHostFileId(),
                };
            }

            function retryMirror() {
                if (typeof rs.applyMultichartMirrorFrame !== 'function') return false;
                try {
                    return !!rs.applyMultichartMirrorFrame(buildPayload());
                } catch (e) {
                    warn('mirror catch-up: applyMultichartMirrorFrame threw', e && e.message);
                    return false;
                }
            }

            if (retryMirror()) return;

            if (typeof ch.ensureReplayDataCoversTimestamp !== 'function') {
                scheduleCoalescedSeek(ch, seekTs);
                return;
            }

            var tripBreaker = function () {
                // Too many failed catch-ups in a row → this panel can't reach the
                // host ts (different/short session). Stop fetching for a cooldown so
                // we don't flood the network; the furthest-loaded frame stays shown.
                ch._mcCatchUpFails = (Number(ch._mcCatchUpFails) || 0) + 1;
                if (ch._mcCatchUpFails >= 3) {
                    ch._mcCatchUpFails = 0;
                    ch._mcCatchUpCooldownUntil = Date.now() + 2500;
                    return true;
                }
                return false;
            };
            ch.ensureReplayDataCoversTimestamp(seekTs).then(function () {
                if (retryMirror()) {
                    ch._mcCatchUpFails = 0;
                    ch._mcCatchUpCooldownUntil = 0;
                    return;
                }
                if (tripBreaker()) return;
                var latest = pendingReplayTs != null ? pendingReplayTs : readParentReplayTimestamp();
                if (Number.isFinite(latest) && latest > seekTs) {
                    scheduleMirrorCatchUp(ch, latest, frameArgs);
                    return;
                }
                scheduleCoalescedSeek(ch, seekTs);
            }).catch(function (e) {
                warn('mirror catch-up: ensureReplayDataCoversTimestamp failed', e && e.message);
                if (tripBreaker()) return;
                scheduleCoalescedSeek(ch, seekTs);
            });
        });
    }

    function readParentChart() {
        try {
            return global.parent && global.parent !== global ? global.parent.chart : null;
        } catch (_) {}
        return null;
    }

    // D-015 unified play edge-park advance (T8 step 5). Default ON; OFF reverts all
    // playing panels to pre-D-015 paths (mirror + catch-up breaker). Step-3 switch
    // __TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE is retired — alias only so
    // no dual-gate window (I13).
    function isPlayEdgeParkAdvanceEnabled() {
        if (typeof window !== 'undefined') {
            if (window.__TALARIA_MC_DISABLE_PLAY_EDGE_PARK_ADVANCE) return false;
            if (window.__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE) return false;
        }
        return true;
    }

    // BL-10 (D-037) SYNC-OFF PEER PLAY / HOST-TF ISOLATION:
    // With ALL sync OFF, a host TF switch must leave every OTHER same-pair peer
    // completely unaffected. The P4 same-symbol/different-TF PLAY branch routes a
    // non-finer-self-owner peer through scheduleCoalescedSeek, whose parent-mirror
    // pulls (applyParentReplayMirror / applyStaticMirrorFrame →
    // readParentReplayMirrorPayload / _syncReplayMasterFromParentIfCovers) clone
    // the host's now-TF-switched DISPLAY data/master onto the peer — flipping the
    // peer's data cadence + regressing its replay master to the host window WHILE
    // its TF label stays put ("4H candles under a 1m label"). This is only wrong in
    // the LEAK direction: the peer is FINER than the host's committed DISPLAY
    // cadence (the host switched to a COARSER display TF), so adopting the host's
    // coarser master corrupts the finer peer. Returns true then, so the peer
    // advances on its OWN master instead. A genuinely COARSER peer following a
    // finer host (legitimate BL-10 / H-S17) is NOT affected — it keeps the full
    // coalesced mirror path and still tracks the host. Kill-switch
    // __TALARIA_MC_DISABLE_SYNCOFF_PEER_PLAY_HOST_TF_ISOLATION (default = fix ON)
    // reverts to the leaking parent-mirror pull.
    function peerPlayMustStayOnOwnMaster(ch) {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_MC_DISABLE_SYNCOFF_PEER_PLAY_HOST_TF_ISOLATION) {
                return false;
            }
            var pc = readParentChart();
            if (!pc || !ch || typeof ch.parseTimeframe !== 'function') return false;
            var panelTf = String(ch.currentTimeframe || '').toLowerCase().trim();
            var hostTf = String(pc.currentTimeframe || '').toLowerCase().trim();
            if (!panelTf || !hostTf || panelTf === hostTf) return false;
            var panelMs = Number(ch.parseTimeframe(panelTf));
            var hostMs = Number(ch.parseTimeframe(hostTf));
            if (!Number.isFinite(panelMs) || !Number.isFinite(hostMs)) return false;
            // Only the LEAK direction: peer FINER than the host's committed DISPLAY
            // cadence, AND the host truly DISPLAYS that coarser cadence (its committed
            // bars match its own TF — it switched display, not just its label). A
            // coarser peer (panelMs > hostMs) keeps the legitimate mirror follow.
            if (!(panelMs < hostMs)) return false;
            var hostDisplaysHostTf = (typeof pc._committedBarsMatchTimeframe === 'function')
                ? !!pc._committedBarsMatchTimeframe(hostTf)
                : true;
            return hostDisplaysHostTf;
        } catch (_) {
            return false;
        }
    }

    /** Host tile A's current fileId, so mirror frames pick the shared vs independent path correctly. */
    function readParentHostFileId() {
        var pc = readParentChart();
        if (pc && pc.currentFileId != null && pc.currentFileId !== '') {
            return String(pc.currentFileId);
        }
        return null;
    }

    function isSameSymbolAsHost(ch) {
        var pc = readParentChart();
        if (!pc || !ch) return false;
        var hostFid = pc.currentFileId != null ? String(pc.currentFileId) : '';
        var panelFid = ch.currentFileId != null ? String(ch.currentFileId) : '';
        return !!(hostFid && panelFid && hostFid === panelFid);
    }

    function isSamePairAsHost(ch) {
        if (!isSameSymbolAsHost(ch)) return false;
        var pc = readParentChart();
        var pTf = String(pc.currentTimeframe || '').toLowerCase().trim();
        var mTf = String(ch.currentTimeframe || '').toLowerCase().trim();
        return !pTf || !mTf || pTf === mTf;
    }

    /**
     * Same-pair iframe: force B/C/D to paint exactly what host A already has.
     * Used when the slow resample path rejects a frame (local master shorter than host)
     * but the host's rendered arrays are the source of truth.
     * @returns {boolean}
     */
    function forceSamePairParentDataMirror(ch, args) {
        if (!isSamePairAsHost(ch)) return false;
        var pc = readParentChart();
        var rs = ch && ch.replaySystem;
        if (!pc || !rs || !Array.isArray(pc.data) || !pc.data.length) return false;
        if (typeof rs.applyMultichartMirrorFrame !== 'function') return false;

        var payload = null;
        if (args && typeof args === 'object' && Number.isFinite(Number(args.timestamp))) {
            payload = Object.assign({}, args);
        } else {
            payload = readParentReplayMirrorPayload();
        }
        if (!payload) return false;
        if (pc.currentFileId != null) payload.hostFileId = String(pc.currentFileId);
        if (Number.isFinite(pc.offsetX)) payload.hostOffsetX = pc.offsetX;
        var prs = pc.replaySystem;
        if (prs && Number.isFinite(prs.currentIndex)) payload.currentIndex = prs.currentIndex;

        var prevOffsetX = ch.offsetX;
        var prevCandleWidth = ch.candleWidth;
        var prevAutoScroll = rs.autoScrollEnabled;
        var mirrorPrependCompensation = null;
        // During active playback the panel tracks the host playhead like the main
        // chart (unless the user manually panned THIS panel). Let the mirror's own
        // follow path set + render the followed offset in a single pass — forcing
        // autoScroll off here is what froze panels while candles advanced.
        var willFollowPlayhead = (!!(payload && payload.isPlaying)
            || ch._multichartPassivePlayActive === true) && !rs.userHasPanned;
        rs.autoScrollEnabled = willFollowPlayhead;
        var ok = false;
        try {
            ok = !!rs.applyMultichartMirrorFrame(payload);
        } catch (_) {}
        if (!ok) {
            try {
                var mirrorPrependSnapshot = (ch && typeof ch._captureMultichartMirrorPrependSnapshot === 'function')
                    ? ch._captureMultichartMirrorPrependSnapshot(rs)
                    : null;
                ch.rawData = pc.rawData;
                ch.data = pc.data;
                if (prs) {
                    if (Array.isArray(prs.fullRawData) && prs.fullRawData.length) {
                        rs.fullRawData = prs.fullRawData;
                        rs.rawTimeframe = prs.rawTimeframe || '1m';
                        rs._fullRawDataMatchesTF = prs._fullRawDataMatchesTF;
                    }
                    var pts = Number(payload.timestamp);
                    if (Number.isFinite(pts)) rs.replayTimestamp = pts;
                    else if (Number.isFinite(Number(prs.replayTimestamp))) {
                        rs.replayTimestamp = Number(prs.replayTimestamp);
                    }
                    mirrorPrependCompensation = (ch && typeof ch._applyMultichartMirrorPrependCompensation === 'function')
                        ? ch._applyMultichartMirrorPrependCompensation(mirrorPrependSnapshot, { replay: rs })
                        : null;
                    if (Number.isFinite(prs.currentIndex) && !mirrorPrependCompensation) {
                        rs.currentIndex = prs.currentIndex;
                    }
                    if (payload.animatedCandle && Number(payload.tickProgress) > 0) {
                        rs.tickProgress = Number(payload.tickProgress) || 0;
                        rs.tickElapsedMs = Number(payload.tickElapsedMs) || 0;
                        var ac = payload.animatedCandle;
                        rs.animatingCandle = {
                            t: Number(ac.t),
                            open: Number(ac.o),
                            high: Number(ac.h),
                            low: Number(ac.l),
                            close: Number(ac.c),
                            volume: Number(ac.v) || 0,
                        };
                    } else {
                        rs.tickProgress = 0;
                        rs.tickElapsedMs = 0;
                        rs.animatingCandle = null;
                    }
                }
                if (Array.isArray(pc._panelFullRawData) && pc._panelFullRawData.length) {
                    ch._panelFullRawData = pc._panelFullRawData;
                }
                if (mirrorPrependCompensation) {
                    ch._chartViewRestored = true;
                } else if (!rs.userHasPanned) {
                    // Error fallback: same independence rule as the main follow path —
                    // prefer this panel's OWN auto-scroll offset; only copy host pixels
                    // when visible-range sync is explicitly ON.
                    var rangeSyncOnFb = !!ch._multichartVisibleRangeSyncOn;
                    var fbSt = (!rangeSyncOnFb && typeof rs.getReplayAutoScrollState === 'function')
                        ? rs.getReplayAutoScrollState(ch)
                        : null;
                    if (fbSt && Number.isFinite(fbSt.offsetX)) {
                        ch.offsetX = fbSt.offsetX;
                    } else if (rangeSyncOnFb && Number.isFinite(payload.hostOffsetX)) {
                        ch.offsetX = Number(payload.hostOffsetX);
                    } else if (rangeSyncOnFb && Number.isFinite(pc.offsetX)) {
                        ch.offsetX = pc.offsetX;
                    }
                }
                if (typeof ch.bumpDataVersion === 'function') ch.bumpDataVersion();
                ch.renderPending = false;
                if (typeof ch.render === 'function') ch.render();
                ok = true;
            } catch (_) {
                ok = false;
            }
        }
        rs.autoScrollEnabled = prevAutoScroll;
        if (ok) {
            // During active playback the panel must track the host playhead like the
            // main chart — this is core replay behavior and must NOT be gated on the
            // visible-range sync toggle (which defaults OFF). Only a manual pan on THIS
            // panel opts it out. When paused/scrubbing we fall back to the sync-aware
            // logic below so an independent panel keeps its own view.
            var hostPlaying = !!(payload && payload.isPlaying)
                || ch._multichartPassivePlayActive === true;
            var followPlayhead = hostPlaying && !rs.userHasPanned;
            if (mirrorPrependCompensation) {
                if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
            } else if (followPlayhead) {
                // VIEWPORT INDEPENDENCE (single-chart parity): the panel follows the
                // host PLAYHEAD during replay, but it must do so with its OWN viewport
                // math, not by copying host pixels. Adopt the host zoom (candleWidth)
                // ONLY when visible-range sync is explicitly ON; otherwise keep this
                // panel's own zoom. Right-anchor to the playhead via this panel's OWN
                // getReplayAutoScrollState (identical to how a single chart auto-scrolls
                // in replay). Falling back to the host's raw pixel offsetX is what made
                // panels drift/shake/zoom-jump, so only do that when sync is ON; with
                // sync OFF and our own state unavailable (width lag), keep our offset.
                var rangeSyncOn = !!ch._multichartVisibleRangeSyncOn;
                if (rangeSyncOn && Number.isFinite(pc.candleWidth) && pc.candleWidth > 0) {
                    ch.candleWidth = pc.candleWidth;
                }
                // FIX A (A7/A8/A11 same-TF eased follow, X-jump): a same-pair SAME-TF
                // panel followed the playhead here with the BAR-QUANTIZED offset from
                // getReplayAutoScrollState — offsetX froze within a candle then leapt
                // exactly one candleSpacing per bar (_mcPlayFollowRenders stayed 0),
                // because BL-13's continuous eased sub-candle follow
                // (_panelPlayFollowContinuousOffsetX) was only wired into the coarse
                // maybePanelPlayViewportFollow path, never this same-TF one. With sync
                // OFF and following the playhead, apply that EXISTING eased sub-candle
                // offset (SAME helper, no new easing math) with the SAME device-pixel-
                // column coalesce used elsewhere so this path scrolls host-parity
                // smooth. Kill-switch __TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW
                // (default = fix ON) reverts to the quantized follow. Range-synced /
                // coarser / finer / independent paths untouched (gated on !rangeSyncOn
                // and this same-TF call site only).
                var samePairEasedOn = !rangeSyncOn
                    && !(typeof window !== 'undefined'
                        && window.__TALARIA_MC_DISABLE_SAMETF_PANEL_PLAY_EASED_FOLLOW);
                var easedOffsetX = samePairEasedOn
                    ? _panelPlayFollowContinuousOffsetX(ch, rs)
                    : NaN;
                if (Number.isFinite(easedOffsetX)) {
                    var dprSt = (typeof window !== 'undefined'
                        && Number.isFinite(window.devicePixelRatio)
                        && window.devicePixelRatio > 0)
                        ? window.devicePixelRatio
                        : 1;
                    var appliedSt = Number(ch._mcPlayFollowAppliedOffsetX);
                    if (Number.isFinite(appliedSt)
                        && Math.round(easedOffsetX * dprSt) === Math.round(appliedSt * dprSt)) {
                        // Same device-pixel column as the last applied eased offset —
                        // sub-pixel/stationary/paused advance. Re-pin without repaint
                        // (the mirror already rendered this frame) so the coalesce is a
                        // clean 1-render-per-device-pixel-column.
                        ch.offsetX = appliedSt;
                        if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
                    } else {
                        ch.offsetX = easedOffsetX;
                        if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
                        ch._mcPlayFollowAppliedOffsetX = Number(ch.offsetX);
                        ch._mcPlayFollowRenders = (ch._mcPlayFollowRenders | 0) + 1;
                        ch.renderPending = true;
                        if (typeof ch.render === 'function') ch.render();
                    }
                } else {
                    var followSt = (typeof rs.getReplayAutoScrollState === 'function')
                        ? rs.getReplayAutoScrollState(ch)
                        : null;
                    if (followSt && Number.isFinite(followSt.offsetX)) {
                        ch.offsetX = followSt.offsetX;
                    } else if (rangeSyncOn && Number.isFinite(payload.hostOffsetX)) {
                        ch.offsetX = Number(payload.hostOffsetX);
                    } else if (rangeSyncOn && Number.isFinite(pc.offsetX)) {
                        ch.offsetX = pc.offsetX;
                    } else if (Number.isFinite(prevOffsetX)) {
                        ch.offsetX = prevOffsetX;
                    }
                    if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
                }
            } else {
                var passiveFollow = !rs.userHasPanned
                    && ch._multichartVisibleRangeSyncOn !== false;
                if (!passiveFollow) {
                    var keepOffset = Number.isFinite(prevOffsetX);
                    if (rs.userHasPanned || ch._multichartVisibleRangeSyncOn) {
                        keepOffset = Number.isFinite(prevOffsetX);
                    } else if (keepOffset && typeof ch._multichartViewportNeedsRecovery === 'function'
                        && ch._multichartViewportNeedsRecovery()) {
                        keepOffset = false;
                    }
                    if (keepOffset) ch.offsetX = prevOffsetX;
                    if (Number.isFinite(prevCandleWidth) && prevCandleWidth > 0) {
                        ch.candleWidth = prevCandleWidth;
                    }
                } else if (pc && Number.isFinite(pc.candleWidth) && pc.candleWidth > 0) {
                    ch.candleWidth = pc.candleWidth;
                }
            }
        }
        return ok;
    }

    /**
     * Apply a static (no animation) mirror frame — identical render path to the play-time
     * replayFrame stream. Used for pause / scrub / step so the panel does NOT jump to a
     * different viewport (goToReplayTimestamp) and snap back when play resumes.
     * @returns {boolean} true when the mirror frame rendered.
     */
    function applyStaticMirrorFrame(ch, ts) {
        var rs = ch && ch.replaySystem;
        if (!rs || !rs.isActive || typeof rs.applyMultichartMirrorFrame !== 'function') return false;
        try {
            // Preserve the exact viewport the play stream left behind. The pause ts equals the
            // last frame ts, so the slice is identical — re-deriving offset/zoom via the mirror's
            // auto-scroll recompute is what makes the panel visibly jump and snap back.
            var prevOffsetX = ch.offsetX;
            var prevCandleWidth = ch.candleWidth;
            var prevAutoScroll = rs.autoScrollEnabled;
            // Freeze auto-scroll for this single static frame so it can't re-fit the viewport.
            rs.autoScrollEnabled = false;
            var ok = false;
            var parentPayload = readParentReplayMirrorPayload();
            if (parentPayload && Number(parentPayload.timestamp) === ts) {
                parentPayload.isPlaying = false;
                if (!parentPayload.hostFileId) parentPayload.hostFileId = readParentHostFileId();
                ok = !!rs.applyMultichartMirrorFrame(parentPayload);
            }
            if (!ok) {
                ok = !!rs.applyMultichartMirrorFrame({
                    timestamp: ts,
                    isPlaying: false,
                    tickProgress: 0,
                    tickElapsedMs: 0,
                    hostFileId: readParentHostFileId(),
                });
            }
            if (!ok) {
                ok = forceSamePairParentDataMirror(ch, { timestamp: ts, isPlaying: false });
            }
            rs.autoScrollEnabled = prevAutoScroll;
            if (ok) {
                var keepOffset = Number.isFinite(prevOffsetX);
                // Keep the current offset when EITHER:
                //   • the user deliberately panned this tile (manual pan disables
                //     auto-recenter, matching the main chart), OR
                //   • visible-range / date-range sync is driving this tile's
                //     viewport from the host (panel A) — recomputing here would
                //     snap it back to the playhead and fight the incoming sync.
                if (rs.userHasPanned || ch._multichartVisibleRangeSyncOn) {
                    keepOffset = Number.isFinite(prevOffsetX);
                } else if (keepOffset && typeof ch._multichartViewportNeedsRecovery === 'function'
                    && ch._multichartViewportNeedsRecovery()) {
                    keepOffset = false;
                }
                if (keepOffset) ch.offsetX = prevOffsetX;
                if (Number.isFinite(prevCandleWidth) && prevCandleWidth > 0) ch.candleWidth = prevCandleWidth;
                if (!keepOffset && typeof ch._syncIndependentPanelViewportIfNeeded === 'function') {
                    try {
                        ch._syncIndependentPanelViewportIfNeeded({ resetPriceScale: false, render: false });
                    } catch (_) {}
                }
                if (typeof ch.constrainOffset === 'function') {
                    try { ch.constrainOffset(); } catch (_) {}
                }
                ch.renderPending = true;
                if (typeof ch.render === 'function') ch.render();
            }
            return ok;
        } catch (e) {
            warn('applyStaticMirrorFrame threw', e && e.message);
            return false;
        }
    }

    // BL-5 (paused COARSER same-pair panel candle-by-candle re-render on host FINER TF switch):
    // when the HOST switches to a FINER TF (e.g. 4h host -> 1m) while replay is PAUSED, a COARSER
    // same-pair panel (still 4h) must NOT chase the host's finer playhead ts through the coalesced
    // seek. Doing so runs forceReplaySeek -> ensureReplayDataCoversTimestamp ->
    // _syncReplayMasterFromParentIfCovers -> goToReplayTimestamp (replay-system.js), which reseeds
    // this panel onto the host's now-1m master and resamples a large 1m prefix down to the coarse
    // panel TF on every rAF -> "No candles drawn! All N candles outside viewport" (N incrementing)
    // + the 50ms rAF violation (candle-by-candle). It is SLOW for a 1m host (huge 1m prefix to
    // resample) and FAST for a 4h host (tiny prefix). The panel already holds the correct detached
    // slice + viewport at its own (unchanged) playhead, so keep it. Only skip a NO-OP re-anchor
    // (panel already aligned to its own playhead) — a genuine scrub moves ts and still seeks. Finer
    // self-owning panels (which detach + own their finer view) and same-TF mirror panels are
    // untouched. Kill-switch: window.__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK.
    function shouldSkipCoarsePanelHostSwitchSeek(ch, ts) {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_SEEK) {
                return false;
            }
            if (!ch || !isMultichartIframePanel()) return false;
            var rs = ch.replaySystem;
            if (!rs || !rs.isActive) return false;
            // PAUSED only — real playback must keep streaming/seeking.
            if (rs.isPlaying || isParentReplayPlaying()) return false;
            // Same symbol as host, on a DIFFERENT timeframe.
            if (!isSameSymbolAsHost(ch)) return false;
            var pc = readParentChart();
            var hostTf = pc ? String(pc.currentTimeframe || '').toLowerCase().trim() : '';
            var panelTf = String(ch.currentTimeframe || '').toLowerCase().trim();
            if (!hostTf || !panelTf || hostTf === panelTf) return false;
            // Finer self-owning panels detach + own their finer view — never touch them.
            if (typeof ch._multichartFinerSamePairPanelSelfOwns === 'function'
                && ch._multichartFinerSamePairPanelSelfOwns()) {
                return false;
            }
            // COARSER only: this panel's bar is longer than the (now finer) host bar.
            var hostMs = (typeof ch.parseTimeframe === 'function') ? ch.parseTimeframe(hostTf) : NaN;
            var panelMs = (typeof ch.parseTimeframe === 'function') ? ch.parseTimeframe(panelTf) : NaN;
            if (!(Number.isFinite(hostMs) && Number.isFinite(panelMs) && panelMs > hostMs)) return false;
            // Only a no-op re-anchor: panel already at its own playhead (paused, ts unchanged).
            return isPanelReplayAligned(ch, ts);
        } catch (_) {
            return false;
        }
    }

    // BL-2b (price-axis independence): stamp a short-lived "host-originated replay
    // frame/seek" window on the panel so replay-system's syncReplayViewportToPlayhead
    // knows this reset is HOST-driven (not the panel's own scrub / local playback) and
    // skips the price reset when independence is enforced. Set from the host message
    // entry points only; the consumer is gated by the kill-switch so this is a harmless
    // no-op timestamp when __TALARIA_MC_DISABLE_PANEL_PRICE_INDEPENDENCE is ON.
    function markHostReplayContext(ch) {
        try { if (ch) ch._mcHostReplayContextUntil = Date.now() + 2000; } catch (_) {}
    }

    // BL-8 (paused replay same-ts tick from a sibling TF switch): when sync is
    // OFF and this iframe panel is already at the replay timestamp, a parent
    // replayTick is only a bus re-prime. Re-seeking it re-centers the untouched
    // panel's X viewport and calculateScales refits its Y domain. Keep genuine
    // scrubs/steps (timestamp changes) and viewport-sync followers intact.
    // Kill-switch: __TALARIA_MC_DISABLE_PAUSED_REPLAY_ALIGNED_SEEK_GUARD.
    function shouldSkipPausedAlignedReplaySeek(ch, ts) {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_MC_DISABLE_PAUSED_REPLAY_ALIGNED_SEEK_GUARD) {
                return false;
            }
            if (!ch || !isMultichartIframePanel()) return false;
            if (ch._multichartVisibleRangeSyncOn) return false;
            var rs = ch.replaySystem;
            if (!rs || !rs.isActive || rs.isPlaying || isParentReplayPlaying()) return false;
            return isPanelReplayAligned(ch, ts);
        } catch (_) {
            return false;
        }
    }

    // BL-6 (viewport-park regression from the BL-5 skip): the BL-5 guard
    // (shouldSkipCoarsePanelHostSwitchSeek) preserves a coarser paused same-pair
    // panel's detached slice by skipping the coalesced seek — which killed the
    // per-frame resample storm, but ALSO removed the only routine offsetX recenter
    // path (replayTick → scheduleCoalescedSeek → forceReplaySeek → goToReplayTimestamp
    // → updateChartData auto-scroll → syncReplayViewportToPlayhead offsetX at
    // replay-system.js:2855). So after a host TF switch the panel's TIME viewport
    // parks off-screen ("No candles drawn! All N candles outside viewport", stable
    // count). This does a ONE-SHOT offsetX-only recenter when the panel is actually
    // parked — NOT a seek/reslice/master-adoption (that IS the BL-5 storm and is
    // explicitly avoided here). resetPriceScale:false preserves BL-2b price-axis
    // independence; offsetX still applies at replay-system.js:2855.
    // Kill-switch __TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER (ON
    // = today's BL-5-only behavior, i.e. the park returns).
    function maybeRecenterCoarsePanelAfterHostSwitch(ch) {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_MC_DISABLE_COARSE_PANEL_HOSTSWITCH_VIEWPORT_RECENTER) {
                return;
            }
            if (!ch) return;
            var rs = ch.replaySystem;
            if (!rs || !rs.isActive || typeof rs.syncReplayViewportToPlayhead !== 'function') return;
            // Re-arm the one-shot latch whenever the host's currentTimeframe changes
            // (a new host switch) so a subsequent switch can recenter once again.
            var pc = readParentChart();
            var hostTf = pc ? String(pc.currentTimeframe || '').toLowerCase().trim() : '';
            if (hostTf && ch._mcLastHostTfForRecenter !== hostTf) {
                ch._mcLastHostTfForRecenter = hostTf;
                ch._mcCoarseHostSwitchRecenterDone = false;
            }
            // Only recenter when the viewport is actually parked off-screen.
            var parked = (typeof ch._countVisiblePlotBars === 'function'
                    && ch._countVisiblePlotBars() === 0)
                || (typeof ch._multichartViewportNeedsRecovery === 'function'
                    && ch._multichartViewportNeedsRecovery());
            if (!parked) {
                // Visible again → re-arm for the NEXT host switch.
                ch._mcCoarseHostSwitchRecenterDone = false;
                return;
            }
            // Truly one-shot per host switch — must NOT run every rAF.
            if (ch._mcCoarseHostSwitchRecenterDone) return;
            ch._mcCoarseHostSwitchRecenterDone = true;
            rs.syncReplayViewportToPlayhead(ch, {
                forceRecenter: true,
                resetPriceScale: false,
                render: true,
            });
        } catch (_) {}
    }

    // BL-11 (D-038): play-time forward viewport follow for iframe panels. During
    // replay PLAY, a panel routed through the coalesced-seek window-preserving path
    // (applyStaticMirrorFrame / applyParentReplayMirror — added for BL-2b so
    // pause/scrub does NOT re-fit/snap the viewport) advances its bars but keeps its
    // frozen offsetX, so the playhead marches off the right edge ("host runs alone,
    // panels don't follow"). The COARSER same-pair play-advance branch is the RED
    // path (same-TF panels already follow via forceSamePairParentDataMirror). Give
    // those panels the SAME leading-edge follow host A uses: replay-system's
    // syncReplayViewportToPlayhead recomputes offsetX to the auto-scroll leading edge
    // (getReplayAutoScrollState → replay-system.js:2855). Constraints matched here:
    //   • PLAY-ONLY — gated on the parent (host) actively playing; paused/scrub keep
    //     the window-preserving path untouched (no BL-2b re-fit/snap-back).
    //   • X/TIME ONLY — resetPriceScale:false preserves BL-2b price-axis independence.
    //   • LEADING-EDGE DISENGAGE — if the user panned THIS panel (userHasPanned) or
    //     auto-scroll is off, it has opted out until it returns to the edge; we skip
    //     (and syncReplayViewportToPlayhead's own _replayUserOwnsViewport gate agrees),
    //     so we never fight the user's drag or BL-6 recenter.
    // Kill-switch __TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW ON = today's RED
    // (frozen viewport, playhead marches off-screen).
    //
    // BL-12 (D-039) COST GUARD: the BL-11 follow above renders on EVERY host play-
    // frame (render:true), so on a coarse same-pair panel routed here per frame the
    // playhead advancing within the same pixel column still forces a full recenter+
    // render — dragging a chart during play was laggy while a stopped/paused drag was
    // smooth. Two independent cost cuts, BOTH scoped to the BL-11 follow only and BOTH
    // behind ONE new kill-switch __TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD (default
    // = fix ON; setting it restores today's per-frame behaviour, so cost/correctness
    // revert independently of BL-11):
    //   (a) SUSPEND the follow entirely for a panel during ACTIVE user interaction
    //       (drag/pan/zoom in progress). The drag already disengages follow
    //       semantically (userHasPanned), so the per-frame invocation is pure waste;
    //       skipping it guarantees the follow never fights the user's drag or the
    //       BL-6 recenter.
    //   (b) COALESCE the render at DEVICE-PIXEL granularity via a CONTINUOUS eased
    //       leading-edge offset (BL-13 / D-041). The BL-11 leading-edge target
    //       (getReplayAutoScrollState → offsetX = -scrollPosition·candleSpacing) is
    //       BAR-QUANTIZED: it only moves when a whole candle forms, so a threshold in
    //       device pixels vs candle-width is a verified NO-OP — on a coarse panel the
    //       viewport sat frozen for a whole candle then JUMPED one candleSpacing
    //       ("stuck then jumps group-by-group"), not smooth like the host. D-041 fix:
    //       derive a CONTINUOUS sub-candle offset from the SHARED PLAYHEAD TIMESTAMP —
    //         fraction = (replayTimestamp − formingBarStartTs) / barDurationMs  ∈ [0,1]
    //         continuousOffsetX = quantizedOffsetX − fraction·candleSpacing
    //       (NEVER wall-clock / rAF time — a pure function of the shared replay
    //       timestamp, so it is deterministic, harness-assertable, in lockstep with the
    //       host, and PAUSE freezes the fraction exactly where it is with no snap). Then
    //       recenter+render ONLY when that continuous offset crosses into a NEW device-
    //       pixel column; a genuinely SUB-PIXEL (or stationary/paused) advance costs
    //       ZERO renders. At the bar-boundary seam the pre-seam limit (q − candleSpacing)
    //       equals the post-seam value (q_next − 0), so the ease is MONOTONIC across the
    //       seam — no rewind / backward jitter (a worse felt defect than the chunkiness).
    // Constraints preserved: BL-11 stays GREEN (a non-dragged playing panel tracks the
    // leading edge, now smoothly); PLAY-ONLY; X/TIME-ONLY (resetPriceScale stays false —
    // BL-2b price-axis independence intact). chart.js untouched.
    function _panelPlayFollowLeadingEdgeOffsetX(ch, rs) {
        try {
            if (!rs || typeof rs.getReplayAutoScrollState !== 'function') return NaN;
            var st = rs.getReplayAutoScrollState(ch);
            return (st && Number.isFinite(st.offsetX)) ? st.offsetX : NaN;
        } catch (_) { return NaN; }
    }

    // Continuous eased leading-edge offset (D-041). Pure function of the SHARED replay
    // timestamp: eases the bar-quantized leading edge FORWARD by the forming candle's
    // fractional progress so the viewport scrolls sub-candle (host-parity smooth) and
    // reaches the next bar's quantized offset EXACTLY at the seam (monotonic, no rewind).
    // Falls back to the quantized offset when the fraction can't be derived.
    function _panelPlayFollowContinuousOffsetX(ch, rs) {
        try {
            var q = _panelPlayFollowLeadingEdgeOffsetX(ch, rs);
            if (!Number.isFinite(q)) return NaN;
            var data = Array.isArray(ch.data) ? ch.data : null;
            if (!data || !data.length) return q;
            var lastBarT = Number(data[data.length - 1].t);
            var ts = (rs && Number.isFinite(Number(rs.replayTimestamp)))
                ? Number(rs.replayTimestamp) : NaN;
            if (!Number.isFinite(lastBarT) || !Number.isFinite(ts)) return q;
            var barMs = (typeof ch.parseTimeframe === 'function')
                ? Number(ch.parseTimeframe(ch.currentTimeframe)) : NaN;
            if (!(Number.isFinite(barMs) && barMs > 0)) return q;
            var frac = (ts - lastBarT) / barMs;
            if (!Number.isFinite(frac)) return q;
            if (frac < 0) frac = 0;
            if (frac > 1) frac = 1;
            var spacing = (typeof ch.getCandleSpacing === 'function')
                ? Number(ch.getCandleSpacing()) : NaN;
            if (!(Number.isFinite(spacing) && spacing > 0)) {
                var cw = Number(ch.candleWidth);
                var gap = Number(ch.candleGap);
                spacing = (Number.isFinite(cw) ? cw : 6) + (Number.isFinite(gap) ? gap : 2);
            }
            // offsetX grows MORE NEGATIVE toward the leading edge; ease forward by
            // frac·spacing so frac→1 lands exactly on the next bar's quantized offset.
            return q - frac * spacing;
        } catch (_) { return NaN; }
    }

    function maybePanelPlayViewportFollow(ch) {
        try {
            if (typeof window !== 'undefined'
                && window.__TALARIA_MC_DISABLE_PANEL_PLAY_VIEWPORT_FOLLOW) {
                return;
            }
            if (!ch) return;
            var rs = ch.replaySystem;
            if (!rs || !rs.isActive || typeof rs.syncReplayViewportToPlayhead !== 'function') return;
            // PLAY-ONLY: follow only while a PLAY stream is in effect. The panel-side
            // play signal (pendingPlayDesired / _multichartPassivePlayActive, set from
            // replayFrame {isPlaying:true}) is the same signal BL-10's coarse play-advance
            // branch reacts to, and it is true during production play alongside the host's
            // rs.isPlaying. Paused/scrub frames clear it, so this stays play-only.
            var playing = isParentReplayPlaying()
                || pendingPlayDesired === true
                || ch._multichartPassivePlayActive === true;
            if (!playing) return;
            // Leading-edge disengage contract (matches host): a user-panned / auto-
            // scroll-off panel keeps its own viewport — no snap-back. We gate on these
            // REAL user-intent signals here so we can safely force the recenter below.
            if (rs.userHasPanned || rs.autoScrollEnabled === false) return;
            // BL-12 (D-039) cost guard (default ON). Kill-switch reverts to per-frame.
            var costGuardOn = !(typeof window !== 'undefined'
                && window.__TALARIA_MC_DISABLE_PLAY_FOLLOW_COST_GUARD);
            // Continuous eased offset to apply this frame (D-041). NaN with the guard
            // OFF → the kill-switch restores the raw per-frame quantized follow.
            var easedOffsetX = NaN;
            if (costGuardOn) {
                // (a) SUSPEND during active interaction on THIS panel (drag/pan/zoom).
                if (typeof rs._isUserInteractingWithChart === 'function'
                    && rs._isUserInteractingWithChart(ch)) {
                    return;
                }
                // (b) CONTINUOUS eased leading-edge + DEVICE-PIXEL-COLUMN coalesce
                //     (BL-13 / D-041): the follow target is bar-quantized, so we ease it
                //     sub-candle from the shared playhead timestamp and repaint ONLY when
                //     that eased offset crosses into a NEW device-pixel column. A sub-
                //     pixel / stationary / paused advance stays in the same column → ZERO
                //     renders (the guard still coalesces). Monotonic across the seam.
                //
                //     The coalesce baseline is the LAST APPLIED eased offset we tracked
                //     on the chart — NOT the live ch.offsetX. The per-frame seek re-runs
                //     goToReplayTimestamp/mirror BEFORE this callback and can nudge
                //     ch.offsetX off the eased value between frames; comparing against
                //     the live offset would then re-cross the same pixel column ~twice,
                //     doubling the render count. Tracking the applied eased offset makes
                //     the coalesce a clean 1-render-per-device-pixel-column.
                var target = _panelPlayFollowContinuousOffsetX(ch, rs);
                if (Number.isFinite(target)) {
                    var dpr = (typeof window !== 'undefined'
                        && Number.isFinite(window.devicePixelRatio)
                        && window.devicePixelRatio > 0)
                        ? window.devicePixelRatio
                        : 1;
                    var applied = Number(ch._mcPlayFollowAppliedOffsetX);
                    if (Number.isFinite(applied)
                        && Math.round(target * dpr) === Math.round(applied * dpr)) {
                        // Same device-pixel column as the last applied eased offset →
                        // SUB-PIXEL/stationary advance. Keep offsetX tracking the eased
                        // target (not the stale applied pin) so the next paint/seek does
                        // not jump, but skip a full recenter+render this frame.
                        ch.offsetX = target;
                        return;
                    }
                    easedOffsetX = target;
                }
            }
            // forceRecenter:true is required: syncReplayViewportToPlayhead's own
            // _replayUserOwnsViewport gate treats the ACCUMULATED bug drift (frozen
            // offsetX far from the leading edge) — and a fresh TF-switch anchor lock —
            // as "user owns viewport" and would refuse to follow. We already proved the
            // user did NOT move this panel (userHasPanned false, autoScroll on), so a
            // non-panned playing panel must track the leading edge exactly like host A.
            // resetPriceScale:false keeps X/time-only (BL-2b price-axis independence).
            // Deterministic diagnostic: count every follow render actually issued
            // (past the cost guard's coalesce/suspend). The harness asserts on this
            // counter directly (renders ≈ device-pixel-columns crossed) rather than a
            // noisy total-render subtraction — see H-S19 / H-S19b.
            ch._mcPlayFollowRenders = (ch._mcPlayFollowRenders | 0) + 1;
            // When easing is active, let sync apply the BL-2b-safe forceRecenter (Y-scale
            // skip, offset gating) WITHOUT painting, then override offsetX to the eased
            // sub-candle value and paint ONCE — so the viewport scrolls smoothly instead
            // of snapping to the bar-quantized offset. Guard-off / fallback keeps the
            // single quantized render.
            var applyEase = Number.isFinite(easedOffsetX);
            var applied = rs.syncReplayViewportToPlayhead(ch,
                { forceRecenter: true, resetPriceScale: false, render: !applyEase });
            if (applyEase && applied !== false) {
                ch.offsetX = easedOffsetX;
                if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
                // Record the applied eased offset as the coalesce baseline for the next
                // frame (device-pixel-column comparison above). Use the post-constrain
                // value so any clamp is reflected.
                ch._mcPlayFollowAppliedOffsetX = Number(ch.offsetX);
                ch.renderPending = true;
                if (typeof ch.render === 'function') ch.render();
            }
        } catch (_) {}
    }

    function scheduleCoalescedSeek(ch, ts, ownMasterOnly) {
        global.__talariaBl2bMark && global.__talariaBl2bMark(ch, 'replay-seek', 'panel-cmd-bridge.js:scheduleCoalescedSeek');
        markHostReplayContext(ch);
        if (shouldSkipPausedAlignedReplaySeek(ch, ts)) {
            return;
        }
        if (shouldSkipCoarsePanelHostSwitchSeek(ch, ts)) {
            // BL-5 skip fired — preserve it (do NOT fall through to the seek), but
            // first do a one-shot offsetX-only recenter so the panel doesn't park
            // off-screen (BL-6). See maybeRecenterCoarsePanelAfterHostSwitch.
            maybeRecenterCoarsePanelAfterHostSwitch(ch);
            return;
        }
        coalescedSeekTs = ts;
        // Latch own-master-only for THIS coalesced frame (any own-master-only
        // caller in the frame forces the whole coalesced seek to stay own-master).
        if (ownMasterOnly) coalescedSeekOwnMasterOnly = true;
        if (coalescedSeekScheduled) return;
        coalescedSeekScheduled = true;
        var raf = global.requestAnimationFrame || function (fn) {
            return setTimeout(fn, 16);
        };
        raf(function () {
            coalescedSeekScheduled = false;
            var seekTs = coalescedSeekTs;
            var ownMaster = coalescedSeekOwnMasterOnly;
            coalescedSeekTs = null;
            coalescedSeekOwnMasterOnly = false;
            if (seekTs == null) return;
            if (isViewportSettling(ch)) return;
            // BL-10 (D-037) sync-off host-TF isolation: when ownMaster is set (a
            // same-pair peer FINER than the host's committed DISPLAY cadence — the
            // host switched to a COARSER display TF), the parent-mirror pulls clone
            // the host's TF-switched display master onto the peer
            // (applyParentReplayMirror / applyStaticMirrorFrame →
            // readParentReplayMirrorPayload / _syncReplayMasterFromParentIfCovers /
            // forceSamePairParentDataMirror) — flipping the peer's data cadence +
            // regressing its replay master under an unchanged TF label. Skip both
            // and advance the peer on its OWN master via forceReplaySeek. The
            // COARSER legitimate BL-10 play-advance (peerPlayMustStayOnOwnMaster ==
            // false) keeps the full coalesced mirror path so it still tracks the host.
            if (!ownMaster) {
                // Mid-tick pause/resume: keep partial forming candle (host _savedTickState).
                // During active Play, pass isPlaying=true so mixed-TF peers take the
                // independent anim mirror (shared wall-clock ts) instead of a paused
                // static frame that used to fall into samePairEmbed seek thrash.
                var _mirrorPlaying = isParentReplayPlaying()
                    || pendingPlayDesired === true
                    || (ch && ch._multichartPassivePlayActive === true);
                if (applyParentReplayMirror(ch, seekTs, _mirrorPlaying ? true : false)) {
                    if (!(typeof window !== 'undefined'
                        && window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE)
                        && ch.replaySystem && Number.isFinite(seekTs)) {
                        ch.replaySystem.replayTimestamp = seekTs;
                    }
                    maybePanelPlayViewportFollow(ch); return;
                }
                if (applyStaticMirrorFrame(ch, seekTs)) {
                    if (!(typeof window !== 'undefined'
                        && window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE)
                        && ch.replaySystem && Number.isFinite(seekTs)) {
                        ch.replaySystem.replayTimestamp = seekTs;
                    }
                    maybePanelPlayViewportFollow(ch); return;
                }
            }
            forceReplaySeek(ch, seekTs, false, function () {
                if (!(typeof window !== 'undefined'
                    && window.__TALARIA_MC_DISABLE_FINEST_TF_REPLAY_CADENCE)
                    && ch.replaySystem && Number.isFinite(seekTs)) {
                    ch.replaySystem.replayTimestamp = seekTs;
                }
                maybePanelPlayViewportFollow(ch);
            });
        });
    }

    /**
     * True when this panel's replay playhead is already at (within 2 bars of)
     * the given timestamp. Used to no-op forced re-syncs on panels the user did
     * not touch — re-seeking an already-aligned panel re-slices/renders it and
     * drags its viewport (the drift when a SIBLING panel reloads/switches TF).
     */
    function isPanelReplayAligned(ch, ts) {
        try {
            if (!ch || !ch.replaySystem || !ch.replaySystem.isActive) return false;
            var panelTs = Number(ch.replaySystem.replayTimestamp);
            if (!Number.isFinite(panelTs) || !Number.isFinite(ts)) return false;
            var tfMs = 60000;
            if (typeof ch.parseTimeframe === 'function') {
                tfMs = ch.parseTimeframe(ch.currentTimeframe) || tfMs;
            }
            return Math.abs(panelTs - ts) <= tfMs * 2;
        } catch (_) { return false; }
    }

    /**
     * Hard guard: ensure iframe rawData covers ts, then seek. Panels that
     * loaded a session-start window cannot follow host A without refetch.
     */
    /**
     * Saved-session Play: different-ticker peers often boot with a short
     * `_panelFullRawData` behind the restored host playhead, then park at
     * their loaded edge (TAL-01590 / D-015). Clear catch-up cooldown and
     * eagerly cover the host ts before frames race ahead.
     * Kill-switch: window.__TALARIA_DISABLE_MC_PLAY_EAGER_COVER_V1 = true
     */
    function isPlayEagerCoverEnabled() {
        try {
            return !(typeof window !== 'undefined'
                && window.__TALARIA_DISABLE_MC_PLAY_EAGER_COVER_V1 === true);
        } catch (_) {
            return true;
        }
    }

    function clearIndependentCatchUpCooldown(ch) {
        if (!ch) return;
        try {
            ch._mcCatchUpFails = 0;
            ch._mcCatchUpCooldownUntil = 0;
        } catch (_) {}
    }

    function eagerCoverIndependentOnPlay(ch) {
        if (!ch || !isPlayEagerCoverEnabled()) return;
        if (isSameSymbolAsHost(ch)) return;
        clearIndependentCatchUpCooldown(ch);
        var coverTs = readParentReplayTimestamp();
        var rs = ch.replaySystem;
        if (!Number.isFinite(coverTs) && rs && Number.isFinite(rs.replayTimestamp)) {
            coverTs = rs.replayTimestamp;
        }
        if (!Number.isFinite(coverTs)) return;
        if (typeof ch.ensureReplayDataCoversTimestamp !== 'function') {
            forceReplaySeek(ch, coverTs, false);
            return;
        }
        ch._mcPlayEagerCoverInflight = true;
        ch.ensureReplayDataCoversTimestamp(coverTs).then(function () {
            ch._mcPlayEagerCoverInflight = false;
            if (!pendingPlayDesired) return;
            if (!ch.replaySystem || !ch.replaySystem.isActive) return;
            clearIndependentCatchUpCooldown(ch);
            forceReplaySeek(ch, coverTs, false);
        }).catch(function (e) {
            ch._mcPlayEagerCoverInflight = false;
            warn('eagerCoverIndependentOnPlay failed', e && e.message);
            if (pendingPlayDesired) forceReplaySeek(ch, coverTs, false);
        });
    }

    function forceReplaySeek(ch, ts, isEnter, onDone) {
        global.__talariaBl2bMark && global.__talariaBl2bMark(ch, 'replay-seek', 'panel-cmd-bridge.js:forceReplaySeek');
        markHostReplayContext(ch);
        if (!Number.isFinite(ts)) {
            if (typeof onDone === 'function') onDone();
            return;
        }
        var rs = ch.replaySystem;
        if (!rs) {
            if (typeof onDone === 'function') onDone();
            return;
        }

        // Don't inherit a pre-Play catch-up cooldown into active play — that
        // parks different-ticker tiles after saved-session restore.
        if (pendingPlayDesired && !isSameSymbolAsHost(ch) && isPlayEagerCoverEnabled()) {
            clearIndependentCatchUpCooldown(ch);
        }

        function finish() {
            if (typeof onDone === 'function') onDone();
        }

        function doSeek() {
            if (!rs.isActive) return;
            if (typeof rs.goToReplayTimestamp !== 'function') return;
            try {
                rs.goToReplayTimestamp(ts, {
                    preserveVisibleWindow: false,
                    centerOnCandle: !!isEnter,
                });
            } catch (e) {
                warn('forceReplaySeek: goToReplayTimestamp threw', e && e.message);
            }
            // D-015: multichart shared playhead is wall-clock ts (host broadcast),
            // even when the panel's display TF is coarser than the seek step.
            if (Number.isFinite(ts)) {
                rs.replayTimestamp = ts;
            }
            if (typeof ch._syncIndependentPanelViewportIfNeeded === 'function') {
                try {
                    ch._syncIndependentPanelViewportIfNeeded({
                        resetPriceScale: !!isEnter,
                        render: false,
                    });
                } catch (_) {}
            }
        }

        // Independent ticker: while /bars catch-up is in flight, paint the furthest
        // loaded bar immediately so the fine panel does not hard-freeze mid-play.
        // Do NOT pin host wall-clock ts onto replayTimestamp until cover succeeds —
        // that made the X-axis claim Jul 31 while candles were still Jul 24.
        if (!isEnter && !isSameSymbolAsHost(ch)) {
            try {
                renderFurthestLoadedMirrorFrame(ch, rs, {
                    timestamp: ts,
                    isPlaying: true,
                    tickProgress: 0,
                    tickElapsedMs: 0,
                });
            } catch (_) {}
        }

        // When the caller supplies onDone, that callback owns play-viewport
        // follow (scheduleCoalescedSeek / finer-owner path). Calling follow
        // here AND in onDone double-painted offsetX every frame on mixed-TF
        // Play (stick/flash). No-onDone callers still get follow below.
        var followHere = typeof onDone !== 'function';
        if (typeof ch.ensureReplayDataCoversTimestamp === 'function') {
            ch.ensureReplayDataCoversTimestamp(ts).then(function () {
                doSeek();
                if (isEnter) scheduleMultichartPanelReplayFollow(ch);
                if (followHere) {
                    try { maybePanelPlayViewportFollow(ch); } catch (_) {}
                }
                finish();
            }).catch(function (e) {
                warn('forceReplaySeek: ensureReplayDataCoversTimestamp failed', e && e.message);
                doSeek();
                if (isEnter) scheduleMultichartPanelReplayFollow(ch);
                if (followHere) {
                    try { maybePanelPlayViewportFollow(ch); } catch (_) {}
                }
                finish();
            });
            return;
        }
        doSeek();
        if (isEnter) scheduleMultichartPanelReplayFollow(ch);
        if (followHere) {
            try { maybePanelPlayViewportFollow(ch); } catch (_) {}
        }
        finish();
    }

    /**
     * Multichart iframe: same as clicking the floating #replayFollow button on
     * that tile — replaySystem.scheduleReplayFollowOnceLayoutSettled() when available.
     */
    function scheduleMultichartPanelReplayFollow(ch) {
        if (!ch) return;
        if (typeof ch._mcMountViewportCoalesceFixActive === 'function'
            && ch._mcMountViewportCoalesceFixActive()
            && (ch._mcMountViewportCoalescePending || !ch._mcMountViewportPanelReady)) {
            return;
        }
        if (typeof ch._isMultichartViewportJustReset === 'function'
            && ch._isMultichartViewportJustReset()) {
            return;
        }
        var rs = ch.replaySystem;
        if (!rs || !rs.isActive) return;
        if (typeof rs.scheduleReplayFollowOnceLayoutSettled === 'function') {
            rs.scheduleReplayFollowOnceLayoutSettled();
            return;
        }
        if (typeof rs.enableAutoScroll !== 'function') return;
        var raf = global.requestAnimationFrame || function (fn) {
            return setTimeout(fn, 16);
        };
        raf(function () {
            raf(function () {
                try {
                    rs.enableAutoScroll();
                } catch (e) {
                    warn('multichart replay follow: enableAutoScroll threw', e && e.message);
                }
            });
        });
    }

    function applyReplayEnter(ch, ts) {
        if (!Number.isFinite(ts)) {
            // Caller (e.g. _primeReplayFromParent) sent enter without a
            // timestamp — that means "enter at parent's current ts but
            // we don't know it yet". Use whatever we last stashed; if
            // nothing stashed, this is a no-op (next replayTick will
            // supply the ts).
            ts = pendingReplayTs;
        }
        var rs = ch.replaySystem;
        if (!rs) {
            warn('replayEnter: replaySystem not available on this chart');
            return;
        }
        // Record parent's intent so chartDataLoaded → drainPendingReplay
        // can re-apply it after a subsequent reload (e.g. tf change
        // re-fetch resets isActive and without this we'd exit replay
        // even though the parent is still playing).
        pendingReplayDesired = true;
        // Defer if data isn't loaded yet — install a one-time listener
        // and stash the timestamp. drainPendingReplay() will fire when
        // chartDataLoaded arrives.
        if (!ch.rawData || ch.rawData.length === 0) {
            pendingReplayTs = ts;
            installDataLoadedListener(ch);
            log('replayEnter deferred (rawData empty); pendingReplayTs=' + ts);
            return;
        }
        // Data is loaded. Enter replay if needed, then seek.
        if (!rs.isActive && typeof rs.enterReplayMode === 'function') {
            try {
                // Avoid painting the session-start slice for one frame before
                // goToReplayTimestamp — multichart parents often send loadFile
                // (same file, no-op) + replayEnter in one turn; an immediate
                // updateChartData here made the Y-axis fit the whole wrong window
                // until the next play tick.
                var enterOpts = { startAtBeginning: true };
                if (Number.isFinite(ts)) {
                    enterOpts.suppressInitialUpdateChartData = true;
                }
                rs.enterReplayMode(enterOpts);
            } catch (e) {
                warn('replayEnter: enterReplayMode threw', e && e.message);
            }
        }
        function mirrorHostHistoryIfOlder() {
            if (global && global.__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR) return;
            if (!isSamePairAsHost(ch)) return;
            try {
                var pc = readParentChart();
                if (!pc || !Array.isArray(pc.data) || !pc.data.length) return;
                var parentFirst = Number(pc.data[0] && pc.data[0].t);
                var localFirst = Number(ch.data && ch.data[0] && ch.data[0].t);
                if (!Number.isFinite(parentFirst) || !Number.isFinite(localFirst) || parentFirst >= localFirst) return;
                var mirrorPrependSnapshot = (typeof ch._captureMultichartMirrorPrependSnapshot === 'function')
                    ? ch._captureMultichartMirrorPrependSnapshot(ch.replaySystem)
                    : null;
                ch.rawData = pc.rawData;
                ch.data = pc.data;
                if (pc._serverCursors) ch._serverCursors = Object.assign({}, pc._serverCursors);
                if (Number.isFinite(pc.totalCandles)) ch.totalCandles = pc.totalCandles;
                var prs = pc.replaySystem;
                if (prs && ch.replaySystem && Array.isArray(prs.fullRawData) && prs.fullRawData.length) {
                    ch.replaySystem.fullRawData = prs.fullRawData;
                    ch.replaySystem.rawTimeframe = prs.rawTimeframe || '1m';
                    ch.replaySystem.replayTimestamp = Number.isFinite(Number(ts)) ? Number(ts) : prs.replayTimestamp;
                    if (Number.isFinite(prs.currentIndex)) ch.replaySystem.currentIndex = prs.currentIndex;
                }
                if (typeof ch._applyMultichartMirrorPrependCompensation === 'function') {
                    ch._applyMultichartMirrorPrependCompensation(mirrorPrependSnapshot, { replay: ch.replaySystem });
                }
                if (typeof ch.bumpDataVersion === 'function') ch.bumpDataVersion();
                if (typeof ch.render === 'function') ch.render();
            } catch (_) {}
        }
        if (!(global && global.__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR)
            && isSamePairAsHost(ch)
            && typeof ch._tryExtendReplayMasterFromParent === 'function') {
            try {
                var mirroredHostHistory = ch._tryExtendReplayMasterFromParent({ lite: false });
                if (!mirroredHostHistory) {
                    mirroredHostHistory = forceSamePairParentDataMirror(ch, { timestamp: ts, isPlaying: false });
                }
                if (mirroredHostHistory
                    && ch._multichartPendingMasterResample
                    && typeof ch._flushMultichartPendingMasterResample === 'function') {
                    ch._flushMultichartPendingMasterResample();
                }
            } catch (_) {}
        }
        if (rs.isActive && Number.isFinite(ts)) {
            forceReplaySeek(ch, ts, true, function () {
                if (!(global && global.__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR)
                    && isSamePairAsHost(ch)) {
                    try { forceSamePairParentDataMirror(ch, { timestamp: ts, isPlaying: false }); } catch (_) {}
                    mirrorHostHistoryIfOlder();
                    var mirrorAttempts = 0;
                    var mirrorTimer = setInterval(function () {
                        mirrorAttempts++;
                        if (global && global.__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR) {
                            clearInterval(mirrorTimer);
                            return;
                        }
                        try { forceSamePairParentDataMirror(ch, { timestamp: ts, isPlaying: false }); } catch (_) {}
                        mirrorHostHistoryIfOlder();
                        if (mirrorAttempts >= 30) clearInterval(mirrorTimer);
                    }, 180);
                }
                pendingReplayTs = null;
                try { drainPendingPlay(ch); } catch (_) {}
                if (pendingPlayDesired) {
                    try { eagerCoverIndependentOnPlay(ch); } catch (_) {}
                }
            });
        } else {
            scheduleMultichartPanelReplayFollow(ch);
            pendingReplayTs = null;
            try { drainPendingPlay(ch); } catch (_) {}
            if (pendingPlayDesired) {
                try { eagerCoverIndependentOnPlay(ch); } catch (_) {}
            }
        }
        log('replayEnter applied: ts=' + ts
            + ' isActive=' + rs.isActive
            + ' chartDataLen=' + (ch.data ? ch.data.length : 0));
    }

    function drainPendingReplay() {
        var ch = global.chart;
        if (!ch || !ch.rawData || ch.rawData.length === 0) {
            log('drainPendingReplay bailed (rawData still empty)');
            return;
        }
        // Reconcile actual replay state against parent's stored
        // intent. Three cases:
        //   (a) parent wants replay active (pendingReplayDesired=true)
        //       → enter (or re-seek if already entered).
        //   (b) parent wants replay OFF (pendingReplayDesired=false)
        //       → exit if currently active. This catches the
        //       "user exited replay before splitting" scenario where
        //       autoLoadBacktestingData auto-entered replay on the
        //       iframe but the parent is showing the full slice.
        //   (c) parent has no opinion yet (null) → leave whatever
        //       autoLoad set, parent will broadcast on its next state
        //       change.
        if (pendingReplayDesired === false) {
            var rsX = ch.replaySystem;
            if (rsX && rsX.isActive
                && typeof rsX.exitReplayMode === 'function') {
                log('drainPendingReplay: parent wants OUT, calling exitReplayMode');
                try { rsX.exitReplayMode(); }
                catch (e) { warn('drainPendingReplay: exitReplayMode threw', e && e.message); }
            }
            return;
        }
        if (pendingReplayDesired !== true) return;
        if (pendingReplayTs == null) return;
        var ts = pendingReplayTs;
        log('drainPendingReplay firing: ts=' + ts
            + ' rawDataLen=' + ch.rawData.length);
        // Delegate to applyReplayEnter so all activation logic
        // (enterReplayMode, goToReplayTimestamp) runs in exactly
        // one place.
        applyReplayEnter(ch, ts);
    }

    // Apply any stashed play/speed/mode intent. Called from
    // applyReplayEnter immediately after the iframe finishes its
    // first activation, and from the replayPlay/replayPause
    // handlers as a safety net.
    function drainPendingPlay(ch) {
        if (!ch) ch = global.chart;
        if (!ch) return;
        var rs = ch.replaySystem;
        if (!rs || !rs.isActive) return;
        // Multichart iframe: parent tile A runs the only play loop and
        // streams replayFrame/replayTick. Never start a local loop here —
        // independent loops drift on speed + tick animation.
        if (isMultichartIframePanel()) {
            if (pendingPlayDesired === false && rs.isPlaying
                && typeof rs.pause === 'function') {
                try { rs.pause(); } catch (_) {}
            } else if (pendingPlayDesired === true && rs.isPlaying) {
                try {
                    if (typeof rs.stopTickAnimation === 'function') rs.stopTickAnimation();
                    if (typeof rs.pause === 'function') rs.pause();
                } catch (_) {}
            }
            return;
        }
        // Apply speed first so the loop boots at the right rate.
        if (Number.isFinite(pendingPlaySpeed)
            && typeof rs.setSpeed === 'function') {
            try { rs.setSpeed(pendingPlaySpeed); }
            catch (e) { warn('drainPendingPlay: setSpeed threw', e && e.message); }
        }
        if (typeof pendingPlayMode === 'string'
            && typeof rs.setPlaybackMode === 'function') {
            try { rs.setPlaybackMode(pendingPlayMode, { restartPlayback: false }); }
            catch (e) { warn('drainPendingPlay: setPlaybackMode threw', e && e.message); }
        }
        // Then play/pause to match parent's intent. Skip no-op
        // transitions so we don't call play() twice (which would
        // cancel-then-restart the tick loop).
        if (pendingPlayDesired === true && !rs.isPlaying
            && typeof rs.play === 'function') {
            try { rs.play(); }
            catch (e) { warn('drainPendingPlay: play threw', e && e.message); }
        } else if (pendingPlayDesired === false && rs.isPlaying
            && typeof rs.pause === 'function') {
            try { rs.pause(); }
            catch (e) { warn('drainPendingPlay: pause threw', e && e.message); }
        }
    }

    function installDataLoadedListener(ch) {
        if (dataLoadedListenerInstalled) return;
        dataLoadedListenerInstalled = true;
        global.addEventListener('chartDataLoaded', function () {
            // Defer to next tick so chart.js finishes its post-load
            // bookkeeping (rawData index rebuild, lastBarMs cache, etc.)
            // before replay re-enters. This avoids fighting chart.js's
            // own initial render pass.
            setTimeout(drainPendingReplay, 0);
        });
        // Also attempt one more flush AFTER a short delay, in case
        // chartDataLoaded already fired before we attached the
        // listener (race when applyCommand resolves on the same
        // microtask as the first chartDataLoaded dispatch).
        setTimeout(drainPendingReplay, 250);
    }

    function applyMirroredPendingSnapshot(ch, snap) {
        var om = ch && ch.orderManager;
        if (!om || !snap || snap.id == null) return false;
        var id = snap.id;
        var hit = false;
        function mergeInto(list) {
            if (!list || !list.forEach) return;
            list.forEach(function (o) {
                if (!o || o.id !== id) return;
                Object.keys(snap).forEach(function (k) {
                    if (k === 'id') return;
                    try { o[k] = snap[k]; } catch (_e) {}
                });
                hit = true;
            });
        }
        mergeInto(om.pendingOrders);
        mergeInto(om.orders);
        var svc = om.orderService;
        if (svc) {
            mergeInto(svc.pendingOrders);
            mergeInto(svc.orders);
        }
        return hit;
    }

    function seriesExtent(series) {
        if (!Array.isArray(series) || series.length === 0) return null;
        var first = Number(series[0] && series[0].t);
        var last = Number(series[series.length - 1] && series[series.length - 1].t);
        if (!Number.isFinite(first) || !Number.isFinite(last)) return null;
        return { first: first, last: last, length: series.length };
    }

    function sameTfHostWindowExtentDiffers(ch, tf) {
        try {
            if (!ch || typeof ch._isMultichartEmbedPanel !== 'function' || !ch._isMultichartEmbedPanel()) {
                return false;
            }
            var pc = (global.parent && global.parent !== global) ? global.parent.chart : null;
            if (!pc) return false;
            var hostFid = pc.currentFileId != null ? String(pc.currentFileId) : '';
            var panelFid = ch.currentFileId != null ? String(ch.currentFileId) : '';
            if (!hostFid || !panelFid || hostFid !== panelFid) return false;
            if (String(pc.currentTimeframe || '').toLowerCase().trim() !== tf) return false;
            var host = seriesExtent(pc.rawData);
            var panel = seriesExtent(ch.rawData);
            if (!host || !panel) return false;
            return host.first !== panel.first
                || host.last !== panel.last
                || Math.abs(host.length - panel.length) > 2;
        } catch (_) {
            return false;
        }
    }

    // Apply a single command. Returns a promise that resolves on success
    // or rejects on failure (we surface either via reportResult).
    function applyCommand(cmd, args) {
        return waitForChart(5000).then(function (ch) {
            chartInstance = ch;
            // Lazy install of the order eventBus forwarder. Done here
            // (rather than at module load) because chart.orderManager.
            // orderService isn't constructed until chart.js finishes
            // booting. The first applyCommand to land has the chart
            // ready; subsequent calls early-return via the
            // panelOrderState.busSubscribed guard.
            try { installOrderForwarders(ch); } catch (_) {}
            args = args || {};
            switch (cmd) {

                // ─── timeframe ─────────────────────────────────────────
                case 'setTimeframe': {
                    // A setTimeframe panel-cmd is only broadcast by the host fan-out
                    // when Interval sync is ON (see MultichartGrid.jsx timeframeChanged
                    // effect). Any other path here is a direct/manual pick on this panel.
                    // Track which one this is so applyReplayFrame knows whether it's safe
                    // to mirror host TF on every frame. A manual pick leaves the flag as-is.
                    if (args.__fromHostFanout === true) ch._mcIntervalSyncOn = true;
                    var tf = String(args.tf || '').trim().toLowerCase();
                    if (!tf) throw new Error('setTimeframe: missing args.tf');
                    if (typeof ch.setTimeframe !== 'function') {
                        throw new Error('chart.setTimeframe is not a function');
                    }
                    var nativeTf = String(ch._nativeRawFetchTf || ch.currentTimeframe || '')
                        .toLowerCase().trim();
                    // Idempotency: skip only if the committed bars really have this TF's
                    // cadence — never skip on label match alone, or a panel left holding
                    // coarse (e.g. daily) bars would stay wrong after picking 5m.
                    var barsMatchTf = (typeof ch._committedBarsMatchTimeframe !== 'function')
                        || ch._committedBarsMatchTimeframe(tf);
                    if (ch.currentTimeframe === tf && nativeTf === tf
                        && Array.isArray(ch.data) && ch.data.length > 0
                        && !ch._timeframeSwitching
                        && barsMatchTf) {
                        var shouldRemirrorSameTf = args.__fromHostFanout === true
                            && !global.__TALARIA_MC_DISABLE_SAMETF_REMIRROR
                            && typeof ch._multichartMirrorHostTfSwitchIfReady === 'function'
                            && sameTfHostWindowExtentDiffers(ch, tf);
                        if (shouldRemirrorSameTf) {
                            try {
                                if (ch._multichartMirrorHostTfSwitchIfReady(tf, { fromHostFanout: true })) {
                                    setTimeout(function () {
                                        try { scheduleMultichartPanelReplayFollow(ch); } catch (_) {}
                                    }, 0);
                                    return;
                                }
                            } catch (_) {}
                        } else {
                            return;
                        }
                        // Host extent changed but the mirror declined; fall through to normal handling.
                    }
                    // Multichart backtest: refetch window must anchor on host A's
                    // replay playhead (same as panel A's _refetchBacktestTimeframe).
                    try {
                        var parentPcTf = (global.parent && global.parent !== global)
                            ? global.parent.chart : null;
                        var prsTf = parentPcTf && parentPcTf.replaySystem;
                        if (ch.isBacktestMode && ch.replaySystem && ch.replaySystem.isActive
                            && prsTf && prsTf.isActive
                            && Number.isFinite(Number(prsTf.replayTimestamp))) {
                            ch.replaySystem.replayTimestamp = Number(prsTf.replayTimestamp);
                        }
                        if (typeof ch._warmBtTfCacheFromParent === 'function') {
                            ch._warmBtTfCacheFromParent(tf);
                        }
                        if (typeof ch._multichartMirrorHostTfSwitchIfReady === 'function'
                            && ch._multichartMirrorHostTfSwitchIfReady(tf, { fromHostFanout: args.__fromHostFanout === true })) {
                            setTimeout(function () {
                                try { scheduleMultichartPanelReplayFollow(ch); } catch (_) {}
                            }, 0);
                            return;
                        }
                    } catch (_) {}
                    // H-S6 ownership fix: a host-originated same-pair TF fan-out used
                    // to race the host's own switch. B/C/D saw the command while A was
                    // still fetching/committing 1h, so mirror/cache paths missed and each
                    // panel fell into chart.setTimeframe -> server fetch. Wait for the
                    // host's committed TF frame, then use the existing mirror path. Kill
                    // switch defaults OFF (fix ON).
                    if (args.__fromHostFanout === true
                        && !(global && global.__TALARIA_MC_DISABLE_HOST_TF_MIRROR_WAIT)
                        && typeof ch._isIndependentMultichartPair === 'function'
                        && !ch._isIndependentMultichartPair()
                        && typeof ch._multichartMirrorHostTfSwitchIfReady === 'function') {
                        var mirrorWaitStarted = Date.now();
                        var mirrorWaitMaxMs = 5000;
                        var tryMirrorAfterHost = function () {
                            try {
                                if (typeof ch._warmBtTfCacheFromParent === 'function') {
                                    ch._warmBtTfCacheFromParent(tf);
                                }
                                if (ch._multichartMirrorHostTfSwitchIfReady(tf, { fromHostFanout: true })) {
                                    setTimeout(function () {
                                        try { scheduleMultichartPanelReplayFollow(ch); } catch (_) {}
                                    }, 0);
                                    return;
                                }
                                var hostForMirror = readParentChart();
                                var hostTf = hostForMirror ? String(hostForMirror.currentTimeframe || '').toLowerCase().trim() : '';
                                var hostBusy = !!(hostForMirror && (
                                    hostForMirror._timeframeSwitching
                                    || hostForMirror._switchingToTimeframe
                                    || hostForMirror._pairSwitchLoading
                                    || hostTf !== tf
                                ));
                                if (hostBusy && Date.now() - mirrorWaitStarted < mirrorWaitMaxMs) {
                                    setTimeout(tryMirrorAfterHost, 60);
                                    return;
                                }
                            } catch (_) {}
                            var delayedSw = ch.setTimeframe(tf);
                            if (delayedSw && typeof delayedSw.then === 'function') {
                                delayedSw.then(function () {
                                    try { scheduleMultichartPanelReplayFollow(ch); } catch (_) {}
                                }).catch(function (e) {
                                    warn('setTimeframe async failed', e && e.message);
                                });
                            } else {
                                setTimeout(function () {
                                    try { scheduleMultichartPanelReplayFollow(ch); } catch (_) {}
                                }, 0);
                            }
                        };
                        setTimeout(tryMirrorAfterHost, 60);
                        return;
                    }
                    var sw = ch.setTimeframe(tf);
                    if (sw && typeof sw.then === 'function') {
                        sw.then(function () {
                            try { scheduleMultichartPanelReplayFollow(ch); } catch (_) {}
                        }).catch(function (e) {
                            warn('setTimeframe async failed', e && e.message);
                        });
                        return;
                    }
                    setTimeout(function () {
                        try { scheduleMultichartPanelReplayFollow(ch); } catch (_) {}
                    }, 0);
                    return;
                }

                // ─── file / dataset switch ─────────────────────────────
                case 'loadFile': {
                    var fileId = args.fileId;
                    if (fileId === undefined || fileId === null || fileId === '') {
                        throw new Error('loadFile: missing args.fileId');
                    }
                    if (typeof ch.loadFileData !== 'function'
                        && typeof ch.loadMultichartPanelFromHost !== 'function'
                        && typeof ch.loadMultichartPanelFile !== 'function') {
                        throw new Error('chart.loadFileData is not a function');
                    }
                    var fidStr = String(fileId);
                    mirrorParentBacktestSession(ch);
                    var switchingPair = String(ch.currentFileId || '') !== fidStr;
                    // Idempotency guard: when the parent fans out symbol
                    // sync to every panel, each panel echoes chart-state
                    // back; without this, the echo would re-trigger
                    // loadFileData on every panel and loop. Same trick
                    // setTimeframe uses above. User-initiated picks pass force:true.
                    if (!args.force && !switchingPair && panelHasLoadedFile(ch, fidStr)) {
                        try { drainPendingReplay(); } catch (_idr) {}
                        reseedReplayFromChart(ch);
                        setTimeout(function () {
                            try { scheduleMultichartPanelReplayFollow(ch); } catch (_sf) {}
                        }, 0);
                        return;
                    }
                    if (switchingPair || args.force) {
                        clearReplayBufferForPairSwitch(ch);
                    }
                    ch._multichartPairLoadInFlight = true;
                    var primedPlayheadTs = primeIframeReplayPlayheadFromParent(ch);
                    var useMcLoader = shouldUseMultichartPanelLoader(ch);
                    var loadPromise;
                    if (useMcLoader) {
                        if (typeof ch.loadMultichartPanelFile === 'function') {
                            loadPromise = ch.loadMultichartPanelFile(fidStr, {
                                force: !!args.force,
                                replayTimestamp: primedPlayheadTs,
                                timeframe: ch.currentTimeframe,
                            });
                        } else {
                            loadPromise = ch.loadMultichartPanelFromHost({
                                fileId: fidStr,
                                force: !!args.force,
                                replayTimestamp: primedPlayheadTs,
                                timeframe: ch.currentTimeframe,
                            });
                        }
                    } else {
                        loadPromise = ch.loadFileData(fidStr);
                    }
                    if (loadPromise && typeof loadPromise.then === 'function') {
                        return loadPromise.then(function () {
                            ch._multichartPairLoadInFlight = false;
                            afterLoadFile(ch, useMcLoader);
                        }).catch(function (e) {
                            ch._multichartPairLoadInFlight = false;
                            warn('loadFile: load failed', e && e.message);
                            throw e;
                        });
                    }
                    ch._multichartPairLoadInFlight = false;
                    afterLoadFile(ch, useMcLoader);
                    return;
                }

                // ─── drawing tool select / clear ───────────────────────
                //
                // Parent's left rail picks a tool (Trend Line, Fib, …)
                // and resolves it to a chart.js legacy id (e.g. 'trendline',
                // 'fibretracement'). Routing it here means each panel can
                // be in a different drawing mode at once — Panel A is
                // armed for trend lines while Panel B has cursor active.
                case 'setActiveDrawingTool': {
                    var dm = ch.drawingManager;
                    if (!dm) throw new Error('drawingManager not available');
                    var tool = args.tool ? String(args.tool) : null;
                    if (!tool) {
                        if (typeof dm.clearTool === 'function') dm.clearTool();
                        else dm.currentTool = null;
                        return;
                    }
                    if (typeof dm.setTool !== 'function') {
                        throw new Error('drawingManager.setTool is not a function');
                    }
                    if (dm.currentTool !== tool) dm.setTool(tool);
                    return;
                }
                case 'clearActiveDrawingTool': {
                    dismissActiveDrawingTool(ch.drawingManager, !!(args && args.mirrored), args);
                    return;
                }
                case 'deleteSelectedDrawings': {
                    if (!multichartPanelKeyboardV1EnabledInEmbed()) return;
                    var dmd = ch.drawingManager;
                    if (!dmd) return;
                    var toDelete = Array.isArray(dmd.selectedDrawings)
                        ? dmd.selectedDrawings.slice()
                        : [];
                    if (toDelete.length === 0 && dmd.selectedDrawing) {
                        toDelete.push(dmd.selectedDrawing);
                    }
                    toDelete.forEach(function (drawing) {
                        if (drawing && typeof dmd.deleteDrawing === 'function') {
                            dmd.deleteDrawing(drawing);
                        }
                    });
                    return;
                }
                case 'setChartCursorType': {
                    var ct = args.cursorType ? String(args.cursorType) : 'cross';
                    var skipSync = !!(args && args.skipSync);
                    if (typeof ch.setCursorType !== 'function') {
                        throw new Error('chart.setCursorType is not a function');
                    }
                    ch.setCursorType(ct, skipSync);
                    return;
                }
                case 'setChartType': {
                    var chartTypeVal = args.chartType ? String(args.chartType) : null;
                    if (!chartTypeVal) throw new Error('setChartType: missing args.chartType');
                    if (!ch.chartSettings) ch.chartSettings = {};
                    if (ch.chartSettings.chartType === chartTypeVal) return;
                    ch.chartSettings.chartType = chartTypeVal;
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_rCt) {}
                    if (typeof ch.saveSettings === 'function') {
                        try { ch.saveSettings(); } catch (_sCt) {}
                    }
                    return;
                }

                // ─── indicators ────────────────────────────────────────
                //
                // Per-panel indicator add/remove. Parent maintains a
                // panelId → (v9Id → chartId) map and this command
                // returns the freshly assigned chartId so the parent
                // can later issue removeIndicator without guessing.
                case 'addIndicator': {
                    var indType = String(args.type || '').trim();
                    if (!indType) throw new Error('addIndicator: missing args.type');
                    if (typeof ch.addIndicator !== 'function') {
                        throw new Error('chart.addIndicator is not a function');
                    }
                    if (!ch.data || ch.data.length === 0) {
                        // chart.js's addIndicator alerts and bails when data is empty;
                        // surface the failure cleanly so the parent can retry.
                        throw new Error('chart data not loaded yet');
                    }
                    if (ch._timeframeSwitching || ch._pairSwitchLoading) {
                        throw new Error('chart timeframe switch in progress');
                    }
                    var wantType = String(indType).toLowerCase();
                    if (ch.indicators && Array.isArray(ch.indicators.active)) {
                        var existing = ch.indicators.active.find(function (i) {
                            return i && String(i.type || '').toLowerCase() === wantType;
                        });
                        if (existing && existing.id) {
                            return { chartId: existing.id, type: indType, deduped: true };
                        }
                    }
                    // Carry settings when cloning the host: params + style are
                    // merged exactly like chart.js _applyPersistedIndicators so a
                    // duplicated panel matches the host's configuration.
                    var indParams = Object.assign({}, args.params || {}, args.style || {});
                    var ind = Object.keys(indParams).length
                        ? ch.addIndicator(indType, indParams)
                        : ch.addIndicator(indType);
                    if (ind && args.visible === false) ind.visible = false;
                    if (ind && args.visibility && typeof args.visibility === 'object') {
                        try { ind.visibility = JSON.parse(JSON.stringify(args.visibility)); }
                        catch (_) { ind.visibility = args.visibility; }
                    }
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    try { if (typeof ch.recalculateIndicators === 'function') ch.recalculateIndicators(); } catch (_) {}
                    try { if (typeof ch.updateOHLCIndicators === 'function') ch.updateOHLCIndicators(); } catch (_) {}
                    return { chartId: (ind && ind.id) ? ind.id : null, type: indType };
                }
                case 'addCompareSymbol': {
                    var cmpFid = args.fileId;
                    if (cmpFid === undefined || cmpFid === null || cmpFid === '') {
                        throw new Error('addCompareSymbol: missing args.fileId');
                    }
                    if (!ch.compareOverlay || typeof ch.compareOverlay.addSymbolWithMode !== 'function') {
                        throw new Error('chart.compareOverlay is not available');
                    }
                    if (!ch.data || ch.data.length === 0) {
                        throw new Error('chart data not loaded yet');
                    }
                    var cmpSym = args.symbol != null ? String(args.symbol).trim() : '';
                    var cmpMode = args.mode ? String(args.mode) : 'same-scale';
                    return Promise.resolve(ch.compareOverlay.addSymbolWithMode(cmpFid, cmpSym, cmpMode))
                        .then(function () { return { ok: true }; });
                }
                case 'removeIndicator': {
                    var indId = args.chartId;
                    if (indId === undefined || indId === null || indId === '') {
                        throw new Error('removeIndicator: missing args.chartId');
                    }
                    if (typeof ch.removeIndicator !== 'function') {
                        throw new Error('chart.removeIndicator is not a function');
                    }
                    ch.removeIndicator(indId);
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    try { if (typeof ch.updateOHLCIndicators === 'function') ch.updateOHLCIndicators(); } catch (_) {}
                    return;
                }
                // List the panel's currently-mounted indicators. Used by
                // the parent on focus change to mirror the toolbar chips.
                case 'getIndicators': {
                    var list = (ch.indicators && Array.isArray(ch.indicators.active))
                        ? ch.indicators.active
                        : [];
                    var items = list.map(function (i) {
                        var out = { id: i.id, type: i.type || i.name || null };
                        if (i.params) out.params = Object.assign({}, i.params);
                        if (i.style) out.style = Object.assign({}, i.style);
                        out.visible = i.visible !== false;
                        if (i.visibility && typeof i.visibility === 'object') {
                            try { out.visibility = JSON.parse(JSON.stringify(i.visibility)); } catch (_) {}
                        }
                        return out;
                    });
                    return { indicators: items };
                }
                case 'setVisibilityMenuState': {
                    var visState = (args && args.state) || {};
                    var visSilent = !!(args && args.silent);
                    if (typeof ch.applyVisibilityMenuState === 'function') {
                        ch.applyVisibilityMenuState(visState, { silent: visSilent });
                    }
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    return;
                }
                case 'clearOnlyDrawings': {
                    if (typeof ch.clearOnlyDrawings === 'function') {
                        ch.clearOnlyDrawings({ confirmPrompt: false, skipBroadcast: true });
                    } else if (ch.drawingManager && typeof ch.drawingManager.clearDrawings === 'function') {
                        ch.drawingManager.clearDrawings({ confirmPrompt: false, skipBroadcast: true });
                    }
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    return;
                }
                case 'reloadDrawings': {
                    const dm = ch.drawingManager;
                    if (dm && typeof dm.reloadDrawingsFromStorage === 'function') {
                        if (args && args.sessionId) {
                            try { ch.activeTradingSessionId = String(args.sessionId); } catch (_) {}
                        }
                        const loadedSession = typeof ch.getActiveTradingSessionId === 'function'
                            ? (ch.getActiveTradingSessionId() || '')
                            : '';
                        return Promise.resolve(dm.reloadDrawingsFromStorage({ force: true }))
                            .then(() => {
                                try { ch._lastLoadedDrawingsSessionId = loadedSession; } catch (_) {}
                                try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                            });
                    }
                    return;
                }
                case 'clearOnlyIndicators': {
                    if (typeof ch.clearOnlyIndicators === 'function') {
                        ch.clearOnlyIndicators({ confirmPrompt: false });
                    }
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    return;
                }
                case 'closeDrawingSettings': {
                    var dmSet = ch.drawingManager;
                    var hadModal = false;
                    try { hadModal = !!document.querySelector('.tv-settings-modal'); } catch (_) {}
                    if (dmSet) {
                        if (hadModal && dmSet.settingsPanel && typeof dmSet.settingsPanel.hide === 'function') {
                            dmSet.settingsPanel.hide();
                        }
                        if (dmSet.contextMenu && typeof dmSet.contextMenu.hide === 'function') {
                            dmSet.contextMenu.hide();
                        }
                    }
                    if (hadModal) {
                        try {
                            document.querySelectorAll('.tv-settings-modal').forEach(function (el) {
                                try {
                                    if (el.externalDropdowns) {
                                        el.externalDropdowns.forEach(function (d) { try { d.remove(); } catch (_) {} });
                                    }
                                    el.remove();
                                } catch (_) {}
                            });
                        } catch (_) {}
                    }
                    return;
                }
                case 'deselectDrawings': {
                    var dmDes = ch.drawingManager;
                    if (!dmDes) return;
                    if (typeof dmDes.deselectAll === 'function') {
                        dmDes.deselectAll({ forSelectionChange: true });
                    } else {
                        dmDes.selectedDrawing = null;
                        if (Array.isArray(dmDes.selectedDrawings)) dmDes.selectedDrawings = [];
                        if (dmDes.toolbar && typeof dmDes.toolbar.hide === 'function') {
                            dmDes.toolbar.hide();
                        }
                        if (dmDes.settingsPanel && typeof dmDes.settingsPanel.hide === 'function') {
                            dmDes.settingsPanel.hide();
                        }
                    }
                    try {
                        if (typeof ch._syncMultichartViewportFromHost === 'function') {
                            ch._syncMultichartViewportFromHost();
                        } else {
                            if (typeof ch._realignMultichartViewportAfterResize === 'function') {
                                ch._realignMultichartViewportAfterResize(ch.w, ch.h);
                            }
                            if (typeof ch.render === 'function') ch.render();
                        }
                    } catch (_) {}
                    return;
                }
                case 'clearDrawingsAndIndicators': {
                    if (typeof ch.clearDrawingsAndIndicators === 'function') {
                        ch.clearDrawingsAndIndicators({ confirmPrompt: false, skipBroadcast: true });
                    } else {
                        if (typeof ch.clearOnlyDrawings === 'function') {
                            ch.clearOnlyDrawings({ confirmPrompt: false, skipBroadcast: true });
                        } else if (ch.drawingManager && typeof ch.drawingManager.clearDrawings === 'function') {
                            ch.drawingManager.clearDrawings({ confirmPrompt: false, skipBroadcast: true });
                        }
                        if (typeof ch.clearOnlyIndicators === 'function') {
                            ch.clearOnlyIndicators({ confirmPrompt: false });
                        }
                    }
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    return;
                }
                case 'getOrderPanelPriceSnapshot': {
                    var omSnap = ch.orderManager;
                    if (!omSnap || typeof omSnap.getCurrentCandle !== 'function') {
                        throw new Error('orderManager.getCurrentCandle is not a function');
                    }
                    var cnd = omSnap.getCurrentCandle();
                    if (!cnd) return { close: null, formatted: null };
                    var closePx = Number.parseFloat(cnd.c != null ? cnd.c : cnd.close);
                    if (!Number.isFinite(closePx)) return { close: null, formatted: null };
                    var fmt = typeof omSnap.formatPrice === 'function'
                        ? omSnap.formatPrice(closePx)
                        : String(closePx);
                    return { close: closePx, formatted: fmt };
                }

                // ─── V9 chart UI settings (theme, TZ, precision, …) ────
                //
                // Parent shell broadcasts the same snapshot to every
                // multichart iframe so all tiles match the host's Settings
                // panel. Uses window.talariaApplyV9ThemeSettings (installed
                // by TalariaV8bLive) then mirrors into React state via a
                // document CustomEvent (iframe chrome is hidden but state
                // stays consistent for any future UI).
                case 'applyV9UiSettings': {
                    var sSet = args.settings;
                    if (!sSet || typeof sSet !== 'object') {
                        throw new Error('applyV9UiSettings: missing args.settings');
                    }
                    try {
                        if (typeof global.talariaApplyV9ThemeSettings === 'function') {
                            global.talariaApplyV9ThemeSettings(sSet);
                        }
                    } catch (eTh) {
                        warn('applyV9UiSettings: talariaApplyV9ThemeSettings threw', eTh && eTh.message);
                    }
                    try {
                        global.dispatchEvent(new CustomEvent('talariaV9ApplyExternalSettings', { detail: sSet }));
                    } catch (_eEv) { /* noop */ }
                    return;
                }

                // T1 step 14 — parent posts authoritative V9-panel-embed flag on bridge-ready.
                case 'setV9PanelEmbed': {
                    if (!v9QuickBarPanelEmbedFixEnabled() || args.embed === false) {
                        clearV9PanelEmbedFlag();
                        return;
                    }
                    killLegacyDrawingToolbarForV9PanelEmbed(ch);
                    return;
                }

                // Host calendar/filter change → repaint time-axis news flags on this tile.
                case 'redrawEconomicNewsMarkers': {
                    var ef = args.filters;
                    if (ef && typeof ef === 'object') {
                        try {
                            var uiMir = global.__economicCalendarUi;
                            if (uiMir && typeof uiMir.applyMirroredFilters === 'function') {
                                uiMir.applyMirroredFilters(ef);
                            } else {
                                global.__multichartMirroredNewsFilters = ef;
                            }
                        } catch (_eMir) {}
                    }
                    if (ch && typeof ch.scheduleRender === 'function') {
                        ch.scheduleRender();
                    }
                    return;
                }

                // ─── replay sync ───────────────────────────────────────
                //
                // Parent broadcasts the host's replay state so every
                // iframe panel slides its candle slice to the same
                // virtual time. The iframe's own replaySystem is the
                // mechanism (it owns updateChartData → resampleData →
                // render), but its toolbar UI is hidden by the
                // multichart shim ([data-v9-chrome="1"]) so only the
                // parent's toolbar drives play/pause/seek.
                //
                // Parent → iframe protocol:
                //   replayEnter { timestamp }
                //     Activate replaySystem at the given virtual time.
                //     Iframe calls enterReplayMode (if not already
                //     active) then goToReplayTimestamp to align.
                //   replayTick  { timestamp }
                //     Live tick during play / seek. Iframe seeks to
                //     the new timestamp; if not yet active it lazily
                //     enters first (handles "iframe added mid-replay"
                //     race where panel-cmd-ready arrives between the
                //     parent's enter and the next tick).
                //   replayExit
                //     Parent exited replay (user clicked exit, or
                //     loaded a new dataset). Iframe exits too so its
                //     candle slice returns to the full file.
                //
                // Idempotency:
                //   • enterReplayMode early-returns when isActive=true.
                //   • goToReplayTimestamp is cheap and idempotent for
                //     the same timestamp.
                //   • exitReplayMode early-returns when !isActive.
                case 'syncFromHost': {
                    ch._mcIntervalSyncOn = !!args.syncTimeframe;
                    var pcSync = null;
                    try {
                        pcSync = (global.parent && global.parent !== global)
                            ? global.parent.chart : null;
                    } catch (_) {}
                    if (!pcSync) return;
                    var syncTs = null;
                    if (pcSync.replaySystem && pcSync.replaySystem.isActive) {
                        syncTs = Number(pcSync.replaySystem.replayTimestamp);
                    }
                    // Interval sync ON → mirror host A's TF. OFF → keep this panel's TF.
                    var syncTf = args.syncTimeframe
                        ? (pcSync.currentTimeframe || ch.currentTimeframe)
                        : (ch.currentTimeframe || pcSync.currentTimeframe);
                    if (args.syncTimeframe && syncTf && ch.currentTimeframe !== syncTf
                        && typeof ch.setTimeframe === 'function') {
                        try { ch.setTimeframe(syncTf); } catch (_) {}
                    }
                    var afterReplaySync = function () {
                        if (Number.isFinite(syncTs)) {
                            try { drainPendingPlay(ch); } catch (_) {}
                        }
                    };
                    var alignReplayFromHost = function () {
                        if (!args.syncSymbol) {
                            if (!Number.isFinite(syncTs)) return;
                            // Already on this playhead and NOT viewport-synced → leave the
                            // panel exactly where it is. Re-mirroring/seeking here is what
                            // makes an untouched panel re-render + drift when a sibling
                            // reloads (its data-ready toggle re-primes every panel).
                            if (!ch._multichartVisibleRangeSyncOn && isPanelReplayAligned(ch, syncTs)) {
                                afterReplaySync();
                                return;
                            }
                            if (isSamePairAsHost(ch)
                                && forceSamePairParentDataMirror(ch, { timestamp: syncTs, isPlaying: false })) {
                                afterReplaySync();
                                return;
                            }
                            if (!ch.replaySystem || !ch.replaySystem.isActive) {
                                applyReplayEnter(ch, syncTs);
                                return;
                            }
                            forceReplaySeek(ch, syncTs, !!args.force);
                            return;
                        }
                    };
                    // Empty iframe: kick multichart host-clone load (async) — reply immediately.
                    if ((!ch.rawData || ch.rawData.length === 0)
                        && !ch._multichartPairLoadInFlight) {
                        var bootFid = pcSync.currentFileId;
                        if (bootFid != null && bootFid !== '') {
                            runSyncFromHostLoadDetached(ch, String(bootFid), syncTs, function () {
                                try { drainPendingReplay(); } catch (_) {}
                                alignReplayFromHost();
                            });
                            return;
                        }
                    }
                    // Symbol sync OFF: align replay playhead only — never stamp host fileId
                    // onto this tile once bars are loaded (user may have GBP on B while A stays EUR/USD).
                    if (!args.syncSymbol) {
                        alignReplayFromHost();
                        return;
                    }
                    var syncFid = pcSync.currentFileId;
                    if (syncFid == null || syncFid === '') {
                        if (Number.isFinite(syncTs)) applyReplayEnter(ch, syncTs);
                        return;
                    }
                    var syncFidStr = String(syncFid);
                    if (String(ch.currentFileId || '') === syncFidStr && ch.rawData
                        && ch.rawData.length > 0) {
                        if (isSamePairAsHost(ch) && Number.isFinite(syncTs)) {
                            if (forceSamePairParentDataMirror(ch, { timestamp: syncTs, isPlaying: false })) {
                                afterReplaySync();
                                return;
                            }
                        }
                        if (Number.isFinite(syncTs)) {
                            if (!ch.replaySystem || !ch.replaySystem.isActive) {
                                applyReplayEnter(ch, syncTs);
                                afterReplaySync();
                                return;
                            }
                            forceReplaySeek(ch, syncTs, false);
                        }
                        return;
                    }
                    runSyncFromHostLoadDetached(ch, syncFidStr, syncTs, afterReplaySync);
                    return;
                }
                case 'extendReplayMasterFromHost': {
                    if (typeof ch._multichartSamePairAsHost !== 'function'
                        || !ch._multichartSamePairAsHost(ch.currentFileId)) {
                        return;
                    }
                    if (typeof ch._tryExtendReplayMasterFromParent !== 'function') return;
                    var liteExtend = !!(args && args.lite);
                    var didExtend = false;
                    try {
                        didExtend = !!ch._tryExtendReplayMasterFromParent({ lite: liteExtend });
                    } catch (_) {}
                    if (!(global && global.__TALARIA_MC_DISABLE_HOST_HISTORY_GROWTH_MIRROR)) {
                        try {
                            didExtend = !!forceSamePairParentDataMirror(ch, { timestamp: readParentReplayTimestamp(), isPlaying: false }) || didExtend;
                        } catch (_) {}
                    }
                    if (!didExtend) return;
                    if (ch._multichartPendingMasterResample
                        && typeof ch._flushMultichartPendingMasterResample === 'function') {
                        try { ch._flushMultichartPendingMasterResample(); } catch (_) {}
                    } else if (!liteExtend && typeof ch._syncIndicatorsAfterMultichartDataShare === 'function') {
                        try { ch._syncIndicatorsAfterMultichartDataShare(); } catch (_) {}
                    }
                    if (typeof ch.scheduleRender === 'function') {
                        ch.scheduleRender();
                    } else if (typeof ch.render === 'function') {
                        ch.render();
                    }
                    return { extended: true };
                }
                case 'syncReplayFromHost': {
                    if (ch._multichartPairLoadInFlight) return;
                    if (isViewportSettling(ch)) return;
                    // Parent streams replayFrame every animation tick while playing;
                    // forceReplaySeek here fights the mirror renderer and desyncs tick animation.
                    if (isParentReplayPlaying()) return;
                    var pcReplay = null;
                    try {
                        pcReplay = (global.parent && global.parent !== global)
                            ? global.parent.chart : null;
                    } catch (_) {}
                    if (!pcReplay || !pcReplay.replaySystem || !pcReplay.replaySystem.isActive) return;
                    var hostTs = Number(pcReplay.replaySystem.replayTimestamp);
                    if (!Number.isFinite(hostTs)) return;
                    if (!ch.replaySystem || !ch.replaySystem.isActive) {
                        return applyReplayEnter(ch, hostTs);
                    }
                    var panelTfMs = 60000;
                    if (typeof ch.parseTimeframe === 'function') {
                        panelTfMs = ch.parseTimeframe(ch.currentTimeframe) || panelTfMs;
                    }
                    var panelTs = Number(ch.replaySystem.replayTimestamp);
                    var replayAligned = Number.isFinite(panelTs)
                        && Math.abs(panelTs - hostTs) <= panelTfMs * 2;
                    // Aligned + paused: leave the panel's viewport exactly where the
                    // user (or sync) put it — do NOT recenter on the playhead. This
                    // restores the known-good behavior at commit 8d1751f. The
                    // `_syncIndependentPanelViewportIfNeeded` recenter added afterwards
                    // is what made the panel snap back to the middle every 800ms.
                    // Already aligned: skip unless the caller forced AND this panel is
                    // viewport-synced to the host. A forced align on an INDEPENDENT
                    // (non-viewport-synced) panel would re-mirror the host and drift a
                    // panel the user never touched — so honor `force` only when sync is on.
                    if (replayAligned && (!args.force || !ch._multichartVisibleRangeSyncOn)) return;
                    // Same render path as the play-time frame stream — avoids
                    // goToReplayTimestamp viewport jumps when playhead drifted while paused.
                    if (applyStaticMirrorFrame(ch, hostTs)) return;
                    return forceReplaySeek(ch, hostTs, false);
                }
                case 'replayEnter': {
                    var tsE = Number(args.timestamp);
                    // First-time activation MUST run synchronously so
                    // enterReplayMode + first seek complete before any
                    // tick stream arrives. After this, ticks coalesce
                    // via scheduleCoalescedSeek (see replayTick below).
                    return applyReplayEnter(ch, tsE);
                }
                case 'rollbackPickStart': {
                    installRollbackPick(ch);
                    return;
                }
                case 'rollbackPickStop': {
                    teardownRollbackPick();
                    return;
                }
                case 'replayCut': {
                    var tsCut = Number(args.timestamp);
                    if (!Number.isFinite(tsCut)) return;
                    pendingPlayDesired = false;
                    pendingReplayTs = null;
                    var rsCut = ch.replaySystem;
                    if (rsCut) {
                        rsCut.isPlaying = false;
                        rsCut._savedTickState = null;
                        rsCut.animatingCandle = null;
                        rsCut.tickProgress = 0;
                        rsCut.tickElapsedMs = 0;
                        if (typeof rsCut.pause === 'function') {
                            try { rsCut.pause(); } catch (_) {}
                        }
                    }
                    if (typeof ch.applyMultichartReplayCut === 'function') {
                        ch.applyMultichartReplayCut(tsCut, args.orderCutoff);
                    } else if (rsCut && typeof rsCut.goToReplayTimestamp === 'function') {
                        forceReplaySeek(ch, tsCut, false);
                    }
                    return;
                }
                case 'replayTick': {
                    var ts2 = Number(args.timestamp);
                    if (!Number.isFinite(ts2)) return;
                    if (isViewportSettling(ch)) return;
                    // Defer to chartDataLoaded if rawData isn't in yet
                    // — otherwise applyReplayEnter handles everything.
                    if (!ch.rawData || ch.rawData.length === 0) {
                        return applyReplayEnter(ch, ts2);
                    }
                    var rsT = ch.replaySystem;
                    // Lazy enter: if iframe missed the initial
                    // replayEnter (e.g. added mid-replay), enter now
                    // synchronously, then start coalescing.
                    if (!rsT || !rsT.isActive) {
                        return applyReplayEnter(ch, ts2);
                    }
                    // Passive iframe: parent streams replayFrame during play.
                    if (isMultichartIframePanel() && pendingPlayDesired === true) {
                        return;
                    }
                    // ─── ALWAYS seek to parent's position ───────────
                    pendingReplayTs = ts2;
                    scheduleCoalescedSeek(ch, ts2);
                    if (orderMcPnlHubV1EnabledBridge()) {
                        try {
                            window.parent.postMessage({
                                type: 'order-pnl-tick',
                                panelId: panelId,
                                symbol: ch.currentSymbol || '',
                                timestamp: ts2,
                            }, '*');
                        } catch (_pnlHub) { /* ignore */ }
                    }
                    return;
                }
                case 'replayExit': {
                    // Drop any queued enter — parent left replay before
                    // we got around to applying it.
                    pendingReplayTs = null;
                    pendingReplayDesired = false;
                    pendingPlayDesired = null;
                    if (ch) ch._mcPassivePlayPausedOnce = false;
                    // Make sure chartDataLoaded re-applies the exit if
                    // a later autoLoad / tf-change re-enters replay
                    // automatically. Without this listener, the iframe
                    // would silently re-enter replay after a tf change
                    // even though the parent wants it out.
                    installDataLoadedListener(ch);
                    var rs3 = ch.replaySystem;
                    if (rs3 && rs3.isActive
                        && typeof rs3.exitReplayMode === 'function') {
                        try { rs3.exitReplayMode(); }
                        catch (e) { warn('replayExit: exitReplayMode threw', e && e.message); }
                    }
                    return;
                }

                // ─── replay PLAYBACK sync ──────────────────────────────
                //
                // PASSIVE MIRROR (multichart iframe): parent tile A is the
                // only play loop. Parent broadcasts replayMultichartFrame on
                // every animation tick; iframes apply applyReplayFrame and
                // never call play() locally.
                //
                // Protocol:
                //   replayPlay {speed, mode} — stash intent; do NOT play locally
                //   replayPause — pause local loop if any + final replayTick
                //   replayFrame {timestamp, currentIndex, animatedCandle?}
                //     mirror parent chart slice + forming candle each frame
                //   replayTick {timestamp} — seek on pause/scrub (not during play)
                case 'replayFrame': {
                    return applyReplayFrame(ch, args);
                }
                case 'replayPlay': {
                    // Always stash intent first so a deferred apply
                    // (via drainPendingPlay on activation) lands the
                    // right state even if iframe isn't ready yet.
                    pendingPlayDesired = true;
                    if (Number.isFinite(args.speed)) pendingPlaySpeed = args.speed;
                    if (typeof args.mode === 'string') pendingPlayMode = args.mode;
                    var rsP = ch.replaySystem;
                    if (!rsP) {
                        warn('replayPlay: replaySystem not available');
                        return;
                    }
                    ch._multichartPassivePlayActive = true;
                    ensurePanelReplaySeries(ch);
                    // Different ticker + saved playhead: cover host ts before
                    // play frames park the peer at a short master edge.
                    try { eagerCoverIndependentOnPlay(ch); } catch (_eagerPlay) {}
                    if (!rsP.isActive) {
                        log('replayPlay stashed (not yet active)');
                        return;
                    }
                    // Match host play(): only re-enable follow when the user has NOT
                    // manually panned this tile. Never wipe userHasPanned here — that
                    // was what made B/C/D snap to the playhead three times (sync +
                    // local mirror + host replayFrame) instead of starting from where
                    // they already were.
                    if (!rsP.userHasPanned) {
                        rsP.autoScrollEnabled = true;
                    }
                    // Playback must not stay blocked by boot viewport hold.
                    try {
                        if (typeof window !== 'undefined') {
                            window.__multichartBootRevealAfter = 0;
                        }
                        ch._multichartViewportSettleUntil = 0;
                        ch._multichartPreserveViewportUntil = rsP.userHasPanned
                            ? (performance.now() + 900)
                            : 0;
                    } catch (_) {}
                    // Prime one mirror frame so B/C/D start with host immediately.
                    try {
                        var playPayload = readParentReplayMirrorPayload();
                        if (!playPayload) {
                            var playTs = readParentReplayTimestamp();
                            if (Number.isFinite(playTs)) {
                                playPayload = {
                                    timestamp: playTs,
                                    isPlaying: true,
                                    tickProgress: 0,
                                    tickElapsedMs: 0,
                                    hostFileId: readParentHostFileId(),
                                };
                            }
                        } else {
                            playPayload.isPlaying = true;
                        }
                        if (playPayload && typeof rsP.applyMultichartMirrorFrame === 'function') {
                            var prevOx = ch.offsetX;
                            var prevCw = ch.candleWidth;
                            var hadPan = !!rsP.userHasPanned;
                            var prevAuto = rsP.autoScrollEnabled;
                            if (hadPan) rsP.autoScrollEnabled = false;
                            if (rsP.applyMultichartMirrorFrame(playPayload)) {
                                if (hadPan) {
                                    if (Number.isFinite(prevOx)) ch.offsetX = prevOx;
                                    if (Number.isFinite(prevCw) && prevCw > 0) ch.candleWidth = prevCw;
                                }
                                rsP.autoScrollEnabled = prevAuto;
                                if (typeof ch.constrainOffset === 'function') ch.constrainOffset();
                                if (typeof ch.render === 'function') ch.render();
                            } else {
                                rsP.autoScrollEnabled = prevAuto;
                            }
                        }
                    } catch (_primePlay) { /* ignore */ }
                    drainPendingPlay(ch);
                    return;
                }
                case 'replayPause': {
                    pendingPlayDesired = false;
                    ch._multichartPassivePlayActive = false;
                    ch._mcPassivePlayPausedOnce = false;
                    var rsPa = ch.replaySystem;
                    if (!rsPa || !rsPa.isActive) return;
                    // Freeze at host's partial tick (same frozen candle as tile A).
                    if (!applyParentReplayMirror(ch, readParentReplayTimestamp(), false)) {
                        forceSamePairParentDataMirror(ch, null);
                    }
                    drainPendingPlay(ch);
                    return;
                }
                case 'replaySetSpeed': {
                    if (Number.isFinite(args.speed)) pendingPlaySpeed = args.speed;
                    var rsS = ch.replaySystem;
                    if (!rsS || typeof rsS.setSpeed !== 'function') return;
                    if (!Number.isFinite(args.speed)) return;
                    try { rsS.setSpeed(args.speed); }
                    catch (e) { warn('replaySetSpeed threw', e && e.message); }
                    return;
                }
                case 'replaySetMode': {
                    if (typeof args.mode === 'string') pendingPlayMode = args.mode;
                    var rsM = ch.replaySystem;
                    if (!rsM || typeof rsM.setPlaybackMode !== 'function') return;
                    if (typeof args.mode !== 'string') return;
                    try {
                        // restartPlayback:true so a mid-play mode
                        // change immediately re-arms the right loop.
                        rsM.setPlaybackMode(args.mode,
                            { restartPlayback: true });
                    } catch (e) {
                        warn('replaySetMode threw', e && e.message);
                    }
                    return;
                }
                // Candle-by-candle step size (V9 "INTERVAL" in replay bar).
                // Host sets this via setStepTimeframe; without a mirror, iframes
                // read empty #replayTimeframe / wrong DOM and advance one raw bar
                // per tick while the host steps by 1m/5m — different speed + axis.
                case 'replaySetStepTf': {
                    var rsTf = ch.replaySystem;
                    if (!rsTf || typeof rsTf.setStepTimeframe !== 'function') return;
                    try {
                        rsTf.setStepTimeframe(args.tf === undefined ? null : args.tf);
                    } catch (e) {
                        warn('replaySetStepTf threw', e && e.message);
                    }
                    return;
                }

                // ─── orders ────────────────────────────────────────────
                //
                // PROTOCOL:
                //   placeOrder { side, type, quantity, entryPrice,
                //                slEnabled, slPrice, tpEnabled, tpPrice }
                //     Iframe writes the args into ITS OWN hidden order
                //     panel DOM (#orderQuantity, #orderEntryPrice,
                //     #enableTP / #tpPrice, #enableSL / #slPrice,
                //     #buyTab / #sellTab) and then calls
                //     chart.orderManager.placeAdvancedOrder({
                //       keepPanelOpen: true
                //     }).
                //
                //     Why drive through the iframe's DOM + the manager's
                //     full submit path instead of building the order
                //     object directly: placeAdvancedOrder also handles
                //     tick-grid snap, risk validation, breakeven /
                //     trailing / multi-TP / multi-entry, the
                //     post-place persistRuntimeOrderState push, and
                //     rendering. Re-implementing all that here would
                //     drift from the canonical path. The DOM in the
                //     iframe is hidden by [data-v9-chrome="1"] but the
                //     elements still exist and accept input/checked
                //     writes.
                //
                //   addOrder { order, kind }
                //     A peer panel placed an order (or the host did),
                //     and the broadcaster wants this iframe to also
                //     show it. kind is 'opened' for open positions,
                //     'pending' for pending limit/stop orders. We
                //     register on this iframe's orderService so the
                //     line drawer + PnL columns pick it up. Guarded
                //     with `_suppressNextEmit` so the resulting
                //     order:opened / order:pending eventBus emit
                //     doesn't get re-broadcast back to the source
                //     (otherwise: A places → broadcasts to B → B
                //     registers → B's bus fires → B forwards to
                //     parent → parent broadcasts to A → loop).
                //
                //   closeOrder    { orderId }    → closePosition
                //   cancelOrder   { orderId }    → cancelPendingOrder
                case 'getReplayReady': {
                    var rsReady = ch.replaySystem;
                    var candleReady = false;
                    try {
                        if (rsReady && rsReady.isActive && rsReady.animatingCandle) {
                            var ac = Number.parseFloat(
                                rsReady.animatingCandle.close ?? rsReady.animatingCandle.c
                            );
                            if (Number.isFinite(ac)) candleReady = true;
                        }
                        if (!candleReady && Array.isArray(ch.rawData) && ch.rawData.length > 0) {
                            var rb = ch.rawData[ch.rawData.length - 1];
                            var rc = Number.parseFloat(rb && (rb.c ?? rb.close));
                            if (Number.isFinite(rc)) candleReady = true;
                        }
                        if (!candleReady && Array.isArray(ch.data) && ch.data.length > 0) {
                            var db = ch.data[ch.data.length - 1];
                            var dc = Number.parseFloat(db && (db.c ?? db.close));
                            if (Number.isFinite(dc)) candleReady = true;
                        }
                    } catch (_cr) { /* ignore */ }
                    return {
                        replayActive: !!(rsReady && rsReady.isActive),
                        candleReady: candleReady,
                        replayTimestamp: rsReady && Number.isFinite(Number(rsReady.replayTimestamp))
                            ? Number(rsReady.replayTimestamp)
                            : null,
                    };
                }
                case 'getOrderTradeSnapshot': {
                    var omSnap = ch.orderManager;
                    if (!omSnap) return { panelId: panelId, openPositions: [], pendingOrders: [] };
                    return {
                        panelId: panelId,
                        openPositions: cloneOrderList(omSnap.openPositions),
                        pendingOrders: cloneOrderList(omSnap.pendingOrders),
                        unrealizedPnL: Number.parseFloat(omSnap.unrealizedPnL) || 0,
                        replayTimestamp: ch.replaySystem && Number.isFinite(Number(ch.replaySystem.replayTimestamp))
                            ? Number(ch.replaySystem.replayTimestamp)
                            : null,
                    };
                }
                case 'applyOrderSnapshot': {
                    if (!orderMcSnapshotProjectionV1EnabledBridge()) {
                        return { skipped: true, reason: 'snapshot_projection_off' };
                    }
                    return applyOrderSnapshotProjection(ch, args && args.snapshot);
                }
                case 'placeOrder': {
                    if (orderMcHostPlaceV1EnabledBridge()) {
                        throw new Error('placeOrder blocked: host-canonical placement active (A6-4)');
                    }
                    var om = ch.orderManager;
                    if (!om) throw new Error('orderManager not available');
                    if (typeof om.placeAdvancedOrder !== 'function') {
                        throw new Error('orderManager.placeAdvancedOrder is not a function');
                    }
                    var doc = global.document;
                    function setVal(id, v) {
                        var el = doc.getElementById(id);
                        if (!el) return;
                        el.value = (v == null) ? '' : String(v);
                        try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
                        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                    }
                    function setChk(id, v) {
                        var el = doc.getElementById(id);
                        if (!el) return;
                        el.checked = !!v;
                        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                    }
                    // 1) Side (BUY / SELL) — set the manager state
                    // directly AND toggle the tab classes so any read
                    // path that checks the active class still sees the
                    // right side.
                    var side = (args.side === 'SELL') ? 'SELL' : 'BUY';
                    om.orderSide = side;
                    var bt = doc.getElementById('buyTab');
                    var st = doc.getElementById('sellTab');
                    if (bt) bt.classList.toggle('active', side === 'BUY');
                    if (st) st.classList.toggle('active', side === 'SELL');

                    // 2) Order type — toggle .active on the matching
                    // .order-type-btn[data-type="…"] element so any
                    // legacy read of that selector lands on the right
                    // type. order-manager doesn't expose a setter
                    // pair this clean — it relies on the user clicking
                    // the button — but the button's active class is
                    // what placeAdvancedOrder branches on internally.
                    var ot = (args.type === 'limit' || args.type === 'stop')
                        ? args.type
                        : 'market';
                    var typeBtns = doc.querySelectorAll('#orderPanel .order-type-btn');
                    if (typeBtns && typeBtns.forEach) {
                        typeBtns.forEach(function (b) {
                            b.classList.toggle('active', b.getAttribute('data-type') === ot);
                        });
                    }

                    // 3) Numeric inputs.
                    if (args.quantity != null)   setVal('orderQuantity',   args.quantity);
                    if (args.entryPrice != null) setVal('orderEntryPrice', args.entryPrice);
                    setChk('enableTP', !!args.tpEnabled);
                    if (args.tpPrice != null)    setVal('tpPrice', args.tpPrice);
                    setChk('enableSL', !!args.slEnabled);
                    if (args.slPrice != null)    setVal('slPrice', args.slPrice);

                    // 4) Submit. placeAdvancedOrder will alert+return
                    // when replaySystem isn't active — surface that as
                    // a thrown error so the parent sees cmd-result.ok=false.
                    if (!ch.replaySystem || !ch.replaySystem.isActive) {
                        throw new Error('iframe replay not active — cannot place order');
                    }
                    try {
                        om.placeAdvancedOrder({ keepPanelOpen: true });
                    } catch (e) {
                        warn('placeOrder: placeAdvancedOrder threw', e && e.message);
                        throw e;
                    }
                    // The newly-placed order id (if any) — we read
                    // back from the most recent push. Best-effort:
                    // the eventBus subscription below is the
                    // authoritative source for cross-panel mirror.
                    var arr = (om.orders && om.orders.length) ? om.orders : [];
                    var newest = arr.length ? arr[arr.length - 1] : null;
                    return { orderId: newest ? newest.id : null };
                }
                case 'addOrder': {
                    if (orderMcSnapshotProjectionV1EnabledBridge()) {
                        throw new Error('addOrder blocked: host snapshot projection active (A6-4)');
                    }
                    var om2 = ch.orderManager;
                    if (!om2) throw new Error('orderManager not available');
                    var svc = om2.orderService;
                    if (!svc) throw new Error('orderService not available');
                    var ord = args && args.order;
                    if (!ord || typeof ord !== 'object') {
                        throw new Error('addOrder: missing args.order');
                    }
                    var kind = (args.kind === 'pending') ? 'pending' : 'opened';
                    // De-dupe: if we already have this order id, skip.
                    if (orderIdExistsInOm(om2, ord && ord.id)) {
                        return { skipped: true, reason: 'duplicate' };
                    }
                    // Loop guard: tag the id so our own eventBus
                    // forwarder skips re-broadcasting THIS register.
                    panelOrderState.suppressEmitId = ord.id;
                    try {
                        if (kind === 'pending') {
                            if (typeof svc.registerPendingOrder === 'function') {
                                svc.registerPendingOrder(ord);
                            }
                        } else {
                            if (typeof svc.registerOpenOrder === 'function') {
                                svc.registerOpenOrder(ord);
                            }
                        }
                    } finally {
                        // Defer clear by a microtask so the synchronous
                        // emit inside register* sees the suppress id.
                        setTimeout(function () {
                            if (panelOrderState.suppressEmitId === ord.id) {
                                panelOrderState.suppressEmitId = null;
                            }
                        }, 0);
                    }
                    if (kind === 'pending' && typeof om2.scheduleRefreshPendingOrderGraphicsForChart === 'function') {
                        om2.scheduleRefreshPendingOrderGraphicsForChart(ord, ch);
                    } else if (kind === 'pending' && typeof om2.refreshPendingOrderGraphicsForChart === 'function') {
                        om2.refreshPendingOrderGraphicsForChart(ord, ch);
                    } else if (kind === 'opened') {
                        // Mirrored open positions only hit orderService.registerOpenOrder above.
                        // updateOrderLines() moves existing DOM — it does not create SL/TP/entry layers.
                        try {
                            var symOk = true;
                            if (typeof om2._positionTickerMatchesChartSymbol === 'function') {
                                symOk = !!om2._positionTickerMatchesChartSymbol(ord, ch);
                            }
                            if (symOk) {
                                if (typeof om2.drawOrderLine === 'function') om2.drawOrderLine(ord, ch);
                                if (typeof om2.drawSLTPLines === 'function') om2.drawSLTPLines(ord, ch);
                                if (typeof om2.drawEntryMarker === 'function') om2.drawEntryMarker(ord, ch);
                            }
                        } catch (eOpen) {
                            warn('addOrder: opened line draw threw', eOpen && eOpen.message);
                        }
                        try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                        try {
                            if (om2.updateOrderLines) om2.updateOrderLines(ch);
                        } catch (_) {}
                    } else {
                        try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                        try {
                            if (om2.updateOrderLines) om2.updateOrderLines(ch);
                        } catch (_) {}
                    }
                    return { ok: true };
                }
                case 'syncPendingOrder': {
                    var snapS = args && args.order;
                    if (!snapS || typeof snapS !== 'object' || snapS.id == null) {
                        throw new Error('syncPendingOrder: missing args.order');
                    }
                    if (!applyMirroredPendingSnapshot(ch, snapS)) {
                        return { skipped: true, reason: 'no_local_pending' };
                    }
                    var omSnap = ch.orderManager;
                    var po = null;
                    if (omSnap && omSnap.pendingOrders) {
                        po = omSnap.pendingOrders.find(function (o) { return o && o.id === snapS.id; });
                    }
                    if (!po && omSnap && omSnap.orderService && omSnap.orderService.pendingOrders) {
                        po = omSnap.orderService.pendingOrders.find(function (o) { return o && o.id === snapS.id; });
                    }
                    if (po && typeof omSnap.scheduleRefreshPendingOrderGraphicsForChart === 'function') {
                        omSnap.scheduleRefreshPendingOrderGraphicsForChart(po, ch);
                    } else if (po && typeof omSnap.refreshPendingOrderGraphicsForChart === 'function') {
                        omSnap.refreshPendingOrderGraphicsForChart(po, ch);
                    } else {
                        try { if (typeof ch.render === 'function') ch.render(); } catch (_e) {}
                        try {
                            if (omSnap && typeof omSnap.updateOrderLines === 'function') {
                                omSnap.updateOrderLines(ch);
                            }
                        } catch (_e2) {}
                    }
                    return { ok: true };
                }
                case 'removeMirroredOrder': {
                    var omRm = ch.orderManager;
                    if (!omRm || typeof omRm.multichartRemoveMirroredOrderClone !== 'function') {
                        throw new Error('orderManager.multichartRemoveMirroredOrderClone is not a function');
                    }
                    if (args.orderId == null) {
                        throw new Error('removeMirroredOrder: missing args.orderId');
                    }
                    omRm.multichartRemoveMirroredOrderClone(args.orderId);
                    return { ok: true };
                }
                case 'clearDraftPreview': {
                    var omPv = ch.orderManager;
                    if (!omPv || typeof omPv.removePreviewLines !== 'function') {
                        throw new Error('orderManager.removePreviewLines is not a function');
                    }
                    omPv.removePreviewLines({ multichartSkipBroadcast: true });
                    try { global.__talariaMultichartDraftActive = false; } catch (_) {}
                    return { ok: true };
                }
                // setDraftPreview {
                //   side, type, entryPrice, slEnabled, slPrice, tpEnabled, tpPrice,
                //   isMultiEntryMode, multiEntryLevels[], multipleTPEnabled, tpTargets[]
                // }
                //
                // Parent's React rail forwards every entry/SL/TP/side/type change so
                // this iframe's orderManager mirrors the draft preview line on its
                // own chart. Without this, the preview only appeared on the host
                // chart even when the user had focused panel B (different symbol).
                //
                // Multi-entry / multi-TP must travel with the same command: host OM
                // already has E2/E3 + TP2/TP3 from the React rail, but peers only
                // saw single-leg fields and drew one Entry/SL/TP.
                //
                // We write into the iframe's hidden #orderPanel inputs (so all the
                // existing read-paths in updatePreviewLines stay unchanged) and flip
                // __talariaMultichartDraftActive so updatePreviewLines won't bail on
                // the missing `.visible` class (multichart hides V9 chrome).
                //
                // Kill-switch: window.__TALARIA_DISABLE_MC_MULTI_DRAFT_V1 = true
                case 'setDraftPreview': {
                    var omSet = ch.orderManager;
                    if (!omSet || typeof omSet.updatePreviewLines !== 'function') {
                        throw new Error('orderManager.updatePreviewLines is not a function');
                    }
                    var docSet = global.document;
                    function setValSet(id, v) {
                        var el = docSet.getElementById(id);
                        if (!el) return;
                        var nv = (v == null) ? '' : String(v);
                        if (el.value !== nv) el.value = nv;
                        try { el.dispatchEvent(new Event('input',  { bubbles: true })); } catch (_) {}
                        try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                    }
                    function setChkSet(id, v) {
                        var el = docSet.getElementById(id);
                        if (!el) return;
                        if (el.checked !== !!v) {
                            el.checked = !!v;
                            try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (_) {}
                        }
                    }
                    var multiDraftOk = true;
                    try { multiDraftOk = global.__TALARIA_DISABLE_MC_MULTI_DRAFT_V1 !== true; } catch (_) {}
                    var sideSet = (args.side === 'SELL') ? 'SELL' : 'BUY';
                    omSet.orderSide = sideSet;
                    var btSet = docSet.getElementById('buyTab');
                    var stSet = docSet.getElementById('sellTab');
                    if (btSet) btSet.classList.toggle('active', sideSet === 'BUY');
                    if (stSet) stSet.classList.toggle('active', sideSet === 'SELL');
                    var otSet = (args.type === 'limit' || args.type === 'stop') ? args.type : 'market';
                    omSet.orderType = otSet;
                    var typeBtnsSet = docSet.querySelectorAll('#orderPanel .order-type-btn');
                    if (typeBtnsSet && typeBtnsSet.forEach) {
                        typeBtnsSet.forEach(function (b) {
                            b.classList.toggle('active', b.getAttribute('data-type') === otSet);
                        });
                    }
                    if (args.entryPrice != null) setValSet('orderEntryPrice', args.entryPrice);
                    if (args.entryPrice != null && typeof omSet._markPreviewEntryDecoupledFromRiskRewardIfNeeded === 'function'
                        && omSet._previewEntrySource !== 'riskReward' && !omSet._previewEntryLinkedToRiskReward) {
                        omSet._markPreviewEntryDecoupledFromRiskRewardIfNeeded();
                    }
                    setChkSet('enableSL', !!args.slEnabled);
                    if (args.slPrice != null)   setValSet('slPrice', args.slPrice);
                    setChkSet('enableTP', !!args.tpEnabled);
                    if (args.tpPrice != null)   setValSet('tpPrice', args.tpPrice);
                    var slPxSet = parseFloat(docSet.getElementById('slPrice')?.value || 0);
                    var tpPxSet = parseFloat(docSet.getElementById('tpPrice')?.value || 0);
                    if (!(slPxSet > 0)) omSet.slManuallyPositioned = false;
                    if (!(tpPxSet > 0)) omSet.tpManuallyPositioned = false;

                    // Hydrate multi-entry / multi-TP before the final preview paint.
                    if (multiDraftOk && (args.isMultiEntryMode != null || Array.isArray(args.multiEntryLevels))) {
                        var levelsIn = Array.isArray(args.multiEntryLevels) ? args.multiEntryLevels : [];
                        var wantMultiEntry = !!args.isMultiEntryMode && levelsIn.length > 1;
                        if (wantMultiEntry) {
                            omSet.multiEntryLevels = levelsIn.map(function (l, i) {
                                return {
                                    id: (l && l.id != null) ? l.id : (i + 1),
                                    price: Number(l && l.price) || 0,
                                    amount: Number(l && l.amount) || 0,
                                };
                            });
                            if (!omSet.isMultiEntryMode && typeof omSet.setEntryMode === 'function') {
                                try { omSet.setEntryMode(true); } catch (_) {}
                            } else {
                                try { if (typeof omSet.renderMultiEntryRows === 'function') omSet.renderMultiEntryRows(); } catch (_) {}
                                try { if (typeof omSet.updateMultiEntrySummary === 'function') omSet.updateMultiEntrySummary(); } catch (_) {}
                                try { if (typeof omSet.syncMultiEntryToSplitEntries === 'function') omSet.syncMultiEntryToSplitEntries(); } catch (_) {}
                            }
                        } else if (omSet.isMultiEntryMode && typeof omSet.setEntryMode === 'function') {
                            try { omSet.setEntryMode(false); } catch (_) {}
                        }
                    }
                    if (multiDraftOk && (args.multipleTPEnabled != null || Array.isArray(args.tpTargets))) {
                        var tpsIn = Array.isArray(args.tpTargets) ? args.tpTargets : [];
                        var wantMultiTp = !!args.multipleTPEnabled && tpsIn.length > 1;
                        if (wantMultiTp) {
                            // Toggle may call initializeTPTargets via change — overwrite after.
                            setChkSet('multipleTPToggle', true);
                            if (args.tpDistributionMode) omSet.tpDistributionMode = args.tpDistributionMode;
                            omSet.tpTargets = tpsIn.map(function (t, i) {
                                return {
                                    id: (t && t.id != null) ? t.id : (i + 1),
                                    price: Number(t && t.price) || 0,
                                    percentage: Number(t && t.percentage) || 0,
                                    distributionMode: (t && t.distributionMode) || omSet.tpDistributionMode || 'percent',
                                    originalValue: (t && t.originalValue != null)
                                        ? Number(t.originalValue)
                                        : (Number(t && t.percentage) || 0),
                                };
                            });
                            try { if (typeof omSet.renderTPTargets === 'function') omSet.renderTPTargets(); } catch (_) {}
                        } else {
                            setChkSet('multipleTPToggle', false);
                            omSet.tpTargets = [];
                            try { if (typeof omSet.renderTPTargets === 'function') omSet.renderTPTargets(); } catch (_) {}
                        }
                    }

                    try { global.__talariaMultichartDraftActive = true; } catch (_) {}
                    try { omSet.updatePreviewLines(); } catch (e) {
                        warn('setDraftPreview: updatePreviewLines threw', e && e.message);
                    }
                    return { ok: true };
                }
                case 'closeOrder': {
                    var omC = ch.orderManager;
                    if (!omC) throw new Error('orderManager not available');
                    if (typeof omC.closePosition !== 'function') {
                        throw new Error('orderManager.closePosition is not a function');
                    }
                    if (args.orderId == null) {
                        throw new Error('closeOrder: missing args.orderId');
                    }
                    panelOrderState.suppressEmitId = args.orderId;
                    try {
                        omC.closePosition(args.orderId);
                    } finally {
                        setTimeout(function () {
                            if (panelOrderState.suppressEmitId === args.orderId) {
                                panelOrderState.suppressEmitId = null;
                            }
                        }, 0);
                    }
                    return { ok: true };
                }
                case 'cancelOrder': {
                    var omX = ch.orderManager;
                    if (!omX) throw new Error('orderManager not available');
                    if (typeof omX.cancelPendingOrder !== 'function') {
                        throw new Error('orderManager.cancelPendingOrder is not a function');
                    }
                    if (args.orderId == null) {
                        throw new Error('cancelOrder: missing args.orderId');
                    }
                    panelOrderState.suppressEmitId = args.orderId;
                    try {
                        omX.cancelPendingOrder(args.orderId, { silent: true });
                    } finally {
                        setTimeout(function () {
                            if (panelOrderState.suppressEmitId === args.orderId) {
                                panelOrderState.suppressEmitId = null;
                            }
                        }, 0);
                    }
                    return { ok: true };
                }

                // ─── extensibility hook ────────────────────────────────
                // Phase 7.2.4 covers tf + file + drawings + indicators.
                // Phase 7.2.4-orders adds the order routing above.
                // Future commands (chart type, alerts) land here as
                // additional case branches — same envelope shape, no
                // protocol churn.
                default:
                    throw new Error('unknown panel-cmd: ' + cmd);
            }
        });
    }

    function onMessage(ev) {
        var msg = ev && ev.data;
        if (!msg || typeof msg !== 'object') return;
        if (msg.type !== 'panel-cmd') return;
        // Targeted to a different panel? Ignore (each iframe filters its
        // own; broadcast '*' is delivered to all).
        if (msg.target && msg.target !== panelId && msg.target !== '*') return;

        if (msg.cmd === 'replayFrame') {
            if (applyReplayFrameHot(msg.args || {})) {
                reportResult(msg.requestId, true, null);
                return;
            }
        }

        log('apply', msg.cmd, msg.args);
        applyCommand(msg.cmd, msg.args).then(
            function (data) { reportResult(msg.requestId, true,  null, data); },
            function (err) {
                warn('cmd failed:', msg.cmd, err && err.message || err);
                reportResult(msg.requestId, false, String(err && err.message || err));
            }
        );
    }

    global.__panelCmdApply = function (msg) {
        if (!msg || typeof msg !== 'object' || msg.type !== 'panel-cmd') return;
        if (msg.target && msg.target !== panelId && msg.target !== '*') return;
        if (msg.cmd === 'replayFrame') {
            applyReplayFrameHot(msg.args || {}, true);
            return;
        }
        onMessage({ data: msg });
    };

    global.addEventListener('message', onMessage);

    // Tell the parent we're listening so it can flush any commands queued
    // while we were booting (Phase 7.2.4 doesn't queue today, but having
    // this signal future-proofs the protocol — same shape as bridge-ready).
    try {
        global.parent.postMessage({
            type:    'panel-cmd-ready',
            source:  panelId,
            cmds:    [
                'setTimeframe',
                'loadFile',
                'setActiveDrawingTool',
                'clearActiveDrawingTool',
                'setChartCursorType',
                'addIndicator',
                'removeIndicator',
                'getIndicators',
                'getOrderPanelPriceSnapshot',
                'applyV9UiSettings',
                'setV9PanelEmbed',
                'syncFromHost',
                'syncReplayFromHost',
                'extendReplayMasterFromHost',
                'replayEnter',
                'replayFrame',
                'replayTick',
                'replayExit',
                'replayPlay',
                'replayPause',
                'replaySetSpeed',
                'replaySetMode',
                'replaySetStepTf',
                'placeOrder',
                'addOrder',
                'applyOrderSnapshot',
                'syncPendingOrder',
                'removeMirroredOrder',
                'clearDraftPreview',
                'setDraftPreview',
                'closeOrder',
                'cancelOrder',
            ],
        }, '*');
    } catch (_) {}

    // ─── focus broadcast ───────────────────────────────────────────────
    //
    // Iframes are an event sink: pointerdown / mousedown that lands on
    // this iframe's contentWindow does NOT bubble out to the parent
    // document. Without an explicit signal the parent's MultichartGrid
    // can never know "the user just clicked panel B" and the focused
    // tile (which routes every topbar action — TF, file, indicator, …)
    // would be stuck on whichever tile was focused last via parent-side
    // interaction (typically host A).
    //
    // Solution: every pointerdown / mousedown / focusin inside the
    // iframe posts `panel-focus` to the parent. The manager picks it up
    // (via the new onPanelFocus opt hook) and updates focusedPanelId
    // in the React tree.
    //
    // Coalesced via a 0ms timer: a single user click typically fires
    // pointerdown + mousedown back-to-back; we only need to notify the
    // parent ONCE per user action.
    //
    // Defer postMessage to the NEXT task (setTimeout(0)), not the capture
    // phase of the same event: the parent's multichartFocusChanged handler
    // runs syncDrawingToolAcrossPanels, which can clear/re-arm tools while
    // this iframe's drawingManager is still handling the SAME pointerdown —
    // the first click would then miss starting a stroke. Letting the
    // current event finish first fixes "pick tool → first click doesn't draw".
    var focusPending = false;
    function notifyFocus(e) {
        // Right-click mousedown is followed by contextmenu — do not post
        // panel-focus here or a deferred hide would close the menu we are
        // about to open on the host.
        if (e && e.button === 2) return;
        if (focusPending) return;
        focusPending = true;
        setTimeout(function () {
            focusPending = false;
            try {
                global.parent.postMessage({
                    type:   'panel-focus',
                    source: panelId,
                }, '*');
            } catch (_) {}
        }, 0);
    }
    // capture:true so we hear the event even if a deeper handler stops
    // propagation. passive:true is fine because we never preventDefault.
    global.addEventListener('pointerdown', notifyFocus, { capture: true, passive: true });
    global.addEventListener('mousedown',   notifyFocus, { capture: true, passive: true });
    // focusin covers keyboard focus shifts (tab into a chart input).
    global.addEventListener('focusin',     notifyFocus, { capture: true, passive: true });

    // ─── replay keyboard forward ───────────────────────────────────────
    //
    // SPACE / Shift+ArrowRight / Shift+ArrowLeft / . / , are wired
    // by chart/modules/keyboard-shortcuts.js to toggle play, step
    // forward and step backward — on THIS iframe's local
    // replaySystem. That gives every panel its own private replay
    // controller, which is exactly the "duplicated replay system"
    // bug the user reported: hitting space inside a focused iframe
    // ran replay on that panel ALONE while the other panels stayed
    // paused.
    //
    // The single source of truth must be the parent's replaySystem
    // (Panel A). When the parent runs play / pause / step, it
    // already broadcasts the corresponding command to every iframe
    // via MultichartGrid's monkey-patched replaySystem methods, so
    // all panels stay in lockstep.
    //
    // Fix: intercept those keys at the iframe's window-level capture
    // phase, stop them from reaching keyboard-shortcuts.js, and
    // forward them as `replay-keyboard` to the parent. The parent's
    // MultichartGrid invokes the parent replaySystem method
    // directly, which broadcasts to all iframes in turn.
    function isReplayHotkey(e) {
        if (!e || !e.key) return null;
        var k = e.key;
        if (k === ' ' || k === 'Spacebar' || k === 'Space') return 'togglePlay';
        if (k === '.') return 'stepForward';
        if (k === ',') return 'stepBackward';
        if (k === 'ArrowRight' && e.shiftKey) return 'stepForward';
        if (k === 'ArrowLeft'  && e.shiftKey) return 'stepBackward';
        return null;
    }
    function onReplayKey(e) {
        // Don't hijack typing in inputs / textareas / contenteditable —
        // SPACE has its normal "insert space" meaning there.
        var t = e.target;
        if (t && t.tagName) {
            var tag = String(t.tagName).toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (t.isContentEditable) return;
        }
        var action = isReplayHotkey(e);
        if (!action) return;
        // SPACE in a non-input area would otherwise scroll the
        // iframe — block that AND the local keyboard-shortcuts.js
        // handler in one shot.
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        try {
            global.parent.postMessage({
                type:   'replay-keyboard',
                source: panelId,
                action: action,
            }, '*');
        } catch (_) {}
    }
    // Capture phase, BEFORE keyboard-shortcuts.js (which listens in
    // bubble phase). stopImmediatePropagation ensures any other
    // capture-phase listener from keyboard-shortcuts.js (it uses
    // `true` for keydown registration in some paths) also doesn't run.
    global.addEventListener('keydown', onReplayKey, { capture: true });

    // ─── drawing-tool dismiss (Escape + right-click) ─────────────────────
    //
    // chart.js / drawing-tools-manager normally clear armed tools on Escape
    // and right-click, but multichart iframes forward contextmenu to the
    // parent before those handlers run — and keyboard focus often stays on
    // the parent shell, so Escape never reaches the iframe's drawingManager.
    function notifyParentDrawingToolCleared() {
        try {
            global.parent.postMessage({
                type:   'v9-drawing-tool-cleared',
                source: panelId,
            }, '*');
        } catch (_) {}
    }

    function multichartArmedDrawFocusForwardV1Enabled() {
        try {
            return !global.__TALARIA_DISABLE_MULTICHART_ARMED_DRAW_FOCUS_FORWARD_V1;
        } catch (_) {
            return true;
        }
    }

    function multichartArmedInheritDrawGuardActive() {
        if (!multichartArmedDrawFocusForwardV1Enabled()) return false;
        try {
            var until = global.__multichartArmedInheritDrawGuardUntil;
            return !!(until && performance.now() < until);
        } catch (_) {
            return false;
        }
    }

    function isMultichartInheritableDrawTool(toolName) {
        if (!toolName) return false;
        var lt = String(toolName).toLowerCase().trim();
        return lt !== 'crosshair' && lt !== 'cursor';
    }

    function dismissActiveDrawingTool(dm, mirrored, opts) {
        if (!dm) return false;
        var keepSelection = !!(opts && opts.keepSelection);
        var guardActive = multichartArmedInheritDrawGuardActive();
        var protectDrawState = guardActive && (
            (dm.drawingState && dm.drawingState.isDrawing)
            || (dm.currentTool && isMultichartInheritableDrawTool(dm.currentTool))
        );
        if (protectDrawState) {
            // MC-DRAW-FIRSTCLICK: keep armed draw alive but still strip stale selection chrome.
            if (!keepSelection && typeof dm.deselectAll === 'function') {
                dm.deselectAll({ fromCanvasBackground: true });
            }
            if (typeof dm._stripMultichartStaleSelectionChromeDom === 'function') {
                dm._stripMultichartStaleSelectionChromeDom();
            }
            return false;
        }
        if (dm.isRectSelecting) {
            if (typeof dm.cancelRectangularSelection === 'function') {
                dm.cancelRectangularSelection();
            }
            return true;
        }
        if (dm.drawingState && dm.drawingState.isDrawing) {
            if (typeof dm.cancelDrawing === 'function') dm.cancelDrawing();
            return true;
        }
        var had = !!(dm.currentTool
            || dm.selectedDrawing
            || (dm.selectedDrawings && dm.selectedDrawings.length));
        if (!keepSelection && typeof dm.deselectAll === 'function') {
            dm.deselectAll({ fromCanvasBackground: true });
        }
        if (typeof dm.clearTool === 'function') dm.clearTool(!!mirrored);
        else dm.currentTool = null;
        return had;
    }

    function dismissDrawingToolOnContextMenu(e) {
        var ch = global.chart;
        var dm = ch && ch.drawingManager;
        if (!dm || !e) return false;

        if (dm.currentTool && e.button === 0 && e.ctrlKey) return false;

        if (ch.shouldSuppressRightClickContextMenu
            && typeof ch.shouldSuppressRightClickContextMenu === 'function'
            && ch.shouldSuppressRightClickContextMenu(e)) {
            return false;
        }

        var cleared = false;

        if ((dm.currentTool === 'polyline' || dm.currentTool === 'path')
            && dm.drawingState && dm.drawingState.isDrawing) {
            if (typeof dm.hidePathTooltip === 'function') dm.hidePathTooltip();
            if (dm.drawingState.tempPoints && dm.drawingState.tempPoints.length >= 2) {
                if (typeof dm.finalizeDrawing === 'function') dm.finalizeDrawing();
            } else if (typeof dm.cancelDrawing === 'function') {
                dm.cancelDrawing();
            }
            cleared = true;
        } else {
            cleared = dismissActiveDrawingTool(dm, false);
        }

        return cleared;
    }

    function multichartKeyboardTransportFixEnabled() {
        try {
            if (global.parent && global.parent !== global) {
                return !global.parent.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2;
            }
            return !global.__TALARIA_DISABLE_MULTICHART_QUICKBAR_SETTINGS_FIX_V2;
        } catch (_) {
            return true;
        }
    }

    /** T3 P4: panel keyboard bridge (Delete/Esc transport). Default ON; reads parent flag in embed. */
    function multichartPanelKeyboardV1EnabledInEmbed() {
        try {
            if (global.parent && global.parent !== global) {
                return !global.parent.__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1;
            }
        } catch (_) { /* ignore */ }
        try {
            return !global.__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1;
        } catch (_) {
            return true;
        }
    }

    function isDrawingToolDismissKeyTarget(dm) {
        if (!dm) return false;
        if (dm.currentTool
            || (dm.drawingState && dm.drawingState.isDrawing)
            || dm.isRectSelecting) {
            return true;
        }
        if (dm.selectedDrawing) return true;
        if (Array.isArray(dm.selectedDrawings) && dm.selectedDrawings.length) return true;
        var visuallySelected = (dm.drawings || []).filter(function (d) { return d && d.selected; });
        return visuallySelected.length > 0;
    }

    function hasDeletableDrawingSelection(dm) {
        if (!dm) return false;
        if (dm.selectedDrawing) return true;
        if (Array.isArray(dm.selectedDrawings) && dm.selectedDrawings.length) return true;
        var visuallySelected = (dm.drawings || []).filter(function (d) { return d && d.selected; });
        return visuallySelected.length > 0;
    }

    function onDismissDrawingKey(e) {
        if (!e || e.key !== 'Escape') return;
        if (!multichartKeyboardTransportFixEnabled()) return;
        var t = e.target;
        if (t && t.tagName) {
            var tag = String(t.tagName).toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (t.isContentEditable) return;
        }
        var dm = global.chart && global.chart.drawingManager;
        if (!isDrawingToolDismissKeyTarget(dm)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        dismissActiveDrawingTool(dm, false);
        notifyParentDrawingToolCleared();
    }

    function onDeleteDrawingKey(e) {
        if (!e || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
        if (!multichartPanelKeyboardV1EnabledInEmbed()) return;
        var t = e.target;
        if (t && t.tagName) {
            var tag = String(t.tagName).toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
            if (t.isContentEditable) return;
        }
        var dm = global.chart && global.chart.drawingManager;
        if (!hasDeletableDrawingSelection(dm)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        var toDelete = Array.isArray(dm.selectedDrawings) ? dm.selectedDrawings.slice() : [];
        if (toDelete.length === 0 && dm.selectedDrawing) {
            toDelete.push(dm.selectedDrawing);
        }
        if (toDelete.length === 0) {
            var visuallySelected = (dm.drawings || []).filter(function (d) { return d && d.selected; });
            if (visuallySelected.length === 1) toDelete = visuallySelected;
        }
        toDelete.forEach(function (drawing) {
            if (drawing && typeof dm.deleteDrawing === 'function') {
                dm.deleteDrawing(drawing);
            }
        });
    }

    global.addEventListener('keydown', onDismissDrawingKey, { capture: true });
    global.addEventListener('keydown', onDeleteDrawingKey, { capture: true });

    // ─── context-menu forward ───────────────────────────────────────────
    //
    // Each iframe has its own chart.js that opens a LOCAL context menu
    // when the user right-clicks. In multichart mode that produces N
    // independent menus (one per panel) instead of a single, unified
    // menu in the parent shell. Fix: capture the contextmenu event
    // before chart.js sees it, suppress the local menu, and forward
    // the click data to the parent. The parent (MultichartGrid) opens
    // the host chart's context menu at the correct screen position.
    function onContextMenu(e) {
        if (!e) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Deactivate armed / in-progress drawing tools before forwarding
        // the unified host context menu (local chart.js never sees this event).
        var toolDismissed = dismissDrawingToolOnContextMenu(e);

        // Hide the local menu in case chart.js already rendered it
        // (some paths fire both mouseup + contextmenu in the same task).
        try {
            var ch = global.chart;
            if (ch && typeof ch.hideContextMenu === 'function') ch.hideContextMenu();
        } catch (_) {}

        // Derive the price and symbol from the local chart so the
        // parent's unified menu can show correct Buy / Sell / Alert
        // items even when the clicked panel has a different instrument
        // or y-scale from the host.
        var priceAtCursor = null;
        var priceText = null;
        var symbolName = null;
        var currentPrice = null;
        try {
            var ch = global.chart;
            if (ch && ch.yScale) {
                priceAtCursor = ch.yScale.invert(e.offsetY);
                var priceRange = ch.yScale.domain()[1] - ch.yScale.domain()[0];
                var decimals = (typeof ch.getPriceDecimals === 'function')
                    ? ch.getPriceDecimals(priceRange)
                    : 2;
                priceText = priceAtCursor.toFixed(decimals);
            }
            if (ch && typeof ch.resolveEffectiveCurrentPrice === 'function') {
                currentPrice = ch.resolveEffectiveCurrentPrice(ch.data);
            }
            if (ch && typeof ch.getContextMenuSymbolName === 'function') {
                symbolName = ch.getContextMenuSymbolName();
            }
        } catch (_) {}

        // clientX/Y are relative to this iframe's viewport; the
        // parent adds the iframe's bounding-rect offset to get
        // host-viewport coordinates.
        try {
            global.parent.postMessage({
                type:    'iframe-contextmenu',
                source:  panelId,
                clientX: e.clientX,
                clientY: e.clientY,
                offsetX: e.offsetX,
                offsetY: e.offsetY,
                priceAtCursor: priceAtCursor,
                priceText: priceText,
                symbolName: symbolName,
                currentPrice: currentPrice,
                toolDismissed: !!toolDismissed,
            }, '*');
        } catch (_) {}
    }
    global.addEventListener('contextmenu', onContextMenu, { capture: true });

    // ─── dismiss host context menu on iframe click ──────────────────────
    //
    // Right-click menus are rendered on the HOST chart (see iframe-contextmenu
    // forward above). chart.js's document mousedown listener only runs inside
    // each iframe's document, so clicking empty chart area in a panel never
    // reached the host menu. Forward primary-button presses to the parent.
    function onDismissHostContextMenu(e) {
        if (!e || e.button === 2) return;
        try {
            var ch = global.chart;
            if (ch && typeof ch.hideContextMenu === 'function') ch.hideContextMenu();
        } catch (_) {}
        try {
            global.parent.postMessage({
                type:   'iframe-dismiss-contextmenu',
                source: panelId,
            }, '*');
        } catch (_) {}
    }
    global.addEventListener('mousedown', onDismissHostContextMenu, { capture: true });
    global.addEventListener('pointerdown', onDismissHostContextMenu, { capture: true });

    global.MultichartCmdBridge = {
        panelId:      panelId,
        applyCommand: applyCommand,
        notifyFocus:  notifyFocus,
    };
    log('installed');
})(typeof window !== 'undefined' ? window : globalThis);
