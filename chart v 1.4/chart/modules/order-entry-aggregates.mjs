/**
 * RC-5 — pure multi-entry aggregate model + legacy delta simulator for property tests.
 * Node-side only; browser loads the same logic inlined via order-manager.js.
 */

/** @typedef {{ id: number, price: number, amount: number, orderType?: string }} EntryLevel */
/** @typedef {{ side: string, slPrice: number, pipSize: number, pipValuePerLot: number, positionSizeMode: string, totalRiskTarget: number, currentPrice: number, markPrice: number, mainOrderType: string, balance: number, riskPercent: number }} AggregateOpts */

export const ORDER_TYPE_AT_MARKET_TOLERANCE_TICKS = 1;

export function orderTypeReclassifyV2Enabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_TYPE_RECLASSIFY_V2 === '0') return false;
    return true;
}

export function orderTypeOneTickPendingV1Enabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_TYPE_ONE_TICK_PENDING_V1) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_TYPE_ONE_TICK_PENDING_V1 === '0') return false;
    return true;
}

export function classifyOrderTypeForPrice(side, price, currentPrice, opts = {}) {
    const market = Number(currentPrice);
    const entry = Number(price);
    if (!(market > 0) || !(entry > 0)) return opts.mainOrderType || opts.fallback || 'limit';
    const tickSize = Number(opts.tickSize || opts.pipSize || 0.0001);
    const tolerance = tickSize * (orderTypeOneTickPendingV1Enabled() ? 0.25 : ORDER_TYPE_AT_MARKET_TOLERANCE_TICKS);
    if (Math.abs(entry - market) <= tolerance) return 'market';
    const s = String(side || 'BUY').toUpperCase();
    if (s === 'BUY') return entry < market ? 'limit' : 'stop';
    return entry > market ? 'limit' : 'stop';
}

/**
 * Dollar risk at SL for one level (mirrors OrderManager._getMultiEntryLevelRiskUsd).
 * @param {EntryLevel} level
 * @param {AggregateOpts} opts
 * @param {EntryLevel[]} allLevels
 */
export function levelRiskUsd(level, opts, allLevels) {
    const mode = opts.positionSizeMode || 'risk-usd';
    const pipSize = opts.pipSize || 0.0001;
    const pipVal = opts.pipValuePerLot || 10;
    const slPrice = opts.slPrice || 0;

    if (mode === 'lot-size') {
        const slPips = (slPrice > 0 && level.price > 0) ? Math.abs(level.price - slPrice) / pipSize : 0;
        return (level.amount || 0) * slPips * pipVal;
    }
    if (mode === 'risk-percent') {
        const totalRiskUsd = (opts.balance || 100000) * ((opts.riskPercent || 1) / 100);
        const sumW = allLevels.reduce((s, l) => s + (l.amount || 0), 0);
        if (sumW <= 0 || !Number.isFinite(totalRiskUsd)) return 0;
        return totalRiskUsd * ((level.amount || 0) / sumW);
    }
    return level.amount || 0;
}

/**
 * @param {EntryLevel} level
 * @param {AggregateOpts} opts
 * @param {EntryLevel[]} allLevels
 */
export function calcLevelLotSizeNumeric(level, opts, allLevels) {
    if (!level || !level.price || level.price <= 0) return 0;
    const ps = opts.pipSize || 0.0001;
    const pv = opts.pipValuePerLot || 10;
    const mode = opts.positionSizeMode || 'risk-usd';
    if (mode === 'lot-size') return Math.max(0, Number(level.amount) || 0);
    const slPrice = opts.slPrice || 0;
    if (!slPrice || slPrice <= 0) return 0;
    const slPips = Math.abs(level.price - slPrice) / ps;
    if (slPips <= 0) return 0;
    const riskUsd = levelRiskUsd(level, opts, allLevels);
    const v = riskUsd / (slPips * pv);
    return Number.isFinite(v) ? v : 0;
}

/** @param {EntryLevel[]} levels @param {AggregateOpts} opts */
export function sortPricedLevels(levels, opts) {
    const valid = (levels || []).filter((l) => l && l.price > 0);
    const side = (opts.side || 'BUY').toUpperCase();
    return [...valid].sort((a, b) => (side === 'SELL' ? b.price - a.price : a.price - b.price));
}

