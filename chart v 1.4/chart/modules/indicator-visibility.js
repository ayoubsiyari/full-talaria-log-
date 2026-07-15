/**
 * RC-6 Phase 2 — unified indicator visibility read/write helpers.
 */
(function (global) {
    'use strict';

    function rc6IndicatorVisibilityV2Enabled(scope) {
        const g = scope || global;
        return !!(g && g.__TALARIA_RC6_INDICATOR_VISIBILITY_V2 !== false);
    }

    function isIndicatorVolume(indicator) {
        return !!(indicator && (indicator.isVolume || indicator.type === 'volume'));
    }

    function isIndicatorPanel(indicator) {
        if (!indicator) return false;
        return indicator.overlay === false || indicator.separatePanel === true;
    }

    /** Legacy OHLC legend eye read — visible flag only (dual-flag desync). */
    function resolveIndicatorShownLegacy(indicator) {
        if (!indicator) return false;
        return indicator.visible !== false;
    }

    /** Canonical user-visible plot/legend shown state. */
    function resolveIndicatorShown(indicator, chartSettings) {
        if (!indicator) return false;
        if (indicator.style && indicator.style.showLine === false) return false;
        if (isIndicatorVolume(indicator)) {
            return indicator.visible !== false
                && (!chartSettings || chartSettings.showVolume !== false);
        }
        if (isIndicatorPanel(indicator)) {
            return indicator.hidePlot !== true && indicator.hideValues !== true;
        }
        return indicator.visible !== false && indicator.hidePlot !== true;
    }

    function indicatorDataStoreBroken(chart, indicator) {
        if (!chart || !chart.indicators || !chart.indicators.data || !indicator) return true;
        const id = indicator.id;
        const type = String(indicator.type || '').toLowerCase();
        const store = chart.indicators.data[id];
        if (!store) return true;
        if (Array.isArray(store)) return store.length === 0;
        if (type === 'obv') {
            return !store.obv || !Array.isArray(store.obv) || store.obv.length === 0;
        }
        return false;
    }

    function shouldRecalcIndicatorOnShow(chart, indicator, show) {
        if (show === false) return false;
        if (!indicator) return false;
        return indicatorDataStoreBroken(chart, indicator);
    }

    function applyIndicatorVisibilityLegacy(indicator, show, opts, chartSettings) {
        opts = opts || {};
        if (!indicator) return { shown: false, applied: false };
        const on = show !== false;
        const isVolume = opts.isVolume != null ? !!opts.isVolume : isIndicatorVolume(indicator);
        if (isVolume) {
            indicator.visible = on;
            if (chartSettings) chartSettings.showVolume = on;
        } else if (isIndicatorPanel(indicator)) {
            indicator.hidePlot = !on;
            indicator.hideValues = !on;
            if (indicator.visible === false) indicator.visible = true;
        } else {
            indicator.visible = on;
            indicator.hidePlot = false;
        }
        return { shown: resolveIndicatorShownLegacy(indicator), applied: true };
    }

    function applyIndicatorVisibility(indicator, show, opts, chartSettings) {
        opts = opts || {};
        if (!indicator) return { shown: false, applied: false };
        if (!rc6IndicatorVisibilityV2Enabled(global)) {
            return applyIndicatorVisibilityLegacy(indicator, show, opts, chartSettings);
        }
        const on = show !== false;
        const isVolume = opts.isVolume != null ? !!opts.isVolume : isIndicatorVolume(indicator);
        if (isVolume) {
            indicator.visible = on;
            if (chartSettings) chartSettings.showVolume = on;
            indicator.hidePlot = false;
            indicator.hideValues = false;
        } else if (isIndicatorPanel(indicator)) {
            indicator.visible = true;
            indicator.hidePlot = !on;
            indicator.hideValues = !on;
        } else {
            indicator.visible = on;
            indicator.hidePlot = false;
            indicator.hideValues = false;
        }
        return { shown: resolveIndicatorShown(indicator, chartSettings), applied: true };
    }

    global.rc6IndicatorVisibilityV2Enabled = rc6IndicatorVisibilityV2Enabled;
    global.isIndicatorVolume = isIndicatorVolume;
    global.isIndicatorPanel = isIndicatorPanel;
    global.resolveIndicatorShownLegacy = resolveIndicatorShownLegacy;
    global.resolveIndicatorShown = resolveIndicatorShown;
    global.indicatorDataStoreBroken = indicatorDataStoreBroken;
    global.shouldRecalcIndicatorOnShow = shouldRecalcIndicatorOnShow;
    global.applyIndicatorVisibility = applyIndicatorVisibility;
    global.applyIndicatorVisibilityLegacy = applyIndicatorVisibilityLegacy;
})(typeof window !== 'undefined' ? window : globalThis);
