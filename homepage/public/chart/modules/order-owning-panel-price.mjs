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
 * Pick OHLC for a foreign ticker from MultichartGrid / layout peer charts.
 * Prefer sourceFileId match, then ticker. Does NOT require same TF as host —
 * V9 panels often run mixed intervals (EUR 1H + GBP 1m).
 *
 * @param {Array<{currentSymbol?:string,currentFileId?:*,rawData?:Array,data?:Array,liveBar?:object|null}>} peers
 * @param {{tickerNorm:string,tMs:number,preferredFileId?:string|null,normalizeTicker?:Function,barAtOrBefore?:Function}} opts
 * @returns {object|null} bar with at least {t,o,h,l,c}
 */
export function backgroundBarFromPeerCharts(peers, opts = {}) {
    const normalizeTicker = opts.normalizeTicker || normalizeOrderTicker;
    const T = normalizeTicker(opts.tickerNorm);
    const tMs = Number(opts.tMs);
    if (!Number.isFinite(tMs) || !Array.isArray(peers) || !peers.length) return null;
    const pref = opts.preferredFileId != null && String(opts.preferredFileId) !== ''
        ? String(opts.preferredFileId)
        : '';
    const barAtOrBefore = typeof opts.barAtOrBefore === 'function'
        ? opts.barAtOrBefore
        : (bars, t) => {
            if (!Array.isArray(bars) || !bars.length || !Number.isFinite(t)) return null;
            let ans = -1;
            for (let i = 0; i < bars.length; i++) {
                const bt = Number(bars[i] && bars[i].t);
                if (Number.isFinite(bt) && bt <= t) ans = i;
                else if (Number.isFinite(bt) && bt > t) break;
            }
            return ans >= 0 ? bars[ans] : null;
        };

    const pickFromPeer = (pc) => {
        if (!pc) return null;
        const live = pc.liveBar;
        if (live && Number.isFinite(Number(live.t)) && Number(live.t) === tMs) {
            return live;
        }
        const series = Array.isArray(pc.rawData) && pc.rawData.length
            ? pc.rawData
            : (Array.isArray(pc.data) && pc.data.length ? pc.data : null);
        if (!series) return null;
        return barAtOrBefore(series, tMs);
    };

    let byTicker = null;
    for (let i = 0; i < peers.length; i++) {
        const pc = peers[i];
        if (!pc) continue;
        const pcFile = pc.currentFileId != null ? String(pc.currentFileId) : '';
        const pcT = normalizeTicker(pc.currentSymbol);
        if (pref && pcFile && pcFile === pref) {
            const bar = pickFromPeer(pc);
            if (bar) return bar;
        }
        if (T && pcT === T && !byTicker) {
            const bar = pickFromPeer(pc);
            if (bar) byTicker = bar;
        }
    }
    return byTicker;
}

/**
 * Last close from a peer panel showing this ticker (any TF — MultichartGrid mixed intervals).
 */
export function markCloseFromPeerCharts(peers, tickerNorm, normalizeTicker = normalizeOrderTicker) {
    const T = normalizeTicker(tickerNorm);
    if (!T || !Array.isArray(peers)) return null;
    for (let i = 0; i < peers.length; i++) {
        const pc = peers[i];
        if (!pc || normalizeTicker(pc.currentSymbol) !== T) continue;
        if (pc.liveBar) {
            const c = Number.parseFloat(pc.liveBar.c ?? pc.liveBar.close);
            if (Number.isFinite(c)) return c;
        }
        const series = Array.isArray(pc.data) && pc.data.length
            ? pc.data
            : (Array.isArray(pc.rawData) && pc.rawData.length ? pc.rawData : null);
        if (!series || !series.length) continue;
        const last = series[series.length - 1];
        const c = Number.parseFloat(last && (last.c ?? last.close));
        if (Number.isFinite(c)) return c;
    }
    return null;
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
        // Prefer an explicit localCandle when provided — callers must not pass a
        // focused-peer candle as currentCandle for local positions.
        const localCandle = deps && deps.localCandle;
        const bar = localCandle || currentCandle;
        const live = Number.parseFloat(bar && (bar.c ?? bar.close));
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

/** A6-4 Step 3 completion — ready-panels prime via snapshot fan-out (not addOrder). */
export function orderMcReadyPanelsSnapshotV1Enabled(win = {}) {
    if (!orderMcSnapshotProjectionV1Enabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_READY_PANELS_SNAPSHOT_V1;
}

/** Project host tradeJournal onto peers so exit ticks share closePrice / exitMarkerTimeMs. */
export function orderMcJournalSnapshotV1Enabled(win = {}) {
    if (!orderMcSnapshotProjectionV1Enabled(win)) return false;
    return !win.__TALARIA_DISABLE_ORDER_MC_JOURNAL_SNAPSHOT_V1;
}
