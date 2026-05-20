/**
 * multichart-manager.js
 *
 * Parent shell orchestrator. Lives ONLY in the shell page (multichart-shell.html).
 *
 * Responsibilities:
 *   - Manage iframe lifecycle (add / remove charts)
 *   - Receive postMessage from each chart-host iframe
 *   - Apply Phase 0 allowlist filter to all incoming/outgoing payloads
 *   - PEER topology fan-out: any chart's user event broadcasts to all others
 *   - Loop guard via causationId
 *   - Sync mode toggles (crosshair / visibleRange / both / none)
 *   - Symbol broadcast (when one chart changes symbol, all peers follow)
 *   - Verification: log panel, counters, assertion-report aggregation,
 *     guard self-test fan-out
 *
 * Strict envelope schema enforced both inbound (from iframes) and outbound
 * (to iframes), via window.MultichartGuards.filterForbiddenFields.
 */

(function (global) {
    'use strict';

    const G = global.MultichartGuards;
    if (!G) {
        throw new Error('multichart-manager: MultichartGuards must load first');
    }

    /** panel-cmd `loadFile` / heavy ops: iframes may still be parsing dist-v9 after bridge-ready. */
    var PANEL_CMD_TIMEOUT_MS = 25000;

    function uuid() {
        return Date.now().toString(16) + '-' + (Math.random() * 1e9 | 0).toString(16);
    }

    /**
     * @param {object} opts
     *   container: HTMLElement      — where the iframes are mounted
     *   onLog: (entry) => void       — receives log lines for the verification panel
     *   onState: (id, state) => void — receives chart-state updates per chart
     *   onAssertion: (msg) => void   — receives assertion reports
     *   iframeSrcBuilder: (cfg, params) => url   — optional. When set, addChart()
     *     uses this to compute the iframe URL instead of the hardcoded sandbox
     *     `chart-host.html?...`. Production callers pass a builder that returns
     *     `/chart/dist-v9/index.html?multichart=1&panelId=...`. `params` is
     *     the URLSearchParams already populated with id/tf/fileId/etc — the
     *     builder may inspect, modify, or ignore it.
     *     SANDBOX BEHAVIOR PRESERVED: omit the option to keep existing
     *     chart-host.html URL.
     */
    function MultichartManager(opts) {
        this.container = opts.container;
        this.onLog    = opts.onLog    || function () {};
        this.onState  = opts.onState  || function () {};
        this.onAssertion = opts.onAssertion || function () {};
        // Phase 7.2.4 hook: fired (with the chart id) AFTER the iframe's
        // bridge has reported ready and the manager's loading overlay has
        // been removed. Production callers use this to dismiss their own
        // per-tile loading overlay (TradingView-style 3-dot indicator).
        this.onChartReady = (typeof opts.onChartReady === 'function')
            ? opts.onChartReady
            : function () {};
        // Phase 7.2.4: fired with the panelId whenever a user action
        // inside an iframe (pointerdown / mousedown / focusin) is
        // reported via `panel-focus`. The React grid wires this to
        // setFocusedPanelId so the topbar's per-panel command bus
        // routes to the panel the user just clicked. Without it the
        // user can never select B/C/D because iframe events are sealed
        // inside the iframe and never bubble out to the parent.
        this.onPanelFocus = (typeof opts.onPanelFocus === 'function')
            ? opts.onPanelFocus
            : function () {};
        this.onContextMenu = (typeof opts.onContextMenu === 'function')
            ? opts.onContextMenu
            : function () {};
        this.iframeSrcBuilder = (typeof opts.iframeSrcBuilder === 'function')
            ? opts.iframeSrcBuilder
            : null;

        this.charts = new Map();    // id -> { id, frame, ready, state }
        this.syncMode = {
            crosshair:    true,
            visibleRange: false,
            symbol:       false,
            drawings:     true,
        };
        this.counters = {
            outFromUser: 0,        // user-originated forwards
            droppedLoop: 0,        // dropped due to causation match
            droppedForbidden: 0,   // dropped due to forbidden field
            assertionsOk: 0,
            assertionsFail: 0,
        };
        this._frameOriginCheck = false;  // sandbox: '*' is fine

        this._onWindowMessage = this._onWindowMessage.bind(this);
        global.addEventListener('message', this._onWindowMessage);

        /** Dedupe window for replay "at end" toasts coalesced from all panels (see replay-system _maybeNotifyReplayToast). */
        this._lastGlobalReplayToastAt = 0;
        this._lastGlobalReplayToastMsg = '';
        this._boundDedupedReplayToast = this._showGlobalReplayToastOnce.bind(this);
        global.__multichartDedupedReplayToast = this._boundDedupedReplayToast;
    }

    MultichartManager.prototype.dispose = function () {
        global.removeEventListener('message', this._onWindowMessage);
        if (global.__multichartDedupedReplayToast === this._boundDedupedReplayToast) {
            try { delete global.__multichartDedupedReplayToast; } catch (_) {
                global.__multichartDedupedReplayToast = undefined;
            }
        }
        for (const id of Array.from(this.charts.keys())) this.removeChart(id);
    };

    /**
     * Show a replay UX toast once on the host page (window.chart), not inside each iframe.
     * Multiple panels can hit "play at end" in the same tick when sync is on — same 900ms key as replay-system.
     */
    MultichartManager.prototype._showGlobalReplayToastOnce = function (message) {
        if (!message || typeof message !== 'string') return;
        const now = Date.now();
        if (message === this._lastGlobalReplayToastMsg
                && now - this._lastGlobalReplayToastAt < 900) {
            return;
        }
        this._lastGlobalReplayToastMsg = message;
        this._lastGlobalReplayToastAt = now;
        try {
            const ch = global.chart;
            if (ch && typeof ch.showNotification === 'function') {
                ch.showNotification(message);
            }
        } catch (_) {}
    };

    MultichartManager.prototype.setSyncMode = function (mode) {
        const prev = Object.assign({}, this.syncMode);
        Object.assign(this.syncMode, mode || {});
        this._log('info', 'syncMode = ' + JSON.stringify(this.syncMode));

        // When the user toggles visibleRange (Time / Date Range) sync ON
        // from OFF, immediately push the host's CURRENT view to every
        // iframe so the panels visibly snap to the same range. Without
        // this, sync only kicks in on the next user pan/zoom — and the
        // user's natural test ("I turned sync on, why didn't anything
        // happen?") fails. After this snap, ongoing pan/zoom flows
        // through normal _fanOut.
        if (this.syncMode.visibleRange && !prev.visibleRange) {
            const self = this;
            setTimeout(function () {
                for (const c of self.charts.values()) {
                    if (c.host || !c.ready) continue;
                    self._initialSyncToHost(c);
                }
            }, 0);
        }
    };

    /**
     * Add a chart by spawning an iframe.
     * @param {{id:string, symbol:string, tf:string, days?:number}} cfg
     * @param {HTMLElement} mountEl  - the cell element to mount the iframe into
     */
    MultichartManager.prototype.addChart = function (cfg, mountEl) {
        if (this.charts.has(cfg.id)) {
            this._log('warn', 'addChart: id already present: ' + cfg.id);
            return;
        }
        const params = new URLSearchParams();
        params.set('id', cfg.id);
        params.set('tf', cfg.tf || '1m');
        if (cfg.verbose) params.set('verbose', '1');

        // v10: shell remembers the last broadcast file id; pass it as URL
        // param so newly-spawned iframes load the same file by default.
        // Each iframe also has its own per-panel file picker the user can
        // change after init.
        //
        // v10.5.0 (Phase 6.4 session restore): per-panel `cfg.fileId` from
        // a saved session takes PRIORITY over the broadcast id. Same for
        // `cfg.restoreStartSec` / `cfg.restoreEndSec`, which the iframe
        // applies as its initial visible range once data is loaded. None
        // of these are price-axis fields, by design — the original-bug
        // guard is preserved.
        try {
            const rd = (typeof global.__multichartRealData === 'function')
                ? global.__multichartRealData()
                : null;
            const effectiveFileId = cfg.fileId || (rd && rd.fileId) || null;
            if (effectiveFileId) {
                params.set('fileId', String(effectiveFileId));
            }
        } catch (_) {}
        if (Number.isFinite(cfg.restoreStartSec) && Number.isFinite(cfg.restoreEndSec)
            && cfg.restoreEndSec > cfg.restoreStartSec) {
            params.set('restoreStart', String(Math.floor(cfg.restoreStartSec)));
            params.set('restoreEnd',   String(Math.floor(cfg.restoreEndSec)));
        }

        // Per-cell loading overlay so we can see WHICH cells exist and which
        // are stuck waiting for their iframe's chart.js to init. Removed when
        // the cell goes ready (see _onWindowMessage on bridge-ready).
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML =
            '<div class="id">' + cfg.id + '</div>' +
            '<div>Loading panel — pick a file…</div>' +
            '<small>iframe: pending — bridge: pending</small>';
        mountEl.appendChild(overlay);

        const frame = document.createElement('iframe');
        if (this.iframeSrcBuilder) {
            try {
                frame.src = this.iframeSrcBuilder(cfg, params);
            } catch (e) {
                this._log('error', 'iframeSrcBuilder threw for ' + cfg.id + ': ' + (e && e.message || e));
                frame.src = 'about:blank';
            }
        } else {
            frame.src = 'chart-host.html?' + params.toString();
        }
        frame.title = 'Chart ' + cfg.id;
        frame.setAttribute('data-chart-id', cfg.id);
        // No `sandbox` attribute — iframe is same-origin (file:// or local
        // dev server), and chart.js needs unrestricted scripts. The
        // postMessage allowlist is the security boundary here.
        frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#0b0c14;';
        const self = this;
        // Panel iframes each boot the full dist-v9 stack (deferred scripts +
        // React + chart.js). With 3–4 panels, parallel CPU/network contention
        // can push `window.chart` well past 5s after the iframe `load` event
        // even though init is still healthy — embed-bridge polls up to 30s.
        var BRIDGE_READY_TIMEOUT_MS = 30000;
        frame.addEventListener('load', function () {
            self._log('info', 'iframe loaded: ' + cfg.id + ' (waiting for bridge-ready…)');
            const small = overlay.querySelector('small');
            if (small) small.textContent = 'iframe: LOADED — bridge: pending (up to '
                + Math.round(BRIDGE_READY_TIMEOUT_MS / 1000) + 's)';
            setTimeout(function () {
                const c = self.charts.get(cfg.id);
                if (c && !c.ready) {
                    self._log('error', 'TIMEOUT: ' + cfg.id + ' iframe loaded but bridge never reported ready within '
                        + BRIDGE_READY_TIMEOUT_MS + 'ms (chart.js init stalled or failed — open the iframe URL in a new tab to inspect its console)');
                    const sm = overlay.querySelector('small');
                    if (sm) sm.textContent = 'iframe: LOADED — bridge: TIMEOUT (no ready after '
                        + Math.round(BRIDGE_READY_TIMEOUT_MS / 1000) + 's)';
                }
            }, BRIDGE_READY_TIMEOUT_MS);
        });
        frame.addEventListener('error', function () {
            self._log('error', 'iframe FAILED to load: ' + cfg.id + ' src=' + frame.src);
            const small = overlay.querySelector('small');
            if (small) small.textContent = 'iframe: LOAD FAILED';
        });
        mountEl.appendChild(frame);

        this.charts.set(cfg.id, {
            id:      cfg.id,
            cfg:     cfg,
            frame:   frame,
            overlay: overlay,
            ready:   false,
            state:   { symbol: '—', timeframe: cfg.tf, candleCount: 0 },
            mountEl: mountEl,
        });
        this._log('info', 'addChart ' + cfg.id + ' (tf=' + (cfg.tf || '?') + ')');
    };

    MultichartManager.prototype.removeChart = function (id) {
        const c = this.charts.get(id);
        if (!c) return;
        if (c.host) {
            // Host charts are not iframes — never tear down their DOM.
            // The parent owns the chartWrapper element.
            this.charts.delete(id);
            this._log('info', 'removeChart ' + id + ' (host — DOM left intact)');
            return;
        }
        try { c.frame.remove(); } catch (_) {}
        this.charts.delete(id);
        this._log('info', 'removeChart ' + id);
    };

    /**
     * Register a "host" chart — a chart that lives in the SAME window as
     * the manager (the parent's window.chart) rather than inside an iframe.
     *
     * Sync flow for the host:
     *   • OUTBOUND (host → peers): the host bridge's monkey-patched
     *     broadcastCrosshairSync + 'chartScrolled' listeners post to
     *     `window.parent` which IS this same window — manager picks it up
     *     in _onWindowMessage and fans out to iframe peers.
     *   • INBOUND (peers → host): manager's _send sees `directDeliver` on
     *     the chart entry and invokes it instead of frame.contentWindow.
     *     postMessage. The deliver function is the bridge's exposed
     *     applyInbound, which applies the message to the host chart
     *     (skipping its own causationIds via the loop-guard ring buffer).
     *
     * Why directDeliver instead of `window.postMessage(msg, '*')`:
     *   The manager has no outbound causationId guard. If we delivered to
     *   the host via window.postMessage, the manager would hear that same
     *   message in its 'message' listener and re-fan it to all peers,
     *   producing N-way echo of every event.
     *
     * @param {object} cfg                   { id, tf?, fileId?, … }
     * @param {{deliver:(msg)=>void}} hostBridge  the object returned by
     *                                       MultichartBridge.installBridge.
     * @returns the chart entry stored in `this.charts`
     */
    MultichartManager.prototype.addHostChart = function (cfg, hostBridge) {
        if (this.charts.has(cfg.id)) {
            this._log('warn', 'addHostChart: id already present: ' + cfg.id);
            return this.charts.get(cfg.id);
        }
        if (!hostBridge || typeof hostBridge.deliver !== 'function') {
            throw new Error('addHostChart: hostBridge.deliver is required');
        }
        const entry = {
            id:      cfg.id,
            cfg:     cfg,
            frame:   null,
            host:    true,
            directDeliver: hostBridge.deliver,
            // Optional read-side hook: bridge.readVisibleTimeRange() so the
            // manager can pull the host's current view at any time (used by
            // _initialSyncToHost when a new iframe panel goes ready).
            directRead: (typeof hostBridge.readVisibleTimeRange === 'function')
                ? hostBridge.readVisibleTimeRange
                : null,
            overlay: null,
            // Host bridge is already installed and emitting events — mark
            // ready immediately so the host counts as a peer for fan-out
            // from the moment the first iframe arrives.
            ready:   true,
            state:   { symbol: '—', timeframe: cfg.tf || '?', candleCount: 0 },
            mountEl: null,
        };
        this.charts.set(cfg.id, entry);
        this._log('info', 'addHostChart ' + cfg.id + ' (in-process; ' + this.charts.size + ' total)');
        // Fire onChartReady so the React grid can drop any host-tile
        // overlay (in practice the React grid never shows one for the
        // host, but stay consistent with iframe semantics).
        try { this.onChartReady(cfg.id); } catch (_) {}

        // Race-safety: any iframe panels that already went ready BEFORE the
        // host was registered (possible if the host bridge install was
        // delayed waiting for window.chart) need a backfill sync now so
        // they don't sit on a stale loadFileData default view forever.
        const self = this;
        setTimeout(function () {
            for (const c of self.charts.values()) {
                if (c.host || !c.ready) continue;
                self._initialSyncToHost(c);
            }
        }, 0);

        return entry;
    };

    /**
     * After a new iframe panel goes bridge-ready, push the host's CURRENT
     * visible time range to it so it boots at the same view the user is
     * already looking at on the parent's #chartWrapper, instead of
     * whatever default chart.js picks after loadFileData.
     *
     * Fires whenever a host chart is registered AND has a readable range,
     * REGARDLESS of syncMode.visibleRange. This is a ONE-TIME snapshot at
     * iframe-add time — it makes panels VISIBLY consistent at split time
     * (TradingView UX expectation: "I split my chart into 2, both halves
     * show the same view"). After this initial snap, ongoing pan/zoom
     * sync is still gated by syncMode.visibleRange — so users who turn
     * date-range sync OFF can pan independently from this aligned start.
     *
     * Why we ignore the gate here:
     *   Without this initial snap, Panel B boots at chart.js's default
     *   "show last N bars" view, which almost never matches Panel A's
     *   current view. The user perceives this as broken sync ("the
     *   data is wrong on Panel B"). Aligning at split time is the
     *   single biggest UX improvement and only happens once per add.
     */
    MultichartManager.prototype._initialSyncToHost = function (newChart) {
        if (!newChart || newChart.host) return;
        let host = null;
        for (const c of this.charts.values()) {
            if (c.host) { host = c; break; }
        }
        if (!host || typeof host.directRead !== 'function') return;
        let range = null;
        try { range = host.directRead(); } catch (_) { range = null; }
        if (!range || !Number.isFinite(range.startSec) || !Number.isFinite(range.endSec)) return;
        // Bypass the syncMode gate by calling _send directly with a
        // visibleRange envelope. _send doesn't consult syncMode (only
        // _fanOut does), so this initial snap delivers even when the
        // user has date-range sync off.
        this._send(newChart, {
            type:        'visibleRange',
            startTime:   range.startSec,
            endTime:     range.endSec,
            startIndex:  range.startIndex,
            endIndex:    range.endIndex,
            visibleBarCount: range.visibleBarCount,
            offsetX:     range.offsetX,
            candleWidth: range.candleWidth,
            zoomLevelIndex: range.zoomLevelIndex,
            plotWidthPx: range.plotWidthPx,
            source:      host.id,
            causationId: 'host-init-' + Date.now() + '-' + (Math.random() * 1e6 | 0).toString(16),
        });
        this._log('info', 'initial-sync ' + host.id + ' → ' + newChart.id
            + ' visibleRange=[' + range.startSec + '..' + range.endSec + ']');
    };

    MultichartManager.prototype.getCharts = function () {
        return Array.from(this.charts.values());
    };

    /**
     * Send a config patch to a specific iframe.
     */
    MultichartManager.prototype.sendConfig = function (id, configPatch) {
        const c = this.charts.get(id);
        if (!c) return;
        const msg = { type: 'bridge-config', config: configPatch };
        try {
            if (c.directDeliver) c.directDeliver(msg);
            else                 c.frame.contentWindow.postMessage(msg, '*');
        } catch (e) {
            this._log('warn', 'sendConfig fail ' + id + ': ' + e.message);
        }
    };

    /**
     * Phase 7.2.4 — send a per-panel COMMAND (timeframe change, file
     * load, drawing tool, indicator add/remove, …) to a single iframe
     * panel. Host (in-process) panels are NOT routed through here —
     * the React grid invokes window.chart directly for the host
     * because it lives in the same window and postMessage would be a
     * needless detour.
     *
     * The receiving iframe runs panel-cmd-bridge.js (loaded by the
     * dist-v9 ?multichart=1 shim) which picks up `type:'panel-cmd'`
     * messages and applies them via its local window.chart.
     *
     * Returns a Promise that resolves with the iframe's reply payload
     * (cmd-result.data, may be null) on success, or rejects with the
     * iframe's error message. Times out after PANEL_CMD_TIMEOUT_MS (25s)
     * so loadFile can finish while the dist-v9 iframe is still settling.
     *
     * @param {string} panelId    e.g. 'B', 'C', 'D'
     * @param {string} cmd        'setTimeframe' | 'loadFile' | …
     * @param {object} [args]     command-specific args
     * @returns {Promise<any>}    resolves with cmd-result.data, rejects on error
     */
    /**
     * Fire-and-forget panel-cmd. No requestId, no pendingCmds entry,
     * no timeout. Use for high-frequency commands where the caller
     * does not need a reply (e.g. replayTick at 60Hz). Avoids the
     * Promise + Map.set + setTimeout overhead per call which becomes
     * significant when broadcasting to N panels every refresh frame.
     *
     * The iframe still POSTS a panel-cmd-reply (legacy) but parent's
     * onMessage drops it silently when the requestId is missing from
     * pendingCmds — so this is fully backward-compatible.
     *
     * @param {string} panelId
     * @param {string} cmd
     * @param {object} [args]
     */
    MultichartManager.prototype.sendCommandNoReply = function (panelId, cmd, args) {
        const c = this.charts.get(panelId);
        if (!c || c.host || !c.frame || !c.frame.contentWindow) return;
        try {
            c.frame.contentWindow.postMessage({
                type:   'panel-cmd',
                target: panelId,
                cmd:    cmd,
                args:   args || {},
                // Intentionally no requestId — iframe will still
                // reply but the parent's onMessage just no-ops on
                // unknown requestIds.
            }, '*');
        } catch (e) {
            this._log('warn', 'sendCommandNoReply fail ' + panelId + ': ' + e.message);
        }
    };

    MultichartManager.prototype.sendCommand = function (panelId, cmd, args) {
        const self = this;
        return new Promise(function (resolve, reject) {
            const c = self.charts.get(panelId);
            if (!c) {
                self._log('warn', 'sendCommand: unknown panel ' + panelId);
                reject(new Error('unknown panel ' + panelId));
                return;
            }
            if (c.host) {
                self._log('warn', 'sendCommand: ignored for host panel ' + panelId);
                reject(new Error('host panel does not accept panel-cmd; use direct call'));
                return;
            }
            if (!self._pendingCmds) self._pendingCmds = new Map();
            const requestId = 'cmd-' + Date.now() + '-' + (Math.random() * 1e6 | 0).toString(16);
            const timeout = setTimeout(function () {
                if (self._pendingCmds.has(requestId)) {
                    self._pendingCmds.delete(requestId);
                    reject(new Error('panel-cmd timeout: ' + cmd + ' → ' + panelId));
                }
            }, PANEL_CMD_TIMEOUT_MS);
            self._pendingCmds.set(requestId, {
                resolve: resolve,
                reject:  reject,
                timeout: timeout,
                cmd:     cmd,
                panelId: panelId,
            });
            const msg = {
                type:      'panel-cmd',
                target:    panelId,
                cmd:       cmd,
                args:      args || {},
                requestId: requestId,
            };
            try {
                c.frame.contentWindow.postMessage(msg, '*');
                self._log('out', 'panel-cmd ' + cmd + ' → ' + panelId);
            } catch (e) {
                clearTimeout(timeout);
                self._pendingCmds.delete(requestId);
                self._log('warn', 'sendCommand fail ' + panelId + ': ' + e.message);
                reject(e);
            }
        });
    };

    /** Broadcast a guard self-test request to every chart. */
    MultichartManager.prototype.runGuardSelfTest = function () {
        const msg = { type: 'guard-self-test' };
        for (const c of this.charts.values()) {
            try {
                if (c.directDeliver) c.directDeliver(msg);
                else                 c.frame.contentWindow.postMessage(msg, '*');
            } catch (_) {}
        }
        this._log('info', 'guard self-test requested across ' + this.charts.size + ' charts');
    };

    /** Push a symbol change to all peers (user-driven). */
    MultichartManager.prototype.broadcastSymbol = function (sourceId, symbol) {
        if (!this.syncMode.symbol) return;
        const causationId = uuid();
        for (const c of this.charts.values()) {
            if (c.id === sourceId) continue;
            this._send(c, { type: 'symbol', symbol: symbol, causationId: causationId, source: sourceId });
        }
        this.counters.outFromUser++;
        this._log('out', 'symbol ' + symbol + ' (from ' + sourceId + ') → ' + (this.charts.size - 1) + ' peers');
    };

    /** ───────────────────────────── inbound from iframes ─────────────────── */

    MultichartManager.prototype._onWindowMessage = function (ev) {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object' || !msg.type) return;

        // Identify which chart sent it (by source field set by the bridge)
        const sourceId = msg.source;
        const sourceChart = sourceId ? this.charts.get(sourceId) : null;

        switch (msg.type) {
            case 'bridge-ready':
                if (sourceChart) {
                    sourceChart.ready = true;
                    if (sourceChart.overlay && sourceChart.overlay.parentNode) {
                        sourceChart.overlay.parentNode.removeChild(sourceChart.overlay);
                    }
                    if (sourceChart.mountEl) sourceChart.mountEl.classList.add('ready');
                    this._log('info', 'bridge ready: ' + sourceId);
                    try { this.onChartReady(sourceId); } catch (e) {
                        this._log('warn', 'onChartReady threw: ' + (e && e.message || e));
                    }
                    // Phase 7.2.5: bring the new iframe in line with the
                    // host's current visible range so the user's split
                    // shows the SAME data window across every panel
                    // instead of stale defaults from chart.js init.
                    // Deferred to next tick so the iframe's bridge has
                    // settled (it just sent bridge-ready synchronously
                    // from inside its own message setup).
                    const self = this;
                    setTimeout(function () { self._initialSyncToHost(sourceChart); }, 0);
                }
                return;

            case 'chart-state':
                if (sourceChart && msg.state) {
                    Object.assign(sourceChart.state, msg.state);
                    this.onState(sourceId, sourceChart.state);
                }
                return;

            case 'assertion-report':
                if (msg.ok) this.counters.assertionsOk++;
                else        this.counters.assertionsFail++;
                this.onAssertion(msg);
                if (!msg.ok) {
                    this._log('error', 'PRICE-AXIS ASSERTION FAIL on ' + sourceId
                        + ' (' + msg.syncType + '): ' + (msg.violations || []).join('; '));
                }
                return;

            case 'guard-self-test-result':
                this._log(msg.ok ? 'info' : 'error',
                    'guard self-test ' + sourceId + ': ' + (msg.ok ? 'PASS' : 'FAIL — ' + (msg.failures || []).join('; ')));
                return;

            case 'host-log':
                // Diagnostic line forwarded from inside an iframe (chart-host).
                // Useful for surfacing real-data fetch errors, timeouts, etc.
                this._log(msg.level || 'info', msg.text || '');
                return;

            case 'panel-cmd-ready':
                // Phase 7.2.4 handshake: iframe's panel-cmd-bridge is now
                // listening for commands. Today this is informational only;
                // future versions may use it to flush queued commands.
                this._log('info', 'panel-cmd-ready: ' + sourceId
                    + ' (cmds: ' + (msg.cmds || []).join(',') + ')');
                return;

            case 'panel-focus':
                // Phase 7.2.4 selection: forwarded from panel-cmd-bridge
                // when the user clicks (pointerdown / mousedown / focusin)
                // anywhere inside this iframe. The React grid uses this
                // to update focusedPanelId so subsequent topbar actions
                // (TF, file, …) target this panel. Coalesced inside the
                // iframe so we get at most one message per user action.
                if (sourceId) {
                    try { this.onPanelFocus(sourceId); } catch (e) {
                        this._log('warn', 'onPanelFocus threw: ' + (e && e.message || e));
                    }
                }
                return;

            case 'v9-drawing-tool-cleared':
                // Iframe finished a stroke (finalizeDrawing → clearTool). Parent
                // must drop V9 rail draw mode before multichartFocusChanged
                // re-arms the tool via syncDrawingToolAcrossPanels.
                try {
                    if (typeof globalThis !== 'undefined' && typeof globalThis.dispatchEvent === 'function') {
                        globalThis.dispatchEvent(new CustomEvent('v9DrawingToolCleared', {
                            detail: { panelId: sourceId || null },
                        }));
                    }
                } catch (e) {
                    this._log('warn', 'v9-drawing-tool-cleared dispatch failed: ' + (e && e.message || e));
                }
                return;

            case 'cmd-result': {
                // Phase 7.2.4 reply from panel-cmd-bridge. Route back to
                // the Promise returned by sendCommand so the React-side
                // command bus can chain on the result (e.g. capture the
                // chartId returned from addIndicator).
                if (msg.ok) {
                    this._log('info', 'cmd-result OK ' + sourceId + ' req=' + msg.requestId);
                } else {
                    this._log('warn', 'cmd-result FAIL ' + sourceId
                        + ' req=' + msg.requestId + ' err=' + (msg.error || 'unknown'));
                }
                if (this._pendingCmds && this._pendingCmds.has(msg.requestId)) {
                    const pending = this._pendingCmds.get(msg.requestId);
                    this._pendingCmds.delete(msg.requestId);
                    clearTimeout(pending.timeout);
                    if (msg.ok) pending.resolve(msg.data);
                    else        pending.reject(new Error(msg.error || 'cmd failed'));
                }
                return;
            }

            case 'visibleRange':
                // v10.5.0: also stash the range on the chart record so the
                // shell can persist it as part of the session. This is a
                // pure read-side cache; the fan-out below is unchanged.
                if (sourceChart) {
                    sourceChart.state.visibleStartSec = Number(msg.startTime);
                    sourceChart.state.visibleEndSec   = Number(msg.endTime);
                    this.onState(sourceId, sourceChart.state);
                }
                this._fanOut(msg, sourceId);
                return;

            case 'crosshair':
            case 'crosshair-clear':
            case 'symbol':
                this._fanOut(msg, sourceId);
                return;

            // Phase 7.2.5+: drawing sync. The bridge's monkey-patched
            // broadcastDrawingChange emits these on every add/update/
            // remove/clear from chart.js's drawing tools manager. We
            // simply fan them out to peer panels; their bridges will
            // call chart.receiveDrawingChange which already handles
            // the loop guard via _receivingDrawingSync.
            case 'drawing-add':
            case 'drawing-update':
            case 'drawing-remove':
            case 'drawing-clear':
                this._fanOut(msg, sourceId);
                return;

            case 'iframe-contextmenu':
                // Phase 7.2.6: unified right-click context menu. The iframe
                // suppressed its local chart.js menu and forwarded the click
                // data here. Pass it to the React shell via a callback so it
                // can open the HOST chart's menu at the correct viewport
                // coordinates (computed from the iframe's bounding rect).
                if (sourceId && typeof this.onContextMenu === 'function') {
                    try { this.onContextMenu(sourceId, msg); } catch (e) {
                        this._log('warn', 'onContextMenu threw: ' + (e && e.message || e));
                    }
                }
                return;

            case 'multichart-global-toast':
                // replay-system: "already at end" / session-end toasts from iframe panels.
                if (typeof msg.message === 'string' && msg.message.length) {
                    this._showGlobalReplayToastOnce(msg.message);
                }
                return;

            default:
                // Unknown / non-sandbox messages — ignore
                return;
        }
    };

    // Normalize symbol strings for cross-panel comparison: strip any
    // separator (slash, hyphen, colon, space, dot) and uppercase. So
    // "EUR/USD", "EURUSD", "eur-usd", "EUR USD" all compare equal —
    // matches the convention the order-system already uses on the
    // React side (see MultichartGrid: normalize = s => s.replace(/\//g, '').toUpperCase()).
    /** PEER fan-out with allowlist filter. */
    MultichartManager.prototype._fanOut = function (msg, sourceId) {
        // Allowlist filter on the way through the manager too — defense in depth.
        const cleaned = G.filterForbiddenFields(msg);
        if (cleaned.dropped.length) {
            this.counters.droppedForbidden++;
            this._log('error', 'DROPPED forbidden fields from ' + sourceId + ': ' + cleaned.dropped.join(', '));
        }

        const t = msg.type;

        // Sync-mode gate — when Date/Time range sync is OFF, do not forward
        // visibleRange at all (no "same-symbol exception": that caused iframe
        // pans to move the host while host pans did nothing when host state.symbol
        // lagged iframes).
        if (t === 'crosshair' || t === 'crosshair-clear') {
            if (!this.syncMode.crosshair) return;
        } else if (t === 'visibleRange') {
            if (!this.syncMode.visibleRange) return;
        } else if (t === 'symbol') {
            if (!this.syncMode.symbol) return;
        } else if (t === 'drawing-add' || t === 'drawing-update'
                || t === 'drawing-remove' || t === 'drawing-clear') {
            if (!this.syncMode.drawings) return;
        }

        this.counters.outFromUser++;

        const out = cleaned.clean;
        // PEER topology: fan out to all charts EXCEPT the source.
        for (const c of this.charts.values()) {
            if (c.id === sourceId) continue;
            this._send(c, out);
        }
        this._log('out', t + ' from ' + sourceId + ' → ' + (this.charts.size - 1) + ' peers');
    };

    MultichartManager.prototype._send = function (chartEntry, msg) {
        try {
            if (chartEntry.directDeliver) {
                // Host chart — deliver in-process. Bypasses postMessage so the
                // manager doesn't hear its own outbound back through the
                // 'message' listener and fan it out again. See addHostChart.
                chartEntry.directDeliver(msg);
                return;
            }
            chartEntry.frame.contentWindow.postMessage(msg, '*');
        } catch (e) {
            this._log('warn', 'send fail ' + chartEntry.id + ': ' + e.message);
        }
    };

    MultichartManager.prototype._log = function (level, text) {
        const entry = { ts: Date.now(), level: level, text: text };
        this.onLog(entry);
    };

    global.MultichartManager = MultichartManager;
})(typeof window !== 'undefined' ? window : globalThis);
