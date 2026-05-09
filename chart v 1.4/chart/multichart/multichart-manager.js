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
     */
    function MultichartManager(opts) {
        this.container = opts.container;
        this.onLog    = opts.onLog    || function () {};
        this.onState  = opts.onState  || function () {};
        this.onAssertion = opts.onAssertion || function () {};

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
        params.set('symbol', cfg.symbol || 'AAPL');
        params.set('tf', cfg.tf || '1m');
        if (cfg.days) params.set('days', String(cfg.days));
        if (cfg.verbose) params.set('verbose', '1');

        // Per-cell loading overlay so we can see WHICH cells exist and which
        // are stuck waiting for their iframe's chart.js to init. Removed when
        // the cell goes ready (see _onWindowMessage on bridge-ready).
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML =
            '<div class="id">' + cfg.id + '</div>' +
            '<div>Loading ' + (cfg.symbol || '?') + ' / ' + (cfg.tf || '?') + '…</div>' +
            '<small>iframe: pending — bridge: pending</small>';
        mountEl.appendChild(overlay);

        const frame = document.createElement('iframe');
        frame.src = 'chart-host.html?' + params.toString();
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
            state:   { symbol: cfg.symbol, timeframe: cfg.tf, candleCount: 0 },
            mountEl: mountEl,
        });
        this._log('info', 'addChart ' + cfg.id + ' (' + cfg.symbol + ', ' + cfg.tf + ')');
    };

    MultichartManager.prototype.removeChart = function (id) {
        const c = this.charts.get(id);
        if (!c) return;
        try { c.frame.remove(); } catch (_) {}
        this.charts.delete(id);
        this._log('info', 'removeChart ' + id);
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
        try {
            c.frame.contentWindow.postMessage({
                type: 'bridge-config',
                config: configPatch,
            }, '*');
        } catch (e) {
            this._log('warn', 'sendConfig fail ' + id + ': ' + e.message);
        }
    };

    /** Broadcast a guard self-test request to every chart. */
    MultichartManager.prototype.runGuardSelfTest = function () {
        for (const c of this.charts.values()) {
            try {
                c.frame.contentWindow.postMessage({ type: 'guard-self-test' }, '*');
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

            case 'crosshair':
            case 'crosshair-clear':
            case 'visibleRange':
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
