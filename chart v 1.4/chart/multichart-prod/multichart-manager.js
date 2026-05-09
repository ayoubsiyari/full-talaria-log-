/**
 * multichart-manager.js — PRODUCTION COPY
 *
 * Verbatim copy of multichart/multichart-manager.js verified through Phase 6
 * of multi_chart_rebuild_roadmap.md. The only production-specific behavior:
 * iframe `src` defaults to dist-v9 (with ?multichart=1 shim) instead of the
 * sandbox chart-host.html. This is a TEMPLATE override at addChart() call
 * sites in shell.html, not a code change here — keep this file in sync with
 * the sandbox.
 *
 * Parent shell orchestrator. Lives ONLY in the shell page.
 *
 * Responsibilities:
 *   - Manage iframe lifecycle (add / remove charts)
 *   - Receive postMessage from each chart-host iframe
 *   - Apply Phase 0 allowlist filter to all incoming/outgoing payloads
 *   - PEER topology fan-out: any chart's user event broadcasts to all others
 *   - Loop guard via causationId
 *   - Sync mode toggles (crosshair / visibleRange / both / none)
 *   - Symbol broadcast (when one chart changes symbol, all peers follow)
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
     *   container: HTMLElement       — where the iframes are mounted
     *   onLog:    (entry) => void    — receives log lines
     *   onState:  (id, state) => void — receives chart-state updates per chart
     *   onAssertion: (msg) => void   — receives assertion reports
     *   iframeSrcBuilder: (cfg) => string — REQUIRED in production. Returns the
     *      `src` URL for a new iframe given the chart cfg. The sandbox uses
     *      'chart-host.html?...'; production uses '/chart/dist-v9/index.html?multichart=1&...'.
     */
    function MultichartManager(opts) {
        this.container = opts.container;
        this.onLog    = opts.onLog    || function () {};
        this.onState  = opts.onState  || function () {};
        this.onAssertion = opts.onAssertion || function () {};
        this.iframeSrcBuilder = opts.iframeSrcBuilder || function (cfg) {
            // Sandbox-compatible default for tests; production callers MUST
            // supply their own builder so the iframe loads dist-v9.
            const params = new URLSearchParams();
            params.set('id', cfg.id);
            params.set('tf', cfg.tf || '1m');
            if (cfg.fileId) params.set('fileId', String(cfg.fileId));
            return 'chart-host.html?' + params.toString();
        };

        this.charts = new Map();
        this.syncMode = {
            crosshair:   true,
            visibleRange: true,
            symbol:      true,
        };
        this.counters = {
            outFromUser: 0,
            droppedLoop: 0,
            droppedForbidden: 0,
            assertionsOk: 0,
            assertionsFail: 0,
        };
        this._frameOriginCheck = false;

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

    MultichartManager.prototype.addChart = function (cfg, mountEl) {
        if (this.charts.has(cfg.id)) {
            this._log('warn', 'addChart: id already present: ' + cfg.id);
            return;
        }
        const src = this.iframeSrcBuilder(cfg);

        const overlay = document.createElement('div');
        overlay.className = 'mc-loading-overlay';
        overlay.innerHTML =
            '<div class="id">' + cfg.id + '</div>' +
            '<div>Loading panel…</div>' +
            '<small>iframe: pending — bridge: pending</small>';
        mountEl.appendChild(overlay);

        const frame = document.createElement('iframe');
        frame.src = src;
        frame.title = 'Chart ' + cfg.id;
        frame.setAttribute('data-chart-id', cfg.id);
        frame.style.cssText = 'width:100%;height:100%;border:0;display:block;background:#07080E;';
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
            }, 15000);
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
        this._log('info', 'addChart ' + cfg.id + ' (tf=' + (cfg.tf || '?') + ') src=' + src);
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

    MultichartManager.prototype.runGuardSelfTest = function () {
        for (const c of this.charts.values()) {
            try {
                c.frame.contentWindow.postMessage({ type: 'guard-self-test' }, '*');
            } catch (_) {}
        }
        this._log('info', 'guard self-test requested across ' + this.charts.size + ' charts');
    };

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

    MultichartManager.prototype._onWindowMessage = function (ev) {
        const msg = ev.data;
        if (!msg || typeof msg !== 'object' || !msg.type) return;

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

            case 'host-log':
                this._log(msg.level || 'info', msg.text || '');
                return;

            case 'visibleRange':
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
                return;
        }
    };

    MultichartManager.prototype._fanOut = function (msg, sourceId) {
        const cleaned = G.filterForbiddenFields(msg);
        if (cleaned.dropped.length) {
            this.counters.droppedForbidden++;
            this._log('error', 'DROPPED forbidden fields from ' + sourceId + ': ' + cleaned.dropped.join(', '));
        }

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
