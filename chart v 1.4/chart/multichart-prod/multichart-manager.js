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
        this.iframeSrcBuilder = (typeof opts.iframeSrcBuilder === 'function')
            ? opts.iframeSrcBuilder
            : null;

        this.charts = new Map();    // id -> { id, frame, ready, state }
        this.syncMode = {
            crosshair:   true,
            visibleRange: true,
            symbol:      true,
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
    }

    MultichartManager.prototype.dispose = function () {
        global.removeEventListener('message', this._onWindowMessage);
        for (const id of Array.from(this.charts.keys())) this.removeChart(id);
    };

    MultichartManager.prototype.setSyncMode = function (mode) {
        Object.assign(this.syncMode, mode || {});
        this._log('info', 'syncMode = ' + JSON.stringify(this.syncMode));
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
        frame.addEventListener('load', function () {
            self._log('info', 'iframe loaded: ' + cfg.id + ' (waiting for bridge-ready…)');
            const small = overlay.querySelector('small');
            if (small) small.textContent = 'iframe: LOADED — bridge: pending';
            setTimeout(function () {
                const c = self.charts.get(cfg.id);
                if (c && !c.ready) {
                    self._log('error', 'TIMEOUT: ' + cfg.id + ' iframe loaded but bridge never reported ready (chart.js init likely failed — open the iframe directly in a new tab to see its console)');
                    const sm = overlay.querySelector('small');
                    if (sm) sm.textContent = 'iframe: LOADED — bridge: TIMEOUT (chart init failed)';
                }
            }, 5000);
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
     * Only fires when:
     *   • There is a host chart in the map (we never sync iframe-to-iframe
     *     on add — peers reach steady state via normal user interaction).
     *   • The host bridge exposed `readVisibleTimeRange` (it does in v10+).
     *   • The host's data is loaded and the read returned a real range.
     *
     * Visible-range sync is gated by syncMode.visibleRange; if the user
     * has it OFF we skip — they explicitly asked to keep panels independent.
     */
    MultichartManager.prototype._initialSyncToHost = function (newChart) {
        if (!newChart || newChart.host) return;
        if (!this.syncMode.visibleRange) return;
        let host = null;
        for (const c of this.charts.values()) {
            if (c.host) { host = c; break; }
        }
        if (!host || typeof host.directRead !== 'function') return;
        let range = null;
        try { range = host.directRead(); } catch (_) { range = null; }
        if (!range || !Number.isFinite(range.startSec) || !Number.isFinite(range.endSec)) return;
        this._send(newChart, {
            type:        'visibleRange',
            startTime:   range.startSec,
            endTime:     range.endSec,
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

            default:
                // Unknown / non-sandbox messages — ignore
                return;
        }
    };

    /** PEER fan-out with allowlist filter. */
    MultichartManager.prototype._fanOut = function (msg, sourceId) {
        // Allowlist filter on the way through the manager too — defense in depth.
        const cleaned = G.filterForbiddenFields(msg);
        if (cleaned.dropped.length) {
            this.counters.droppedForbidden++;
            this._log('error', 'DROPPED forbidden fields from ' + sourceId + ': ' + cleaned.dropped.join(', '));
        }

        // Sync-mode gate
        const t = msg.type;
        if (t === 'crosshair' || t === 'crosshair-clear') {
            if (!this.syncMode.crosshair) return;
        } else if (t === 'visibleRange') {
            if (!this.syncMode.visibleRange) return;
        } else if (t === 'symbol') {
            if (!this.syncMode.symbol) return;
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