/**
 * Stack index per level id when multiple legs share the same normalized price.
 * Used to separate overlapping entry hit-targets and close badges (TAL-00752 #10/#20/#22).
 * @param {EntryLevel[]} levels
 * @param {number} [pricePrecision]
 * @returns {Map<number, number>}
 */
export function computeMultiEntryStackIndices(levels, pricePrecision = 5) {
    const prec = Number.isFinite(pricePrecision) && pricePrecision >= 0 ? pricePrecision : 5;
    const priced = (levels || []).filter((l) => l && l.id != null && l.price > 0);
    /** @type {Map<number, number[]>} */
    const groups = new Map();
    for (const l of priced) {
        const key = Number(Number(l.price).toFixed(prec));
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(l.id);
    }
    /** @type {Map<number, number>} */
    const out = new Map();
    for (const ids of groups.values()) {
        ids.forEach((id, i) => out.set(id, i));
    }
    return out;
}

const DEFAULT_SLTP_STEPPER_OFFSET_PIPS = 10;

/**
 * When SL/TP panel value is unset (0), seed stepper base from entry ± offset (TAL-00752 #19).
 * @param {'slPrice'|'tpPrice'|string} fieldId
 * @param {number|string} currentValue
 * @param {number} entryPrice
 * @param {string} [side]
 * @param {number} [pipSize]
 */
export function resolveSltpStepperSeedPrice(fieldId, currentValue, entryPrice, side = 'BUY', pipSize = 0.0001) {
    const v = parseFloat(currentValue);
    if (Number.isFinite(v) && v > 0) return v;
    const entry = Number(entryPrice);
    if (!(entry > 0)) return Number.isFinite(v) ? v : 0;
    const ps = Number(pipSize) > 0 ? Number(pipSize) : 0.0001;
    const offset = ps * DEFAULT_SLTP_STEPPER_OFFSET_PIPS;
    const s = String(side || 'BUY').toUpperCase();
    if (fieldId === 'slPrice') {
        return s === 'BUY' ? entry - offset : entry + offset;
    }
    if (fieldId === 'tpPrice') {
        return s === 'BUY' ? entry + offset : entry - offset;
    }
    return Number.isFinite(v) ? v : 0;
}

export function orderEntryPreviewColorFixEnabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_ENTRY_PREVIEW_COLOR_FIX) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_ENTRY_PREVIEW_COLOR_FIX === '0') return false;
    return true;
}

export function orderEntrySecondEntryOffsetFixEnabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_ENTRY_SECOND_ENTRY_OFFSET_FIX === '0') return false;
    return true;
}

export function orderEntryPendingSlClampFixEnabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_ENTRY_PENDING_SL_CLAMP_FIX) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_ENTRY_PENDING_SL_CLAMP_FIX === '0') return false;
    return true;
}

export function orderEntryCancelCleanupFixEnabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_ENTRY_CANCEL_CLEANUP_FIX) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_ENTRY_CANCEL_CLEANUP_FIX === '0') return false;
    return true;
}

export function orderEntryPanelSltpFixEnabled() {
    if (typeof window !== 'undefined' && window.__TALARIA_DISABLE_ORDER_ENTRY_PANEL_SLTP_FIX) return false;
    if (typeof process !== 'undefined' && process.env?.TALARIA_ORDER_ENTRY_PANEL_SLTP_FIX === '0') return false;
    return true;
}

/** Preview entry line color follows side only — not leg order type (TAL-00752 #1). */
export function resolvePreviewEntryColor(side, legOrderType = 'limit') {
    if (!orderEntryPreviewColorFixEnabled()) {
        const ot = String(legOrderType || '').toLowerCase();
        if (ot === 'stop') return '#f23645';
    }
    return String(side || 'BUY').toUpperCase() === 'BUY' ? '#2962ff' : '#f23645';
}

/**
 * Rule 4 uses per-leg risk instead of total intended risk (TAL-00752 #1/#13).
 * @param {EntryLevel} level
 * @param {AggregateOpts} opts
 * @param {EntryLevel[]} allLevels
 * @param {number} [minLot]
 */
