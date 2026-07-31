/**
 * trade-attribution.js — Policy 3 trade-action ownership resolution.
 *
 * Extracted from chart.js so it can be imported directly by a Node oracle. In chart.js the
 * implementation sat inside 42,000 lines of browser code and resolved charts by walking
 * window.top, so an out-of-browser gate got null for every input and went RED for the wrong
 * reason. The behaviour is unchanged; only its reachability is.
 *
 * Loads as a plain script (installs on window) or as a CommonJS module (module.exports).
 */
(function (global) {
    'use strict';

    /**
     * Collect every reachable Chart instance across a realm and its panel iframes.
     *
     * Deliberately NOT chart.js's _talariaMcDiagCollectCharts: that one filters on
     * `chart._mcDiag`, so a chart with diagnostics disabled would be invisible to it and an
     * order belonging to that chart would silently resolve to null.
     */
    function _talariaCollectChartsForAttribution(win, out, seen) {
        if (!win || seen.has(win)) return out;
        seen.add(win);
        try {
            const chart = win.chart || win.mainChart;
            if (chart && typeof chart === 'object') out.push(chart);
        } catch (_e) { /* cross-origin */ }
        try {
            const frames = win.document ? win.document.querySelectorAll('iframe') : [];
            for (const frame of frames) {
                try {
                    if (frame.contentWindow) _talariaCollectChartsForAttribution(frame.contentWindow, out, seen);
                } catch (_frameErr) { /* cross-origin or not ready */ }
            }
        } catch (_e) { /* ignore */ }
        return out;
    }

    /** Default source: walk the top window and its iframes. */
    function _defaultChartSource() {
        if (typeof global === 'undefined' || !global) return [];
        let root = global;
        try { root = global.top || global; } catch (_e) { root = global; }
        return _talariaCollectChartsForAttribution(root, [], new Set());
    }

    /**
     * Resolve which Chart a trade action belongs to, FROM THE ORDER RECORD ALONE.
     *
     * Policy 3: trade actions resolve through the order record — never focus, never hover,
     * never ambient window.chart, never `this`. A free function precisely so a caller cannot
     * bind it and have that change the answer.
     *
     * The key is `order.sourceFileId`, stamped at order creation from the owning chart's
     * `currentFileId` (order-manager.js _chartSourceFileId), matched back against
     * `chart.currentFileId`.
     *
     * Returns null rather than guessing, in BOTH the no-match and the AMBIGUOUS case. Two
     * panels can legitimately show one file, and in that case the record genuinely does not
     * name an owner — picking the host or the first match would produce a confident,
     * normal-looking, wrong attribution, which is the failure this policy exists to prevent.
     *
     * `chartSource` is an injection seam for out-of-browser callers ONLY. It supplies the
     * SET OF CHARTS TO SEARCH; it does not supply a resolution strategy. Matching is by
     * sourceFileId in every case, so focus-invariance holds whatever is injected — a caller
     * that passes only the focused chart still gets a match by id or null, never "this one
     * because it has focus".
     *
     * @param   {object} order
     * @param   {Array|Function} [chartSource] charts to search, or a function returning them
     * @returns {object|null} the owning Chart instance, or null if unresolvable
     */
    function _resolveTradeJournalAttribution(order, chartSource) {
        if (typeof global !== 'undefined' && global
            && global.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1) {
            return null;
        }
        if (!order || typeof order !== 'object') return null;

        const wanted = order.sourceFileId;
        if (wanted == null || String(wanted) === '') return null;
        const key = String(wanted);

        let charts;
        try {
            if (typeof chartSource === 'function') charts = chartSource();
            else if (Array.isArray(chartSource)) charts = chartSource;
            else charts = _defaultChartSource();
        } catch (_e) { return null; }
        if (!Array.isArray(charts)) return null;

        let match = null;
        for (const chart of charts) {
            let id = null;
            try { id = chart && chart.currentFileId; } catch (_e) { continue; }
            if (id == null || String(id) !== key) continue;
            if (match && match !== chart) return null;   // ambiguous — never guess
            match = chart;
        }
        return match || null;
    }

    const api = {
        _resolveTradeJournalAttribution,
        _talariaCollectChartsForAttribution,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof global !== 'undefined' && global) {
        global._resolveTradeJournalAttribution = _resolveTradeJournalAttribution;
        global._talariaCollectChartsForAttribution = _talariaCollectChartsForAttribution;
        global.TalariaTradeAttribution = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
