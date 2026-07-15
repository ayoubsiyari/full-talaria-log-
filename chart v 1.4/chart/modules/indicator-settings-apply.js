/**
 * RC-6 Phase 3 — indicator settings-apply invalidation helpers.
 */
(function (global) {
    'use strict';

    function rc6IndicatorSettingsApplyV2Enabled(scope) {
        const g = scope || global;
        return !!(g && g.__TALARIA_RC6_INDICATOR_SETTINGS_APPLY_V2 !== false);
    }

    function indicatorStorePrimarySeriesLength(store, indicatorType) {
        if (!store) return 0;
        if (Array.isArray(store)) return store.length;
        const type = String(indicatorType || '').toLowerCase();
        if (type === 'rsi' && Array.isArray(store.rsi)) return store.rsi.length;
        if ((type === 'macd' || type === 'ppo') && Array.isArray(store.macd)) return store.macd.length;
        if (type === 'stoch' || type === 'stochastic') {
            if (Array.isArray(store.k)) return store.k.length;
            if (Array.isArray(store.stoch)) return store.stoch.length;
        }
        if (type === 'obv' && Array.isArray(store.obv)) return store.obv.length;
        let max = 0;
        if (typeof store === 'object') {
            Object.keys(store).forEach(function(key) {
                const val = store[key];
                if (Array.isArray(val) && val.length > max) max = val.length;
            });
        }
        return max;
    }

    function indicatorDataMatchesBarCount(chart, indicator) {
        if (!chart || !indicator) return false;
        const barCount = Array.isArray(chart.data) ? chart.data.length : 0;
        if (!barCount) return true;
        if (!chart.indicators || !chart.indicators.data) return false;
        const store = chart.indicators.data[indicator.id];
        if (!store) return false;
        return indicatorStorePrimarySeriesLength(store, indicator.type) === barCount;
    }

    function buildSettingsApplyInvalidation(needsDataRecalc) {
        return {
            bumpRenderVersion: true,
            scheduleRender: true,
            updateOhlc: true,
            persist: true,
            enforceDataLength: !!needsDataRecalc,
            emitSettingsApplied: true,
        };
    }

    function buildSettingsApplyInvalidationLegacy(needsDataRecalc, newParams) {
        const params = newParams || {};
        const bump = params.showLine !== undefined || params.hideFromContainer !== undefined || !!needsDataRecalc;
        return {
            bumpRenderVersion: bump,
            scheduleRender: bump,
            updateOhlc: bump,
            persist: !!needsDataRecalc,
            enforceDataLength: false,
            emitSettingsApplied: false,
        };
    }

    function resolveSettingsApplyInvalidation(needsDataRecalc, newParams) {
        if (rc6IndicatorSettingsApplyV2Enabled(global)) {
            return buildSettingsApplyInvalidation(needsDataRecalc);
        }
        return buildSettingsApplyInvalidationLegacy(needsDataRecalc, newParams);
    }

    /**
     * Apply invalidation contract after settings mutate indicator config.
     * recalcFn(chart, indicator) should refresh indicators.data when enforceDataLength is set.
     */
    function applyIndicatorSettingsInvalidation(chart, indicator, options, hooks) {
        options = options || {};
        hooks = hooks || {};
        if (!chart || !indicator) return { applied: false, matchedBars: false };
        const needsDataRecalc = !!options.needsDataRecalc;
        const contract = resolveSettingsApplyInvalidation(needsDataRecalc, options.newParams);
        let matchedBars = !contract.enforceDataLength
            || indicatorDataMatchesBarCount(chart, indicator);

        if (contract.enforceDataLength && !matchedBars && typeof hooks.recalcFn === 'function') {
            hooks.recalcFn(chart, indicator);
            matchedBars = indicatorDataMatchesBarCount(chart, indicator);
        }

        return {
            applied: true,
            contract: contract,
            matchedBars: matchedBars,
            needsDataRecalc: needsDataRecalc,
        };
    }

    global.rc6IndicatorSettingsApplyV2Enabled = rc6IndicatorSettingsApplyV2Enabled;
    global.indicatorStorePrimarySeriesLength = indicatorStorePrimarySeriesLength;
    global.indicatorDataMatchesBarCount = indicatorDataMatchesBarCount;
    global.buildSettingsApplyInvalidation = buildSettingsApplyInvalidation;
    global.buildSettingsApplyInvalidationLegacy = buildSettingsApplyInvalidationLegacy;
    global.resolveSettingsApplyInvalidation = resolveSettingsApplyInvalidation;
    global.applyIndicatorSettingsInvalidation = applyIndicatorSettingsInvalidation;
})(typeof window !== 'undefined' ? window : globalThis);