export function multiEntryLegMeetsMinLot(level, opts, allLevels, minLot = 0.01) {
    const mode = opts.positionSizeMode || 'risk-usd';
    const slPrice = opts.slPrice || 0;
    if (mode !== 'lot-size' && (!slPrice || slPrice <= 0)) return true;
    if (!level || !level.price || level.price <= 0) return false;
    const ps = opts.pipSize || 0.0001;
    const pv = opts.pipValuePerLot || 10;
    const side = String(opts.side || 'BUY').toUpperCase();

    if (slPrice > 0) {
        if (side === 'BUY' && level.price <= slPrice) return false;
        if (side === 'SELL' && level.price >= slPrice) return false;
        const distPips = Math.abs(level.price - slPrice) / ps;
        if (distPips < 2) return false;
    }

    const lots = calcLevelLotSizeNumeric(level, opts, allLevels);
    if (!Number.isFinite(lots) || lots < minLot - 1e-6) return false;

    if (!orderEntryPreviewColorFixEnabled()) {
        if (mode !== 'lot-size' && slPrice > 0) {
            let totalRisk = 0;
            if (mode === 'risk-usd') totalRisk = opts.totalRiskTarget || 0;
            else if (mode === 'risk-percent') {
                totalRisk = (opts.balance || 100000) * ((opts.riskPercent || 1) / 100);
            }
            if (totalRisk > 0) {
                const distPips = Math.abs(level.price - slPrice) / ps;
                if (distPips > 0) {
                    const maxLotsAtThisDistance = totalRisk / (distPips * pv);
                    if (lots > maxLotsAtThisDistance * 1.05) return false;
                }
            }
        }
    } else if (mode !== 'lot-size' && slPrice > 0) {
        const legRisk = levelRiskUsd(level, opts, allLevels);
        const distPips = Math.abs(level.price - slPrice) / ps;
        if (distPips > 0 && legRisk > 0) {
            const maxLotsAtThisDistance = legRisk / (distPips * pv);
            if (lots > maxLotsAtThisDistance * 1.05) return false;
        }
    }

    return true;
}

/**
 * Loss-side entry anchor for preview SL clamp on pending limit drafts (TAL-00752 #11).
 * @param {string} side
 * @param {number[]} entryPrices
 */
export function resolvePendingLimitSlEntryAnchor(side, entryPrices) {
    const prices = (entryPrices || []).filter((p) => Number.isFinite(p) && p > 0);
    if (!prices.length) return 0;
    if (!orderEntryPendingSlClampFixEnabled()) {
        return prices.reduce((s, p) => s + p, 0) / prices.length;
    }
    const s = String(side || 'BUY').toUpperCase();
    return s === 'BUY' ? Math.min(...prices) : Math.max(...prices);
}

/**
 * Clamp toward stop-side (limit ladder) vs reward-side (stop ladder).
 * @param {number} proposedPrice
 * @param {number[]} siblingPrices
 * @param {AggregateOpts} opts
 */
function clampMultiEntryPriceForStopPure(proposedPrice, siblingPrices, opts) {
    if (!Number.isFinite(proposedPrice) || proposedPrice <= 0) return proposedPrice;
    const prec = Number.isFinite(opts.pricePrecision) ? opts.pricePrecision : 5;
    const slPrice = opts.slPrice || 0;
    if (!slPrice || slPrice <= 0) return parseFloat(proposedPrice.toFixed(prec));
    const pip = Number(opts.pipSize) > 0 ? Number(opts.pipSize) : 0.0001;
    const sep = Math.max(pip * 0.5, 1e-12);
    const sibs = (siblingPrices || []).filter((p) => Number.isFinite(p) && p > 0);
    const side = String(opts.side || 'BUY').toUpperCase();

    if (side === 'BUY') {
        const ceiling = sibs.length ? Math.min(...sibs) : Infinity;
        if (!(slPrice < ceiling)) return parseFloat(proposedPrice.toFixed(prec));
        let p = Math.max(proposedPrice, slPrice + sep);
        if (Number.isFinite(ceiling) && p >= ceiling - sep) {
            p = Math.max(slPrice + sep, ceiling - Math.max(sep, pip));
        }
        return parseFloat(p.toFixed(prec));
    }

    const floor = sibs.length ? Math.max(...sibs) : -Infinity;
    if (!(slPrice > floor)) return parseFloat(proposedPrice.toFixed(prec));
    let p = Math.min(proposedPrice, slPrice - sep);
    if (Number.isFinite(floor) && p <= floor + sep) {
        p = Math.min(slPrice - sep, floor + Math.max(sep, pip));
    }
    return parseFloat(p.toFixed(prec));
}

