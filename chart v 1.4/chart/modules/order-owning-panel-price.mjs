/**
 * A6-4 Step 0 / D-030 — owning-panel price resolution (pure helpers).
 * Run: node order-owning-panel-price.test.mjs
 */

/** unset = fix ON (never mark/close from focused peer panel feed). */
export function orderOwningPanelPriceV1Enabled(win = {}) {
    return typeof win === 'undefined' || win === null || !win.__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1;
}

export function normalizeOrderTicker(t) {
    return String(t || '').replace(/[/\s]/g, '').toUpperCase();
}

/**
 * True when this document's chart owns the position's instrument (not focused peer).
 * Empty ticker + empty fileId → false (never main-chart OHLC path).
 */
export function positionBelongsOnLocalChart(position, localChart, normalizeTicker = normalizeOrderTicker) {
    if (!position || !localChart) return false;
    const posFileId = position.sourceFileId != null ? String(position.sourceFileId) : '';
    const localFileId = localChart.currentFileId != null ? String(localChart.currentFileId) : '';
    if (posFileId && localFileId) return posFileId === localFileId;
    const posTicker = normalizeTicker(position.ticker || position.symbol);
    const localTicker = normalizeTicker(localChart.currentSymbol);
    if (posTicker && localTicker) return posTicker === localTicker;
    return false;
}

/**
 * Legacy mismatch check used updatePositions — compares position to getActiveChart() ticker.
 */
export function legacyPositionNeedsBackgroundBar(position, activeChartTicker, localChart, normalizeTicker = normalizeOrderTicker) {
    const posTicker = normalizeTicker(position?.ticker || position?.symbol);
    const posFileId = position?.sourceFileId != null ? String(position.sourceFileId) : '';
    const chartTickerForBar = normalizeTicker(activeChartTicker || localChart?.currentSymbol);
    const chartFileId = localChart?.currentFileId != null ? String(localChart.currentFileId) : '';
    const tickerMismatch = !!(posTicker && chartTickerForBar && posTicker !== chartTickerForBar);
    const fileMismatch = !!(posFileId && chartFileId && posFileId !== chartFileId);
    return tickerMismatch || fileMismatch;
}

export function positionNeedsBackgroundBar(position, activeChartTicker, localChart, fixOn, normalizeTicker = normalizeOrderTicker) {
    if (fixOn) {
        return !positionBelongsOnLocalChart(position, localChart, normalizeTicker);
    }
    return legacyPositionNeedsBackgroundBar(position, activeChartTicker, localChart, normalizeTicker);
}

/**
 * Resolve mid mark from owning panel feed only (never conflate focused chart candle with foreign position).
 */
export function resolveOwningPanelMidMarkPrice(position, currentCandle, deps) {
    const {
        normalizeTicker = normalizeOrderTicker,
        getBackgroundBarForTicker,
        markFromPanelDataLastClose,
        resolveBackgroundMarkPrice,
        localChart,
    } = deps || {};
    if (!position || !currentCandle) return null;
    const tMs = Number(currentCandle.t);
    if (!Number.isFinite(tMs)) return null;
    const posTicker = normalizeTicker(position.ticker || position.symbol);
    const pref = position.sourceFileId != null ? String(position.sourceFileId) : null;

    if (positionBelongsOnLocalChart(position, localChart, normalizeTicker)) {
        const live = Number.parseFloat(currentCandle.c);
        if (Number.isFinite(live)) return live;
    }

    if (typeof getBackgroundBarForTicker === 'function') {
        const bgBar = getBackgroundBarForTicker(posTicker || '', tMs, pref);
        if (bgBar) {
            const c = Number.parseFloat(bgBar.c);
            if (Number.isFinite(c)) return c;
        }
    }

    if (typeof markFromPanelDataLastClose === 'function') {
        const panelMc = markFromPanelDataLastClose(posTicker);
        if (Number.isFinite(panelMc)) return panelMc;
    }

    if (typeof resolveBackgroundMarkPrice === 'function') {
        const bg = resolveBackgroundMarkPrice(position, tMs);
        if (Number.isFinite(bg)) return bg;
    }

    return null;
}

/**
 * Close/mark price for a position — RED when peer feed leaks (GBP position @ EUR close).
 */
export function resolvePositionCloseMarkPrice(position, currentCandle, ctx) {
    const {
        fixOn = true,
        activeChartTicker,
        localChart,
        normalizeTicker = normalizeOrderTicker,
        getBackgroundBarForTicker,
        markFromPanelDataLastClose,
        resolveBackgroundMarkPrice,
        legacyResolveMidMarkPrice,
        lastMarkPrice,
    } = ctx || {};

    if (!fixOn && typeof legacyResolveMidMarkPrice === 'function') {
        return legacyResolveMidMarkPrice(position, currentCandle);
    }

    const mid = resolveOwningPanelMidMarkPrice(position, currentCandle, {
        normalizeTicker,
        getBackgroundBarForTicker,
        markFromPanelDataLastClose,
        resolveBackgroundMarkPrice,
        localChart,
    });
    if (Number.isFinite(mid)) return mid;
    const last = Number.parseFloat(lastMarkPrice ?? position?._miLastMarkPrice);
    if (Number.isFinite(last)) return last;
    const openPx = Number.parseFloat(position?.openPrice);
    if (Number.isFinite(openPx)) return openPx;
    return null;
}

/**
 * Property: one order lifecycle must consume exactly one symbol feed (price within owning range).
 */
export function assertMarkWithinOwningSymbolRange(position, markPrice, owningFeedRange, tolerance = 0.05) {
    const px = Number(markPrice);
    const lo = Number(owningFeedRange?.min);
    const hi = Number(owningFeedRange?.max);
    if (!Number.isFinite(px) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
        return { ok: false, reason: 'invalid-input' };
    }
    if (px >= lo - tolerance && px <= hi + tolerance) {
        return { ok: true };
    }
    return { ok: false, reason: 'out-of-range', markPrice: px, lo, hi };
}

/** A6-4 master + step switches (unset = architecture ON). */
export function orderMcStateConvergeFixEnabled(win = {}) {
    return typeof win === 'undefined' || win === null || !win.__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX;
}

export function orderMcHostPersistOnlyV1Enabled(win = {}) {
    if (!orderMcStateConvergeFixEnabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_HOST_PERSIST_ONLY_V1;
}

export function orderMcHostPlaceV1Enabled(win = {}) {
    if (!orderMcStateConvergeFixEnabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_HOST_PLACE_V1;
}

export function orderMcSnapshotProjectionV1Enabled(win = {}) {
    if (!orderMcStateConvergeFixEnabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_PROJECTION_V1;
}

export function orderMcOpenPatchV1Enabled(win = {}) {
    if (!orderMcStateConvergeFixEnabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_OPEN_PATCH_V1;
}

export function orderMcPnlHubV1Enabled(win = {}) {
    if (!orderMcStateConvergeFixEnabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_PNL_HUB_V1;
}

export function orderMcLegacyIframeOrderV1Enabled(win = {}) {
    if (!orderMcStateConvergeFixEnabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_LEGACY_IFRAME_ORDER_V1;
}
