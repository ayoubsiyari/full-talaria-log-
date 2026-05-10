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
        bus.on('order:closed',          function (o) { postIframeOrder('closed',          o); });
        bus.on('order:pending-removed', function (o) { postIframeOrder('pending-removed', o); });
        log('order forwarders installed');
    }

    function scheduleCoalescedSeek(ch, ts) {
        coalescedSeekTs = ts;
        if (coalescedSeekScheduled) return;
        coalescedSeekScheduled = true;
        var raf = global.requestAnimationFrame || function (fn) {
            return setTimeout(fn, 16);
        };
        raf(function () {
            coalescedSeekScheduled = false;
            var seekTs = coalescedSeekTs;
            coalescedSeekTs = null;
            if (seekTs == null) return;
            var rs = ch.replaySystem;
            if (!rs || !rs.isActive) return;
            if (typeof rs.goToReplayTimestamp !== 'function') return;
            try {
                rs.goToReplayTimestamp(seekTs,
                    { preserveVisibleWindow: false });
            } catch (e) {
                warn('coalesced seek threw', e && e.message);
            }
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
                rs.enterReplayMode({ startAtBeginning: true });
            } catch (e) {
                warn('replayEnter: enterReplayMode threw', e && e.message);
            }
        }
        if (rs.isActive && Number.isFinite(ts)
            && typeof rs.goToReplayTimestamp === 'function') {
            try {
                rs.goToReplayTimestamp(ts, { preserveVisibleWindow: false });
            } catch (e) {
                warn('replayEnter: goToReplayTimestamp threw', e && e.message);
            }
        }
        // Successfully applied — clear the pending stash so a later
        // chartDataLoaded (e.g. user changes file via symbol-sync, then
        // tries to play) doesn't replay a stale timestamp from before
        // the file change.
        pendingReplayTs = null;
        // Apply any deferred play/speed/mode that arrived BEFORE the
        // iframe was active. This is what makes "join mid-play" work
        // — without it the iframe sits paused at parent's ts even
        // though the parent has been playing for minutes.
        try { drainPendingPlay(ch); } catch (_) {}
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

    // Apply a single command. Returns a promise that resolves on success
    // or rejects on failure (we surface either via reportResult).
    function applyCommand(cmd, args) {
        return waitForChart(5000).then(function (ch) {
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
                    var tf = String(args.tf || '').trim();
                    if (!tf) throw new Error('setTimeframe: missing args.tf');
                    if (typeof ch.setTimeframe !== 'function') {
                        throw new Error('chart.setTimeframe is not a function');
                    }
                    if (ch.currentTimeframe === tf) return;
                    ch.setTimeframe(tf);
                    return;
                }

                // ─── file / dataset switch ─────────────────────────────
                case 'loadFile': {
                    var fileId = args.fileId;
                    if (fileId === undefined || fileId === null || fileId === '') {
                        throw new Error('loadFile: missing args.fileId');
                    }
                    if (typeof ch.loadFileData !== 'function') {
                        throw new Error('chart.loadFileData is not a function');
                    }
                    // Idempotency guard: when the parent fans out symbol
                    // sync to every panel, each panel echoes chart-state
                    // back; without this, the echo would re-trigger
                    // loadFileData on every panel and loop. Same trick
                    // setTimeframe uses above.
                    var fidStr = String(fileId);
                    if (String(ch.currentFileId || '') === fidStr) return;
                    var p = ch.loadFileData(fidStr);
                    // loadFileData may be sync OR return a promise.
                    if (p && typeof p.then === 'function') return p;
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
                    var dmc = ch.drawingManager;
                    if (!dmc) return;
                    if (typeof dmc.clearTool === 'function') dmc.clearTool();
                    else dmc.currentTool = null;
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
                    var ind = ch.addIndicator(indType);
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    try { if (typeof ch.updateOHLCIndicators === 'function') ch.updateOHLCIndicators(); } catch (_) {}
                    return { chartId: (ind && ind.id) ? ind.id : null, type: indType };
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
                        return { id: i.id, type: i.type || i.name || null };
                    });
                    return { indicators: items };
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
                case 'replayEnter': {
                    var tsE = Number(args.timestamp);
                    // First-time activation MUST run synchronously so
                    // enterReplayMode + first seek complete before any
                    // tick stream arrives. After this, ticks coalesce
                    // via scheduleCoalescedSeek (see replayTick below).
                    return applyReplayEnter(ch, tsE);
                }
                case 'replayTick': {
                    var ts2 = Number(args.timestamp);
                    if (!Number.isFinite(ts2)) return;
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
                    // ─── candle-animation preservation ─────────────
                    // If iframe is mid-playback, SKIP the seek.
                    // goToReplayTimestamp resets `animatingCandle =
                    // null` and `tickProgress = 0`, which kills the
                    // in-progress candle build and the user sees
                    // discrete candle jumps instead of the smooth
                    // tick-by-tick draw the original chart shows.
                    //
                    // Both panels run their own play loops anchored
                    // at the SAME start timestamp + speed + mode
                    // (broadcast on enter via _primeReplayFromParent
                    // and on every replaySetSpeed / replaySetMode
                    // change), so they advance in lockstep without
                    // needing a per-candle resync. Drift correction
                    // happens naturally on pause: once parent pauses,
                    // its final replayTick lands and iframe seeks.
                    //
                    // Only seek if iframe has drifted MORE than a
                    // few candles (catastrophic drift, e.g. tab was
                    // backgrounded — setTimeout throttles to ~1Hz,
                    // iframe falls minutes behind, needs to catch up).
                    if (rsT.isPlaying) {
                        var localTs = Number(rsT.replayTimestamp);
                        if (Number.isFinite(localTs)) {
                            // Estimate "candles behind" using the
                            // chart's timeframe step. Allow up to 3
                            // candles of drift before correcting.
                            var step = (ch.currentTimeframeMs
                                ? Number(ch.currentTimeframeMs)
                                : 60000);
                            if (!Number.isFinite(step) || step <= 0) step = 60000;
                            var driftMs = Math.abs(ts2 - localTs);
                            if (driftMs <= step * 3) {
                                // Within tolerance — let the local
                                // animation continue uninterrupted.
                                return;
                            }
                        }
                    }
                    // Hot path: just stash the latest ts and let the
                    // rAF coalescer apply it. Older queued ts are
                    // dropped so iframe never falls behind regardless
                    // of parent's tick rate (60x, 100x — doesn't
                    // matter, iframe always renders the newest).
                    pendingReplayTs = ts2;
                    scheduleCoalescedSeek(ch, ts2);
                    return;
                }
                case 'replayExit': {
                    // Drop any queued enter — parent left replay before
                    // we got around to applying it.
                    pendingReplayTs = null;
                    pendingReplayDesired = false;
                    // Clear deferred play intent — exit is the parent
                    // saying "stop everything", so a stale "play"
                    // shouldn't auto-resume on next enter.
                    pendingPlayDesired = null;
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
                // HYBRID MODEL: iframes run their OWN local play loop
                // with the host's settings, AND parent broadcasts a
                // drift-correcting seek on every host tick.
                //
                // Why both?
                //   • Pure local-play (no seek): iframe drifts behind
                //     host at high speeds because iframe render is
                //     slower than host. User reported "Panel B moves
                //     slow not like Panel A".
                //   • Pure passive (no local play, only seek): iframe
                //     visually does nothing until parent's tick arrives;
                //     between ticks iframe is frozen. User reported
                //     "need to select Panel B and press space — wrong".
                //   • Hybrid: iframe plays locally so it animates
                //     smoothly between ticks, AND every host tick
                //     calls goToReplayTimestamp to snap iframe back to
                //     host's exact position. Drift can never accumulate
                //     because each tick re-aligns.
                //
                // Protocol:
                //   replayPlay {speed, mode}
                //     setSpeed + setPlaybackMode + play() locally.
                //     Iframe.isPlaying becomes true. Local loop runs
                //     at host's speed/mode.
                //   replayPause
                //     pause() locally. Iframe.isPlaying becomes false.
                //   replaySetSpeed {speed}
                //     setSpeed (mid-play OK; replaySystem internally
                //     re-arms its own loop at the new rate).
                //   replaySetMode {mode}
                //     setPlaybackMode with restartPlayback so a
                //     mid-play tick<->candle toggle takes effect.
                //   replayTick {timestamp}
                //     Drift correction — iframe seeks via
                //     scheduleCoalescedSeek so it can never fall
                //     more than 1 refresh frame behind host.
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
                    if (!rsP.isActive) {
                        // Iframe hasn't entered replay yet. Intent is
                        // stashed above — drainPendingPlay will fire
                        // it the moment applyReplayEnter completes.
                        log('replayPlay stashed (not yet active)');
                        return;
                    }
                    drainPendingPlay(ch);
                    return;
                }
                case 'replayPause': {
                    pendingPlayDesired = false;
                    var rsPa = ch.replaySystem;
                    if (!rsPa || !rsPa.isActive) return;
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
                case 'placeOrder': {
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
                    var existing = (om2.orders || []).some(function (o) {
                        return o && o.id != null && o.id === ord.id;
                    });
                    if (existing) {
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
                    // Force a render so the line shows up immediately.
                    try { if (typeof ch.render === 'function') ch.render(); } catch (_) {}
                    try {
                        if (om2.updateOrderLines) om2.updateOrderLines(ch);
                    } catch (_) {}
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

        log('apply', msg.cmd, msg.args);
        applyCommand(msg.cmd, msg.args).then(
            function (data) { reportResult(msg.requestId, true,  null, data); },
            function (err) {
                warn('cmd failed:', msg.cmd, err && err.message || err);
                reportResult(msg.requestId, false, String(err && err.message || err));
            }
        );
    }

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
                'addIndicator',
                'removeIndicator',
                'getIndicators',
                'replayEnter',
                'replayTick',
                'replayExit',
                'replayPlay',
                'replayPause',
                'replaySetSpeed',
                'replaySetMode',
                'placeOrder',
                'addOrder',
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
    // parent ONCE per user action. The flag resets on the next tick.
    var focusPending = false;
    function notifyFocus() {
        if (focusPending) return;
        focusPending = true;
        setTimeout(function () { focusPending = false; }, 0);
        try {
            global.parent.postMessage({
                type:   'panel-focus',
                source: panelId,
            }, '*');
        } catch (_) {}
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

    global.MultichartCmdBridge = {
        panelId:      panelId,
        applyCommand: applyCommand,
        notifyFocus:  notifyFocus,
    };
    log('installed');
})(typeof window !== 'undefined' ? window : globalThis);