/** @param {number} proposedPrice @param {number[]} siblingPrices @param {AggregateOpts} opts */
function clampMultiEntryPriceForRewardPure(proposedPrice, siblingPrices, opts) {
    if (!Number.isFinite(proposedPrice) || proposedPrice <= 0) return proposedPrice;
    const prec = Number.isFinite(opts.pricePrecision) ? opts.pricePrecision : 5;
    const pip = Number(opts.pipSize) > 0 ? Number(opts.pipSize) : 0.0001;
    const sep = Math.max(pip * 0.5, 1e-12);
    const sibs = (siblingPrices || []).filter((p) => Number.isFinite(p) && p > 0);
    const slPrice = opts.slPrice || 0;
    let tpFar = opts.tpPrice || 0;
    const side = String(opts.side || 'BUY').toUpperCase();

    if (side === 'BUY') {
        const sibsMax = sibs.length ? Math.max(...sibs) : -Infinity;
        if (slPrice > 0 && sibs.length) {
            const sibsMin = Math.min(...sibs);
            if (!(slPrice < sibsMin)) return parseFloat(proposedPrice.toFixed(prec));
        }
        let p = proposedPrice;
        if (slPrice > 0) p = Math.max(p, slPrice + sep);
        if (Number.isFinite(sibsMax)) p = Math.max(p, sibsMax + Math.max(sep, pip));
        if (tpFar > 0) p = Math.min(p, tpFar - Math.max(sep, pip));
        return parseFloat(p.toFixed(prec));
    }

    const sibsMin = sibs.length ? Math.min(...sibs) : Infinity;
    if (slPrice > 0 && sibs.length) {
        const sibsMax = Math.max(...sibs);
        if (!(slPrice > sibsMax)) return parseFloat(proposedPrice.toFixed(prec));
    }
    let p = proposedPrice;
    if (slPrice > 0) p = Math.min(p, slPrice - sep);
    if (Number.isFinite(sibsMin)) p = Math.min(p, sibsMin - Math.max(sep, pip));
    if (tpFar > 0) p = Math.max(p, tpFar + Math.max(sep, pip));
    return parseFloat(p.toFixed(prec));
}

/**
 * Default second multi-entry price: limit ladders step toward market, not TP (TAL-00752 #9).
 * @param {string} side
 * @param {string} orderType
 * @param {number} mainPrice
 * @param {number[]} siblingPrices
 * @param {AggregateOpts} opts
 */
export function resolveDefaultSecondEntryPrice(side, orderType, mainPrice, siblingPrices, opts = {}) {
    if (!(mainPrice > 0)) return 0;
    const s = String(side || 'BUY').toUpperCase();
    const ot = String(orderType || 'limit').toLowerCase();
    const pip = Number(opts.pipSize) > 0 ? Number(opts.pipSize) : 0.0001;
    const step = Math.max(mainPrice * 0.001, pip * 10);
    const offsetDir = s === 'SELL' ? -1 : 1;

    if (!orderEntrySecondEntryOffsetFixEnabled()) {
        const rawLegacy = mainPrice + offsetDir * step;
        return clampMultiEntryPriceForRewardPure(rawLegacy, siblingPrices, { ...opts, side: s });
    }

    const towardMarket = ot === 'limit' || ot === 'market';
    const raw = towardMarket
        ? mainPrice - offsetDir * step
        : mainPrice + offsetDir * step;
    const clampFn = towardMarket ? clampMultiEntryPriceForStopPure : clampMultiEntryPriceForRewardPure;
    return clampFn(raw, siblingPrices, { ...opts, side: s });
}

/**
 * Pure recompute-from-entries aggregate model (RC-5 fix).
 * @param {EntryLevel[]} entries
 * @param {AggregateOpts} opts
 */
