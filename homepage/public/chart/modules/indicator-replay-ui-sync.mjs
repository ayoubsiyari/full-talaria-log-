/**
 * RC-6 Phase 6 (M4) — replay indicator legend / crosshair UI sync helpers.
 * Node property tests import this module; browser mirrors logic in indicator-replay-ui-sync.js.
 */

/** @param {object} [scope] */
export function resolveScope(scope) {
    if (scope) return scope;
    if (typeof globalThis !== 'undefined') return globalThis;
    return {};
}

/** Enable-style switch — default ON (consistent with M1–M5). */
export function rc6IndicatorReplayUiSyncV2Enabled(scope) {
    const g = resolveScope(scope);
    return !!(g && g.__TALARIA_RC6_INDICATOR_REPLAY_UI_SYNC_V2 !== false);
}

/** Last visible bar index while replay mode is active. */
export function resolveReplayPlayheadBarIndex(chart) {
    if (!chart || !Array.isArray(chart.data) || !chart.data.length) return -1;
    const replay = chart.replaySystem;
    if (!replay || !replay.isActive) return -1;
    return chart.data.length - 1;
}

export function isReplayLegendPlayheadPinned(chart) {
    return resolveReplayPlayheadBarIndex(chart) >= 0;
}

/** @param {object} chart @param {object} [scope] */
export function pinReplayLegendHoverToPlayhead(chart, scope) {
    if (!rc6IndicatorReplayUiSyncV2Enabled(scope)) return false;
    const barIdx = resolveReplayPlayheadBarIndex(chart);
    if (barIdx < 0 || !chart) return false;
    chart.hoverIndex = barIdx;
    return true;
}

/** @param {object} chart @param {object} [scope] */
export function shouldSyncReplayLegendAfterRecalc(chart, scope) {
    if (!rc6IndicatorReplayUiSyncV2Enabled(scope)) return false;
    return isReplayLegendPlayheadPinned(chart);
}

/** Pure series read for property tests (matches legend offset semantics). */
export function seriesValueAtBarForLegend(arr, barIdx, plotOffset) {
    if (!Array.isArray(arr) || barIdx < 0) return null;
    const off = Number(plotOffset) | 0;
    const src = barIdx - off;
    if (src < 0 || src >= arr.length) return null;
    const v = arr[src];
    if (v === null || v === undefined || Number.isNaN(Number(v)) || !Number.isFinite(Number(v))) return null;
    return Number(v);
}

export function formatLegendNumericToken(val, decimals) {
    if (!Number.isFinite(val)) return null;
    const dec = Number.isFinite(decimals) ? decimals : 4;
    return Number(val).toFixed(dec);
}

export function legendTokenMatchesSeriesAtBar(tokenText, seriesVal, decimals) {
    const expected = formatLegendNumericToken(seriesVal, decimals);
    if (expected == null || tokenText == null) return false;
    return String(tokenText).trim() === expected;
}
