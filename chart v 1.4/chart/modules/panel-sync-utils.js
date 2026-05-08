/**
 * Panel synchronisation — pure utility functions.
 *
 * These helpers carry no state and have no dependency on PanelManager
 * (they do not access `this`). Extracted from PanelManager to isolate the
 * algorithmic core from orchestration logic, making them independently
 * testable and reusable (e.g., replay-system.js has its own copy of
 * bsearchTimestamp that could migrate here in the future).
 *
 * PanelManager delegates to these functions and keeps thin wrapper methods
 * (prefixed _) for backward compatibility with external callers such as
 * chart.js that reach in via `window.panelManager._isSamePair(...)`.
 */
const PanelSyncUtils = {

    /**
     * Binary search: return the index of the candle whose timestamp is
     * closest to `ts` in an ascending-by-.t data array.
     *
     * @param {Array<{t:number}>} data
     * @param {number} ts  target Unix timestamp (ms or s — must match data)
     * @returns {number} index in [0, data.length - 1]
     */
    bsearchTimestamp(data, ts) {
        if (!data || data.length === 0) return 0;
        let lo = 0, hi = data.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if ((data[mid].t || 0) < ts) lo = mid + 1;
            else hi = mid;
        }
        if (lo > 0 && Math.abs((data[lo - 1].t || 0) - ts) < Math.abs((data[lo].t || 0) - ts)) {
            return lo - 1;
        }
        return lo;
    },

    /**
     * Return the last index whose candle time is ≤ ts (ascending by .t).
     * Used for date-range scroll alignment.
     *
     * @param {Array<{t:number}>} data
     * @param {number} ts
     * @returns {number}
     */
    findLastIndexAtOrBefore(data, ts) {
        if (!data || data.length === 0) return 0;
        if (!Number.isFinite(ts)) return 0;
        let lo = 0, hi = data.length - 1, ans = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            const t = data[mid]?.t || 0;
            if (t <= ts) { ans = mid; lo = mid + 1; }
            else          { hi = mid - 1; }
        }
        return Math.max(0, Math.min(ans, data.length - 1));
    },

    /**
     * Strict file-ID-based pair identity check.
     *
     * Returns true only when both chart instances have the same non-null
     * currentFileId. Symbol-name fallback is intentionally absent: it
     * causes false positives when a chart briefly clears its fileId while
     * aggregating a higher timeframe, or when two panels show the same
     * ticker from different uploaded files.
     *
     * @param {object} a  chart instance
     * @param {object} b  chart instance
     * @returns {boolean}
     */
    isSamePair(a, b) {
        if (!a || !b) return false;
        if (a === b) return true;
        const normalizeSymbol = (value) => {
            if (value == null) return '';
            return String(value).replace(/\s+/g, '').toUpperCase();
        };
        const sa = normalizeSymbol(a.currentSymbol);
        const sb = normalizeSymbol(b.currentSymbol);
        // Hard cross-pair guard: if both symbols are known and differ, treat as different
        // even when file ids are stale during async pair/timeframe loading.
        if (sa && sb && sa !== sb) return false;
        const fa = a.currentFileId != null ? String(a.currentFileId) : null;
        const fb = b.currentFileId != null ? String(b.currentFileId) : null;
        if (!fa || !fb) return false;
        return fa === fb;
    },

    /**
     * Resolve the chart instance from a panel descriptor.
     * Falls back to window.chart for the main panel (isMainChart flag).
     *
     * @param {object|null} panel
     * @returns {object|null}
     */
    getPanelChartInstance(panel) {
        if (!panel) return null;
        if (panel.chartInstance) return panel.chartInstance;
        if (panel.isMainChart && typeof window !== 'undefined' && window.chart) return window.chart;
        return null;
    }
};