export function computeOrderEntryAggregates(entries, opts = {}) {
    const sorted = sortPricedLevels(entries, opts);
    if (sorted.length === 0) {
        return {
            averageEntry: 0,
            totalLots: 0,
            minEntry: 0,
            maxEntry: 0,
            riskSplit: [],
            legs: [],
            mainLegId: null,
            riskSplitSum: 0,
        };
    }

    const totalAmount = sorted.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const target = opts.positionSizeMode === 'risk-percent'
        ? 100
        : (opts.totalRiskTarget || totalAmount);

    const riskSplit = sorted.map((l, i) => {
        let pct;
        if (totalAmount > 0) {
            pct = Math.round((l.amount / totalAmount) * 100);
        } else {
            pct = Math.round(100 / sorted.length);
        }
        return { id: l.id, percentage: pct, amount: l.amount, isMain: i === 0 };
    });
    const pctSum = riskSplit.reduce((s, r) => s + r.percentage, 0);
    if (pctSum !== Math.round(target) && riskSplit.length > 0) {
        riskSplit[riskSplit.length - 1].percentage += Math.round(target) - pctSum;
    }

    let totalWeighted = 0;
    let totalLots = 0;
    for (const l of sorted) {
        const lots = calcLevelLotSizeNumeric(l, opts, sorted);
        if (lots > 0) {
            totalWeighted += l.price * lots;
            totalLots += lots;
        }
    }
    let averageEntry = 0;
    if (totalLots > 0) {
        averageEntry = totalWeighted / totalLots;
    } else if (totalAmount > 0) {
        averageEntry = sorted.reduce((s, l) => s + l.price * (Number(l.amount) || 0), 0) / totalAmount;
    } else {
        averageEntry = sorted.reduce((s, l) => s + l.price, 0) / sorted.length;
    }

    const prices = sorted.map((l) => l.price);
    const minEntry = Math.min(...prices);
    const maxEntry = Math.max(...prices);
    const mark = opts.markPrice ?? opts.currentPrice ?? 0;
    const side = (opts.side || 'BUY').toUpperCase();

    const legs = sorted.map((l, i) => {
        const lots = calcLevelLotSizeNumeric(l, opts, sorted);
        const rs = riskSplit.find((r) => r.id === l.id);
        const fallbackOrderType = l.orderType || (i === 0 ? (opts.mainOrderType || 'limit') : (opts.mainOrderType || 'limit'));
        const orderType = orderTypeReclassifyV2Enabled()
            ? classifyOrderTypeForPrice(side, l.price, opts.currentPrice, { ...opts, fallback: fallbackOrderType })
            : fallbackOrderType;
        let pnlAtMark = 0;
        if (lots > 0 && mark > 0) {
            pnlAtMark = estimatePnL(side, l.price, mark, lots, opts);
        }
        return {
            id: l.id,
            price: l.price,
            amount: l.amount,
            percentage: rs ? rs.percentage : 0,
            orderType,
            lots,
            pnlAtMark,
            isMain: i === 0,
        };
    });

    return {
        averageEntry,
        totalLots,
        minEntry,
        maxEntry,
        riskSplit,
        legs,
        mainLegId: sorted[0].id,
        riskSplitSum: riskSplit.reduce((s, r) => s + r.percentage, 0),
    };
}

/** @param {string} side @param {number} entry @param {number} mark @param {number} lots */
export function estimatePnL(side, entry, mark, lots, opts = {}) {
    const pipSize = opts.pipSize || 0.0001;
    const pipVal = opts.pipValuePerLot || 10;
    const dir = (side || 'BUY').toUpperCase();
    const diff = dir === 'BUY' ? mark - entry : entry - mark;
    const pips = diff / pipSize;
    return pips * pipVal * lots;
}

function autoDetectOrderType(side, price, currentPrice, fallback) {
    if (!(currentPrice > 0)) return fallback;
    const s = (side || 'BUY').toUpperCase();
    if (s === 'BUY') return price > currentPrice ? 'stop' : 'limit';
    return price < currentPrice ? 'stop' : 'limit';
}

