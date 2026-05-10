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
                // STRICT-SYNC MODEL: iframes are passive followers of
                // the host (Panel A). Their own replaySystem is in
                // replay mode (so the candle slice + indicators +
                // session bounds are correct) but is NEVER allowed to
                // run a local play loop — because:
                //
                //   1. At high speeds (60x, 100x) each iframe's local
                //      timer drifts vs the host. Iframe render is
                //      slower than host (smaller canvas, iframe
                //      compositing overhead, browser timer throttle on
                //      sub-100ms intervals when many timers are armed
                //      simultaneously). User reports "Panel B moves
                //      slow not like Panel A" — that's the drift.
                //
                //   2. setInterval / requestAnimationFrame in different
                //      browsing contexts (parent + 3 iframes) get
                //      independent scheduler budgets. They cannot stay
                //      in lockstep over thousands of ticks.
                //
                //   3. The user asked for "same candle same time on
                //      all panels". The only way to guarantee that is
                //      single-source-of-truth: the host owns the play
                //      loop, every iframe seeks to host's current
                //      timestamp on every host tick.
                //
                // Protocol:
                //   replayPlay {speed, mode}
                //     Iframe absorbs speed + mode INTO its replaySystem
                //     state (so any UI inside the iframe — even though
                //     hidden — stays consistent) but does NOT call
                //     play(). isPlaying stays false. Drives the
                //     iframe purely via the replayTick stream.
                //   replayPause
                //     No-op (iframe was never playing locally).
                //   replaySetSpeed / replaySetMode
                //     Mirror host's value into iframe state for
                //     consistency. setSpeed / setPlaybackMode do not
                //     auto-start playback when isPlaying=false, so
                //     this is a pure state update.
                //   replayTick {timestamp}
                //     Iframe seeks via goToReplayTimestamp — see the
                //     replayTick / replayEnter cases above.
                case 'replayPlay': {
                    var rsP = ch.replaySystem;
                    if (!rsP) {
                        warn('replayPlay: replaySystem not available');
                        return;
                    }
                    // Defer if the iframe hasn't entered replay yet
                    // (race: parent hits play before the iframe's
                    // autoLoadBacktestingData → enterReplayMode chain
                    // completes). The next replayTick from parent
                    // (which carries a timestamp) will lazily enter
                    // replay via applyReplayEnter, after which the
                    // following replayPlay will land.
                    if (!rsP.isActive) {
                        log('replayPlay deferred (not yet active)');
                        return;
                    }
                    if (Number.isFinite(args.speed)
                        && typeof rsP.setSpeed === 'function') {
                        try { rsP.setSpeed(args.speed); }
                        catch (e) { warn('replayPlay: setSpeed threw', e && e.message); }
                    }
                    if (typeof args.mode === 'string'
                        && typeof rsP.setPlaybackMode === 'function') {
                        try {
                            rsP.setPlaybackMode(args.mode,
                                { restartPlayback: false });
                        } catch (e) {
                            warn('replayPlay: setPlaybackMode threw', e && e.message);
                        }
                    }
                    // INTENTIONALLY DO NOT CALL rsP.play() — see the
                    // STRICT-SYNC MODEL comment above. Host's tick
                    // stream drives this iframe.
                    return;
                }
                case 'replayPause': {
                    // No-op — iframe never started a local play loop,
                    // so there's nothing to pause. When host pauses,
                    // its tick stream stops, iframe stops seeking,
                    // iframe holds at host's last ts. Visually
                    // identical to "iframe paused".
                    return;
                }
                case 'replaySetSpeed': {
                    var rsS = ch.replaySystem;
                    if (!rsS || typeof rsS.setSpeed !== 'function') return;
                    if (!Number.isFinite(args.speed)) return;
                    try { rsS.setSpeed(args.speed); }
                    catch (e) { warn('replaySetSpeed threw', e && e.message); }
                    // setSpeed is a no-op for restart when isPlaying=false,
                    // so this just updates the speed value for consistency.
                    return;
                }
                case 'replaySetMode': {
                    var rsM = ch.replaySystem;
                    if (!rsM || typeof rsM.setPlaybackMode !== 'function') return;
                    if (typeof args.mode !== 'string') return;
                    try {
                        // restartPlayback:false — even in candle/tick
                        // toggle, the iframe is not running a local
                        // loop. Pure state update.
                        rsM.setPlaybackMode(args.mode,
                            { restartPlayback: false });
                    } catch (e) {
                        warn('replaySetMode threw', e && e.message);
                    }
                    return;
                }

                // ─── extensibility hook ────────────────────────────────
                // Phase 7.2.4 covers tf + file + drawings + indicators.
                // Future commands (place order, chart type) land here
                // as additional case branches — same envelope shape,
                // no protocol churn.
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

    global.MultichartCmdBridge = {
        panelId:      panelId,
        applyCommand: applyCommand,
        notifyFocus:  notifyFocus,
    };
    log('installed');
})(typeof window !== 'undefined' ? window : globalThis);
