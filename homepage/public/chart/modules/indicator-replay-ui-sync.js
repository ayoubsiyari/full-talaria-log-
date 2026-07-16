/**
 * RC-6 Phase 6 (M4) — replay indicator legend / crosshair UI sync helpers.
 */
(function (global) {
    'use strict';

    function rc6IndicatorReplayUiSyncV2Enabled(scope) {
        const g = scope || global;
        return !!(g && g.__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2 !== false);
    }

    function resolveReplayPlayheadBarIndex(chart) {
        if (!chart || !Array.isArray(chart.data) || !chart.data.length) return -1;
        const replay = chart.replaySystem;
        if (!replay || !replay.isActive) return -1;
        return chart.data.length - 1;
    }

    function isReplayLegendPlayheadPinned(chart) {
        return resolveReplayPlayheadBarIndex(chart) >= 0;
    }

    function pinReplayLegendHoverToPlayhead(chart) {
        if (!rc6IndicatorReplayUiSyncV2Enabled(global)) return false;
        const barIdx = resolveReplayPlayheadBarIndex(chart);
        if (barIdx < 0 || !chart) return false;
        chart.hoverIndex = barIdx;
        return true;
    }

    function shouldSyncReplayLegendAfterRecalc(chart) {
        if (!rc6IndicatorReplayUiSyncV2Enabled(global)) return false;
        return isReplayLegendPlayheadPinned(chart);
    }

    function seriesValueAtBarForLegend(arr, barIdx, plotOffset) {
        if (!Array.isArray(arr) || barIdx < 0) return null;
        const off = Number(plotOffset) | 0;
        const src = barIdx - off;
        if (src < 0 || src >= arr.length) return null;
        const v = arr[src];
        if (v === null || v === undefined || Number.isNaN(Number(v)) || !Number.isFinite(Number(v))) return null;
        return Number(v);
    }

    function formatLegendNumericToken(val, decimals) {
        if (!Number.isFinite(val)) return null;
        const dec = Number.isFinite(decimals) ? decimals : 4;
        return Number(val).toFixed(dec);
    }

    function legendTokenMatchesSeriesAtBar(tokenText, seriesVal, decimals) {
        const expected = formatLegendNumericToken(seriesVal, decimals);
        if (expected == null || tokenText == null) return false;
        return String(tokenText).trim() === expected;
    }

    function applyReplayLegendSyncAfterRecalc(chart) {
        if (!shouldSyncReplayLegendAfterRecalc(chart)) return;
        pinReplayLegendHoverToPlayhead(chart);
        if (typeof chart.syncCrosshairIndicatorValues === 'function') {
            chart.syncCrosshairIndicatorValues();
            return;
        }
        if (typeof document === 'undefined') return;
        const idSuffix = (chart.panelIndex !== undefined && chart.panelIndex !== 0) ? chart.panelIndex : '';
        const ohlcDiv = document.getElementById('ohlcIndicators' + idSuffix);
        if (ohlcDiv && typeof global.talariaSyncOhlcIndicatorLegendValues === 'function') {
            global.talariaSyncOhlcIndicatorLegendValues(chart, ohlcDiv);
        }
    }

    function applyReplayLegendLightweightSync(chart) {
        if (!shouldSyncReplayLegendAfterRecalc(chart)) return;
        pinReplayLegendHoverToPlayhead(chart);
        if (typeof document === 'undefined') return;
        const idSuffix = (chart.panelIndex !== undefined && chart.panelIndex !== 0) ? chart.panelIndex : '';
        const ohlcDiv = document.getElementById('ohlcIndicators' + idSuffix);
        if (!ohlcDiv) return;
        if (ohlcDiv.childElementCount === 0 && typeof chart.updateOHLCIndicators === 'function') {
            chart.updateOHLCIndicators();
            return;
        }
        if (typeof global.talariaSyncOhlcIndicatorLegendValues === 'function') {
            global.talariaSyncOhlcIndicatorLegendValues(chart, ohlcDiv);
        }
    }

    global.rc6IndicatorReplayUiSyncV2Enabled = rc6IndicatorReplayUiSyncV2Enabled;
    global.resolveReplayPlayheadBarIndex = resolveReplayPlayheadBarIndex;
    global.isReplayLegendPlayheadPinned = isReplayLegendPlayheadPinned;
    global.pinReplayLegendHoverToPlayhead = pinReplayLegendHoverToPlayhead;
    global.shouldSyncReplayLegendAfterRecalc = shouldSyncReplayLegendAfterRecalc;
    global.seriesValueAtBarForLegend = seriesValueAtBarForLegend;
    global.formatLegendNumericToken = formatLegendNumericToken;
    global.legendTokenMatchesSeriesAtBar = legendTokenMatchesSeriesAtBar;
    global.applyReplayLegendSyncAfterRecalc = applyReplayLegendSyncAfterRecalc;
    global.applyReplayLegendLightweightSync = applyReplayLegendLightweightSync;
})(typeof window !== 'undefined' ? window : globalThis);