/** Rebalance amounts to target (mirrors _rebalanceLevelAmountsToTarget). */
export function rebalanceLevelAmountsToTarget(levels, opts) {
    const mode = opts.positionSizeMode || 'risk-usd';
    let totalTarget = 0;
    if (mode === 'risk-usd') totalTarget = opts.totalRiskTarget || 100;
    else if (mode === 'risk-percent') totalTarget = 100;
    else if (mode === 'lot-size') totalTarget = opts.totalRiskTarget || 1;
    if (totalTarget <= 0 || !levels.length) return;

    const n = levels.length;
    const currentSum = levels.reduce((s, l) => s + (l.amount || 0), 0);
    if (currentSum <= 0) {
        if (mode === 'risk-percent') {
            const base = Math.floor(100 / n);
            levels.forEach((l, i) => { l.amount = i < n - 1 ? base : 100 - base * (n - 1); });
        } else {
            const each = Math.round(totalTarget / n);
            levels.forEach((l) => { l.amount = each; });
            const newSum = levels.reduce((s, l) => s + l.amount, 0);
            const diff = Math.round(totalTarget) - newSum;
            if (diff !== 0) levels[n - 1].amount += diff;
        }
        return;
    }
    const scale = totalTarget / currentSum;
    if (mode === 'risk-percent') {
        levels.forEach((l) => { l.amount = Math.round((l.amount || 0) * scale); });
        const newSum = levels.reduce((s, l) => s + l.amount, 0);
        const diff = 100 - newSum;
        if (diff !== 0 && n > 0) levels[n - 1].amount += diff;
    } else {
        levels.forEach((l) => { l.amount = Math.round((l.amount || 0) * scale); });
        const newSum = levels.reduce((s, l) => s + l.amount, 0);
        const diff = Math.round(totalTarget) - newSum;
        if (diff !== 0 && n > 0) levels[n - 1].amount += diff;
    }
}

/**
 * Legacy delta-mutated aggregate state (pre-RC-5-fix behavior for RED property tests).
 * Mirrors incremental paths: _syncSplitEntriesFromMultiEntryLevels else-branch,
 * order-type auto-detect on drag, cached average not refreshed on delta sync.
 */
export function createLegacyAggregateState(levels, opts) {
    const state = {
        levels: levels.map((l) => ({ ...l })),
        splitEntries: [],
        mainOrderType: opts.mainOrderType || 'limit',
        cachedAverage: 0,
        opts: { ...opts },
    };
    legacyFullSyncSplitEntries(state);
    return state;
}

function legacyFullSyncSplitEntries(state) {
    const sorted = sortPricedLevels(state.levels, state.opts);
    state.splitEntries = [];
    if (sorted.length <= 1) {
        state.cachedAverage = sorted[0]?.price || 0;
        return;
    }
    const totalAmount = sorted.reduce((s, l) => s + (l.amount || 0), 0);
    for (let i = 1; i < sorted.length; i++) {
        const lvl = sorted[i];
        const pct = totalAmount > 0
            ? Math.round((lvl.amount / totalAmount) * 100)
            : Math.round(100 / sorted.length);
        let orderType = lvl.orderType || state.mainOrderType;
        orderType = autoDetectOrderType(state.opts.side, lvl.price, state.opts.currentPrice, orderType);
        state.splitEntries.push({
            id: i,
            price: lvl.price,
            percentage: pct,
            orderType,
            multiEntryLevelId: lvl.id,
        });
    }
    const agg = computeOrderEntryAggregates(state.levels, state.opts);
    state.cachedAverage = agg.averageEntry;
}

/** Delta sync — matches _syncSplitEntriesFromMultiEntryLevels else branch (stale %). */
export function legacyDeltaSyncSplitEntries(state) {
    const sorted = sortPricedLevels(state.levels, state.opts);
    if (sorted.length <= 1) {
        state.splitEntries = [];
        state.cachedAverage = sorted[0]?.price || 0;
        return;
    }
    const needCount = sorted.length - 1;
    if (state.splitEntries.length !== needCount) {
        legacyFullSyncSplitEntries(state);
        return;
    }
    for (let i = 1; i < sorted.length; i++) {
        const lvl = sorted[i];
        const se = state.splitEntries[i - 1];
        if (!se) continue;
        se.price = lvl.price;
        se.multiEntryLevelId = lvl.id;
    }
}

/** @param {ReturnType<typeof createLegacyAggregateState>} state @param {number} id @param {number} newPrice */
export function legacyMoveEntry(state, id, newPrice) {
    const level = state.levels.find((l) => l.id === id);
    if (!level) return;
    level.price = newPrice;
    legacyDeltaSyncSplitEntries(state);
    const cp = state.opts.currentPrice || 0;
    if (cp > 0) {
        const newType = autoDetectOrderType(state.opts.side, newPrice, cp, state.mainOrderType);
        if (state.levels[0]?.id === id) {
            state.mainOrderType = newType;
        }
        const se = state.splitEntries.find((e) => e.multiEntryLevelId === id);
        if (se) se.orderType = newType;
        level.orderType = newType;
    }
}

/** @param {ReturnType<typeof createLegacyAggregateState>} state */
export function legacyReadAggregates(state) {
    const sorted = sortPricedLevels(state.levels, state.opts);
    const prices = sorted.map((l) => l.price);
    const minEntry = prices.length ? Math.min(...prices) : 0;
    const maxEntry = prices.length ? Math.max(...prices) : 0;
    const mark = state.opts.markPrice ?? state.opts.currentPrice ?? 0;
    const side = (state.opts.side || 'BUY').toUpperCase();

    const mainLeg = sorted[0];
    const mainType = state.mainOrderType;
    const splitSum = state.splitEntries.reduce((s, e) => s + e.percentage, 0);
    const mainPct = sorted.length > 1
        ? Math.max(0, 100 - splitSum)
        : 100;

    const legs = sorted.map((l, i) => {
        const lots = calcLevelLotSizeNumeric(l, state.opts, sorted);
        const orderType = i === 0
            ? mainType
            : (state.splitEntries.find((e) => e.multiEntryLevelId === l.id)?.orderType || l.orderType || mainType);
        const pct = i === 0
            ? mainPct
            : (state.splitEntries.find((e) => e.multiEntryLevelId === l.id)?.percentage || 0);
        let pnlAtMark = 0;
        if (lots > 0 && mark > 0) pnlAtMark = estimatePnL(side, l.price, mark, lots, state.opts);
        return { id: l.id, price: l.price, orderType, percentage: pct, lots, pnlAtMark, isMain: i === 0 };
    });

    return {
        averageEntry: state.cachedAverage,
        minEntry,
        maxEntry,
        riskSplitSum: mainPct + splitSum,
        legs,
        mainLegId: mainLeg?.id ?? null,
        mainOrderType: mainType,
    };
}

/** @param {object} agg @param {AggregateOpts} opts @param {string} initialMainType */
export function checkAggregateInvariants(agg, opts, initialMainType) {
    const violations = [];
    const tol = 1e-9;
    const side = (opts.side || 'BUY').toUpperCase();

    if (agg.averageEntry > 0 && agg.minEntry > 0 && agg.maxEntry > 0) {
        if (agg.averageEntry < agg.minEntry - tol || agg.averageEntry > agg.maxEntry + tol) {
            violations.push({
                code: 'avg-in-range',
                msg: `average ${agg.averageEntry} not in [${agg.minEntry}, ${agg.maxEntry}]`,
            });
        }
    }

    const target = opts.positionSizeMode === 'risk-percent' ? 100 : null;
    if (target != null && agg.legs.length > 0) {
        const sum = agg.riskSplitSum ?? agg.legs.reduce((s, l) => s + (l.percentage || 0), 0);
        if (Math.abs(sum - target) > 0.5) {
            violations.push({ code: 'risk-split-sum', msg: `risk split sum ${sum} != ${target}` });
        }
    }

    for (const leg of agg.legs || []) {
        const expectedType = classifyOrderTypeForPrice(side, leg.price, opts.currentPrice, opts);
        if (leg.orderType !== expectedType) {
            violations.push({
                code: 'order-type-reclassify',
                msg: `leg ${leg.id} classified ${leg.orderType}, expected ${expectedType} vs market ${opts.currentPrice}`,
            });
        }
    }

    const mark = opts.markPrice ?? opts.currentPrice ?? 0;
    if (mark > 0) {
        for (const leg of agg.legs || []) {
            if (!(leg.lots > 0) || !(leg.price > 0)) continue;
            if (side === 'BUY' && mark < leg.price && leg.pnlAtMark > tol) {
                violations.push({
                    code: 'pnl-sign-long',
                    msg: `positive PNL ${leg.pnlAtMark} below long entry ${leg.price} at mark ${mark}`,
                });
            }
            if (side === 'SELL' && mark > leg.price && leg.pnlAtMark > tol) {
                violations.push({
                    code: 'pnl-sign-short',
                    msg: `positive PNL ${leg.pnlAtMark} above short entry ${leg.price} at mark ${mark}`,
                });
            }
        }
    }

    return violations;
}
