/**
 * Economic calendar (News sidebar) — Finnhub via chart API.
 * Loads calendar events for the chart’s bar date range (or visible window when history is long) so axis markers stay correct when panning.
 */
(function () {
    'use strict';

    var FILTER_STORAGE_KEY = 'economicCalendarFilters';

    var state = {
        events: [],
        tab: 'upcoming',
        query: '',
        loaded: false,
        loadedRangeKey: null,
        loading: false,
        error: null,
        countdownTimer: null,
        replayDayReloadTimer: null,
        /** User filters: impact toggles, optional chart-pair-only, optional country subset. */
        filters: {
            impactHigh: true,
            impactMedium: true,
            impactLow: false,
            pairOnly: true,
            /** Empty = all countries; otherwise list of 2-letter (or EU) codes from country multiselect. */
            countryCodes: []
        }
    };

    /** Bumps when a new calendar fetch starts so stale async completions do not overwrite state. */
    var calendarLoadId = 0;
    var calendarPanDebounceTimer = null;

    /**
     * Accumulated events for time-axis markers only. `state.events` is replaced each fetch for the
     * news list; this object keeps prior loads so flags do not vanish when panning to another date range.
     * Keys: stableEventKey(e) -> event object.
     */
    var chartMarkerEventByKey = {};

    function stableEventKey(e) {
        if (!e || !Number.isFinite(e.t)) return '';
        var ev = e.event != null ? String(e.event) : '';
        var ck = e.countryKey != null ? String(e.countryKey) : '';
        return e.t + '|' + ck + '|' + ev.slice(0, 160);
    }

    function mergeIntoChartMarkerCache(list) {
        if (!list || !list.length) return;
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            var k = stableEventKey(e);
            if (k) chartMarkerEventByKey[k] = e;
        }
    }

    /** Drop cached markers far outside loaded bars so memory stays bounded. */
    function pruneChartMarkerCache() {
        var ch = mainChart();
        if (!ch || !ch.data || ch.data.length === 0) return;
        var t0 = ch.data[0].t;
        var t1 = ch.data[ch.data.length - 1].t;
        var minT = Math.min(t0, t1) - 21 * 86400000;
        var maxT = Math.max(t0, t1) + 21 * 86400000;
        for (var key in chartMarkerEventByKey) {
            if (!Object.prototype.hasOwnProperty.call(chartMarkerEventByKey, key)) continue;
            var e = chartMarkerEventByKey[key];
            if (!e || !Number.isFinite(e.t) || e.t < minT || e.t > maxT) {
                delete chartMarkerEventByKey[key];
            }
        }
    }

    function clearChartMarkerCache() {
        chartMarkerEventByKey = {};
        _axisEventsCacheFp = '';
        _axisEventsCacheArr = null;
    }

    /** Fingerprint for getEvents() memo — chart redraws often; avoid sorting/filtering hundreds of rows every frame. */
    var _axisEventsCacheFp = '';
    var _axisEventsCacheArr = null;

    function axisEventsCacheFingerprint() {
        var sym = '';
        try {
            var ch = mainChart();
            if (ch && ch.currentSymbol != null) sym = String(ch.currentSymbol);
        } catch (e0) {}
        var nk = 0;
        for (var k in chartMarkerEventByKey) {
            if (Object.prototype.hasOwnProperty.call(chartMarkerEventByKey, k)) nk++;
        }
        return nk + '|' + (state.loadedRangeKey || '') + '|' + (state.events ? state.events.length : 0) + '|' + sym + '|' + JSON.stringify(state.filters);
    }

    function mainChart() {
        return window.chart || window.mainChart || null;
    }

    /**
     * Time at the right edge of the chart viewport, clamped to loaded bars only (no extrapolation),
     * so "now" matches what the user sees as the latest candle.
     */
    function chartViewportEndTimeMs(ch) {
        if (!ch || !Array.isArray(ch.data) || ch.data.length === 0) return NaN;
        var data = ch.data;
        var maxIdx = data.length - 1;
        var m = ch.margin || { l: 0, r: 0 };
        var w = ch.w;
        var idx = maxIdx;
        if (typeof ch.pixelToDataIndex === 'function' && Number.isFinite(w) && w > 0) {
            var plotRight = w - m.r;
            var raw = ch.pixelToDataIndex(plotRight);
            if (Number.isFinite(raw)) {
                idx = raw;
            }
        }
        idx = Math.max(0, Math.min(maxIdx, idx));
        if (typeof ch.estimateTimestampForDataIndex === 'function') {
            var t = ch.estimateTimestampForDataIndex(idx);
            if (Number.isFinite(t)) return t;
        }
        var bar = data[idx];
        return (bar && Number.isFinite(bar.t)) ? bar.t : NaN;
    }

    /**
     * "Now" for calendar UI: replay virtual time when replay is active; otherwise the chart viewport's
     * latest visible bar time (not wall clock). Keeps Previous / Upcoming / countdowns aligned with candles.
     */
    function referenceNowMs() {
        var ch = mainChart();
        var rs = ch && ch.replaySystem;
        if (rs && rs.isActive) {
            if (Number.isFinite(rs.replayTimestamp)) {
                return rs.replayTimestamp;
            }
            var idx = rs.currentIndex;
            var fr = rs.fullRawData;
            if (Array.isArray(fr) && Number.isFinite(idx) && fr[idx] && Number.isFinite(fr[idx].t)) {
                return fr[idx].t;
            }
            var cd = ch && ch.data;
            if (Array.isArray(cd) && cd.length && Number.isFinite(idx) && cd[idx] && Number.isFinite(cd[idx].t)) {
                return cd[idx].t;
            }
        }
        if (ch && Array.isArray(ch.data) && ch.data.length > 0) {
            var tView = chartViewportEndTimeMs(ch);
            if (Number.isFinite(tView)) return tView;
        }
        return Date.now();
    }

    /** Local YYYY-MM-DD for a timestamp (matches chart date display for that instant). */
    function isoDateLocal(ms) {
        var d = new Date(ms);
        var y = d.getFullYear();
        var mo = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + mo + '-' + day;
    }

    /** Finnhub allows from/to range; one day when no bars, full span when short series, visible window when very long. */
    var MAX_CALENDAR_FETCH_DAYS = 120;
    var lastFetchFinishedAt = 0;
    var FETCH_COOLDOWN_MS = 5000;

    /** Always fetch through at least this many days after reference "now" so the Upcoming tab can show a full week. */
    var UPCOMING_NEWS_DAYS_AHEAD = 7;

    /**
     * Extend `toStr` (YYYY-MM-DD) so calendar data includes reference-now + UPCOMING_NEWS_DAYS_AHEAD.
     * Finnhub range is inclusive; string compare is valid for ISO dates.
     */
    function ensureUpcomingWeekHorizon(range) {
        var refMs = referenceNowMs();
        if (!Number.isFinite(refMs)) refMs = Date.now();
        var minEndStr = isoDateLocal(refMs + UPCOMING_NEWS_DAYS_AHEAD * 86400000);
        var toStr = range.toStr;
        if (toStr < minEndStr) {
            toStr = minEndStr;
        }
        return { fromStr: range.fromStr, toStr: toStr, rangeKey: range.fromStr + '|' + toStr };
    }

    function getCalendarFetchRange() {
        var ch = mainChart();
        if (!ch || !ch.data || ch.data.length === 0) {
            var d = isoDateLocal(referenceNowMs());
            return ensureUpcomingWeekHorizon({ fromStr: d, toStr: d, rangeKey: d + '|' + d });
        }
        var data = ch.data;
        var t0 = data[0].t;
        var t1 = data[data.length - 1].t;
        var minT = Math.min(t0, t1);
        var maxT = Math.max(t0, t1);
        var spanDays = Math.max(1, Math.ceil((maxT - minT) / 86400000) + 1);

        if (spanDays <= MAX_CALENDAR_FETCH_DAYS) {
            var fs = isoDateLocal(minT);
            var ts = isoDateLocal(maxT);
            return ensureUpcomingWeekHorizon({ fromStr: fs, toStr: ts, rangeKey: fs + '|' + ts });
        }

        var m = ch.margin || { l: 0, r: 0 };
        var w = ch.w;
        var edgeBuf = 8;
        var startIdx = 0;
        var endIdx = data.length;
        if (typeof ch.pixelToDataIndex === 'function' && Number.isFinite(w) && w > 0) {
            var plotRight = w - m.r;
            startIdx = Math.max(0, Math.floor(ch.pixelToDataIndex(m.l)) - edgeBuf);
            endIdx = Math.min(data.length, Math.ceil(ch.pixelToDataIndex(plotRight)) + edgeBuf);
        } else {
            var refMs = referenceNowMs();
            if (!Number.isFinite(refMs)) refMs = data[Math.floor(data.length / 2)].t;
            var padMs = Math.floor(MAX_CALENDAR_FETCH_DAYS / 2) * 86400000;
            minT = Math.max(minT, refMs - padMs);
            maxT = Math.min(maxT, refMs + padMs);
            var fsWin = isoDateLocal(minT);
            var tsWin = isoDateLocal(maxT);
            return ensureUpcomingWeekHorizon({ fromStr: fsWin, toStr: tsWin, rangeKey: fsWin + '|' + tsWin });
        }
        var i0 = Math.min(Math.max(0, startIdx), data.length - 1);
        var i1 = Math.max(i0, Math.min(data.length - 1, Math.max(0, endIdx - 1)));
        var minTV = data[i0].t;
        var maxTV = data[i1].t;
        minT = Math.min(minTV, maxTV);
        maxT = Math.max(minTV, maxTV);
        minT -= 86400000;
        maxT += 86400000;
        var fsVis = isoDateLocal(minT);
        var tsVis = isoDateLocal(maxT);
        return ensureUpcomingWeekHorizon({ fromStr: fsVis, toStr: tsVis, rangeKey: fsVis + '|' + tsVis });
    }

    function newsPanelIsActive() {
        var el = document.getElementById('newsContent');
        if (el && el.classList.contains('active')) return true;
        try {
            return !!window.__v9NewsPanelActive;
        } catch (err) {
            return false;
        }
    }

    /** Active chart ticker (e.g. EURUSD) — not used for FILE_* placeholders. */
    function getCurrentChartSymbol() {
        var ch = mainChart();
        var s = ch && ch.currentSymbol ? String(ch.currentSymbol) : '';
        if (!s || /^FILE_/i.test(s)) {
            try {
                if (typeof window !== 'undefined' && window.__v9ChartSymbol) {
                    s = String(window.__v9ChartSymbol);
                }
            } catch (err) {}
        }
        if (!s || /^FILE_/i.test(s)) return '';
        return s;
    }

    /**
     * Parse six-letter FX/metal spot symbols (EURUSD, XAUUSD). Returns null if unknown shape.
     */
    function parseForexPair(sym) {
        if (!sym) return null;
        var s = String(sym).toUpperCase().replace(/[^A-Z]/g, '');
        if (s.length < 6) return null;
        s = s.slice(0, 6);
        if (!/^[A-Z]{6}$/.test(s)) return null;
        return { base: s.slice(0, 3), quote: s.slice(3, 6) };
    }

    /**
     * Finnhub calendar uses country (often ISO2) and sometimes currency. Map each FX leg to regions/codes.
     */
    var CCY_TO_REGION_CODES = {
        USD: ['US', 'USA'],
        EUR: ['EU', 'EZ', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'GR', 'FI'],
        GBP: ['GB', 'UK'],
        JPY: ['JP'],
        AUD: ['AU'],
        NZD: ['NZ'],
        CAD: ['CA'],
        CHF: ['CH'],
        XAU: ['US', 'EU', 'EZ', 'GB', 'DE', 'FR'],
        XAG: ['US', 'EU', 'EZ', 'GB', 'DE', 'FR'],
        CNY: ['CN'],
        CNH: ['CN'],
        HKD: ['HK'],
        SGD: ['SG'],
        TRY: ['TR'],
        ZAR: ['ZA'],
        MXN: ['MX'],
        NOK: ['NO'],
        SEK: ['SE'],
        DKK: ['DK'],
        PLN: ['PL'],
        RUB: ['RU'],
        INR: ['IN'],
        BRL: ['BR'],
        KRW: ['KR'],
        THB: ['TH'],
        ILS: ['IL'],
        BTC: ['US'],
        ETH: ['US']
    };

    function normCountryToken(raw) {
        var c = String(raw || '').trim().toUpperCase();
        if (!c) return '';
        if (c.length <= 3) return c;
        if (c.indexOf('UNITED STATES') !== -1) return 'US';
        if (c.indexOf('UNITED KINGDOM') !== -1) return 'GB';
        if (c.indexOf('EMU') !== -1 || c.indexOf('EURO AREA') !== -1) return 'EU';
        if (c.indexOf('CHINA') !== -1 || c === 'CN' || c.indexOf('PRC') !== -1) return 'CN';
        return c;
    }

    function currencyLegMatchesEvent(ccy, eventCountry, eventCurrency) {
        ccy = String(ccy || '').toUpperCase();
        if (!ccy) return false;
        var ecu = String(eventCurrency || '').trim().toUpperCase();
        if (ecu === ccy) {
            // Finnhub often duplicates the quote currency in `currency` even for foreign releases
            // (e.g. China GDP with currency USD). For the USD leg, require US-relevant geography.
            if (ccy === 'USD') {
                var rawCo = String(eventCountry || '').toUpperCase();
                if (rawCo.indexOf('UNITED STATES') !== -1 || rawCo === 'USA' || rawCo === 'US') {
                    return true;
                }
                var usRegs = CCY_TO_REGION_CODES['USD'];
                var ctShort = normCountryToken(eventCountry);
                for (var ui = 0; ui < usRegs.length; ui++) {
                    if (ctShort === usRegs[ui]) return true;
                }
                return false;
            }
            return true;
        }
        var cty = normCountryToken(eventCountry);
        var regions = CCY_TO_REGION_CODES[ccy];
        if (!regions || !regions.length) {
            return cty.length >= 2 && cty.slice(0, 2) === ccy.slice(0, 2);
        }
        for (var i = 0; i < regions.length; i++) {
            var r = regions[i];
            if (cty === r || (cty.length >= 2 && cty.slice(0, 2) === r.slice(0, 2))) return true;
        }
        return false;
    }

    /**
     * Energy / petroleum inventory & rig data: tied to US country so they matched the USD leg,
     * but they are not typical FX macro drivers for pairs like AUD/USD (user expects rates/CPI/NFP, not NGAS).
     */
    function isCommodityEnergyInventoryEvent(e) {
        var name = (e && e.event ? String(e.event) : '').toUpperCase();
        if (!name) return false;
        var patterns = [
            'NGAS', 'NAT GAS', 'NATURAL GAS', 'EIA NGAS', 'EIA NAT',
            'CRUDE OIL', 'WTI', 'BRENT', 'PETROLEUM STATUS', 'PETROLEUM INVENT',
            'GASOLINE INVENT', 'DISTILLATE', 'HEATING OIL', 'CUSHING',
            'OIL INVENT', 'GAS INVENT', 'SPR RELEASE', 'STRATEGIC PETROLEUM',
            'RIG COUNT', 'BAKER HUGHES', 'EIA CRUDE', 'EIA PETROLEUM'
        ];
        for (var i = 0; i < patterns.length; i++) {
            if (name.indexOf(patterns[i]) !== -1) return true;
        }
        // Short "CRUDE"/" OIL " can catch titles like "US Crude Oil Inventories"
        if (name.indexOf('CRUDE') !== -1 && (name.indexOf('INVENT') !== -1 || name.indexOf('STOCK') !== -1)) return true;
        return false;
    }

    function eventMatchesChartPair(e, pair) {
        if (!pair) return true;
        var ok = (
            currencyLegMatchesEvent(pair.base, e.country, e.currency) ||
            currencyLegMatchesEvent(pair.quote, e.country, e.currency)
        );
        if (!ok) return false;
        if (isCommodityEnergyInventoryEvent(e)) return false;
        return true;
    }

    function loadFiltersFromStorage() {
        try {
            var raw = localStorage.getItem(FILTER_STORAGE_KEY);
            if (!raw) return;
            var o = JSON.parse(raw);
            if (!o || typeof o !== 'object') return;
            if (typeof o.impactHigh === 'boolean') state.filters.impactHigh = o.impactHigh;
            if (typeof o.impactMedium === 'boolean') state.filters.impactMedium = o.impactMedium;
            if (typeof o.impactLow === 'boolean') state.filters.impactLow = o.impactLow;
            if (typeof o.pairOnly === 'boolean') state.filters.pairOnly = o.pairOnly;
            if (Array.isArray(o.countryCodes)) {
                state.filters.countryCodes = o.countryCodes.filter(function (x) {
                    return typeof x === 'string' && x.length > 0;
                });
            }
        } catch (err) {}
    }
    loadFiltersFromStorage();

    function saveFiltersToStorage() {
        try {
            localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(state.filters));
        } catch (err) {}
    }

    function passesImpactFilter(e) {
        var im = e.impact;
        if (im === 'high' && state.filters.impactHigh) return true;
        if (im === 'medium' && state.filters.impactMedium) return true;
        if (im === 'low' && state.filters.impactLow) return true;
        return false;
    }

    function passesCountryUserFilter(e) {
        var codes = state.filters.countryCodes;
        if (!codes || codes.length === 0) return true;
        var k = e.countryKey || countryCode(e.country || '');
        if (!k) return false;
        return codes.indexOf(k) !== -1;
    }

    /** Sidebar + chart markers: impact, optional countries, optional chart-pair-only. */
    function passesUserFilters(e) {
        if (!passesImpactFilter(e)) return false;
        if (!passesCountryUserFilter(e)) return false;
        if (!state.filters.pairOnly) return true;
        var pair = parseForexPair(getCurrentChartSymbol());
        // If we cannot resolve a 6-letter FX pair, do not show every release — that looked like a broken filter.
        if (!pair) return false;
        return eventMatchesChartPair(e, pair);
    }

    function isMultichartEmbedIframe() {
        try {
            if (window.parent === window) return false;
            return new URLSearchParams(window.location.search || '').get('multichart') === '1';
        } catch (e) {
            return false;
        }
    }

    function canUseParentCalendarSource() {
        if (!isMultichartEmbedIframe()) return false;
        try {
            var parentApi = window.parent.__economicCalendarForChart;
            return !!(parentApi && typeof parentApi.getSourceEvents === 'function');
        } catch (e) {
            return false;
        }
    }

    function getParentNewsFilters() {
        try {
            var ui = window.parent.__economicCalendarUi;
            if (ui && typeof ui.getStatus === 'function') {
                var st = ui.getStatus();
                if (st && st.filters) {
                    return cloneNewsFilters(st.filters);
                }
            }
        } catch (e2) {}
        return null;
    }

    function cloneNewsFilters(f) {
        if (!f || typeof f !== 'object') return null;
        return {
            impactHigh: !!f.impactHigh,
            impactMedium: !!f.impactMedium,
            impactLow: !!f.impactLow,
            pairOnly: !!f.pairOnly,
            countryCodes: Array.isArray(f.countryCodes) ? f.countryCodes.slice() : []
        };
    }

    /** Live parent filters, else last host broadcast snapshot (multichart iframe). */
    function getEffectiveNewsFiltersForEmbed() {
        var pf = getParentNewsFilters();
        if (pf) return pf;
        try {
            if (window.__multichartMirroredNewsFilters) {
                return cloneNewsFilters(window.__multichartMirroredNewsFilters);
            }
        } catch (e0) {}
        return null;
    }

    function snapshotNewsFilters() {
        return cloneNewsFilters(state.filters);
    }

    function invalidateAxisEventsCache() {
        _axisEventsCacheFp = '';
        _axisEventsCacheArr = null;
    }

    /** Apply host filter snapshot on iframe tiles — no Finnhub refetch or rebroadcast. */
    function applyMirroredNewsFilters(filters) {
        var f = cloneNewsFilters(filters);
        if (!f) return;
        try { window.__multichartMirroredNewsFilters = f; } catch (e0) {}
        state.filters.impactHigh = f.impactHigh;
        state.filters.impactMedium = f.impactMedium;
        state.filters.impactLow = f.impactLow;
        state.filters.pairOnly = f.pairOnly;
        state.filters.countryCodes = f.countryCodes.slice();
        invalidateAxisEventsCache();
    }

    /** Raw marker rows (before user filters) from the local Finnhub cache. */
    function collectMarkerSourceEvents() {
        var source = [];
        var keys = Object.keys(chartMarkerEventByKey);
        if (keys.length > 0) {
            for (var ki = 0; ki < keys.length; ki++) {
                source.push(chartMarkerEventByKey[keys[ki]]);
            }
        } else if (state.events && state.events.length) {
            source = state.events.slice();
        }
        if (source.length) {
            source.sort(function (a, b) { return a.t - b.t; });
        }
        return source;
    }

    function filterSourceEvents(source, filters) {
        if (!source || !source.length) return [];
        if (!filters) return [];
        var saved = state.filters;
        state.filters = filters;
        var out = source.filter(passesUserFilters);
        state.filters = saved;
        return out;
    }

    /** Host-only: tell multichart iframe tiles to repaint time-axis news markers. */
    function requestMultichartNewsMarkerRedraw() {
        if (isMultichartEmbedIframe()) return;
        try {
            var grid = window.__multichartGrid;
            if (grid && typeof grid.broadcastToIframesNoReply === 'function') {
                grid.broadcastToIframesNoReply('redrawEconomicNewsMarkers', {
                    filters: snapshotNewsFilters()
                });
            }
        } catch (e) {}
    }

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function parseTime(raw) {
        if (raw == null) return null;
        if (typeof raw === 'number') {
            return raw < 1e12 ? raw * 1000 : raw;
        }
        var str = String(raw).trim();
        var d = Date.parse(str);
        if (!Number.isNaN(d)) return d;
        if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(str) && /\d{4}-\d{2}-\d{2}/.test(str)) {
            d = Date.parse(str.replace(' ', 'T') + 'Z');
            if (!Number.isNaN(d)) return d;
        }
        return null;
    }

    function countryCode(raw) {
        var c = String(raw || '').trim().toUpperCase();
        if (c === 'USA' || c === 'UNITED STATES') return 'US';
        if (c === 'UK' || c === 'UNITED KINGDOM') return 'GB';
        if (c.indexOf('CHINA') !== -1 || c === 'CN' || c.indexOf('PRC') !== -1) return 'CN';
        if (c.length === 2) return c;
        if (c.length > 2) return c.slice(0, 2);
        return '';
    }

    function flagEmoji(code) {
        var c = countryCode(code);
        if (!c || c.length !== 2) return '🌐';
        if (c === 'EU') return '🇪🇺';
        var A = 0x1f1e6;
        var a = c.charCodeAt(0) - 65;
        var b = c.charCodeAt(1) - 65;
        if (a < 0 || a > 25 || b < 0 || b > 25) return '🌐';
        return String.fromCodePoint(A + a, A + b);
    }

    /**
     * Same currency→region mapping as FlagSvg in TalariaV8bLive.jsx (EUR→EU, CHF→CH, …).
     * Used for flag CDN URLs so chart markers match the news rail flags.
     */
    function calendarFlagCode(raw) {
        var up = String(raw || '').trim().toUpperCase();
        var curMap = { EUR: 'EU', JPY: 'JP', USD: 'US', GBP: 'GB', AUD: 'AU', CAD: 'CA', CHF: 'CH', NZD: 'NZ' };
        if (curMap[up]) return curMap[up];
        return countryCode(raw);
    }

    function flagImageUrl(raw) {
        var code = calendarFlagCode(raw);
        if (!code || code.length !== 2) return null;
        return 'https://flagcdn.com/w40/' + code.toLowerCase() + '.png';
    }

    function impactClass(raw) {
        var im = raw;
        if (typeof im === 'number') {
            if (im >= 3) return 'high';
            if (im === 2) return 'medium';
            return 'low';
        }
        var s = String(im || '').toLowerCase();
        if (s.indexOf('high') !== -1 || s === '3') return 'high';
        if (s.indexOf('medium') !== -1 || s === '2') return 'medium';
        if (s.indexOf('low') !== -1 || s === '1') return 'low';
        return 'medium';
    }

    function fmtVal(v, unit) {
        if (v === null || v === undefined || v === '') return '-';
        if (typeof v === 'number' && !Number.isFinite(v)) return '-';
        var u = unit ? String(unit) : '';
        if (typeof v === 'number') {
            if (u === '%' || u === 'percent') return v + '%';
            return String(v);
        }
        return String(v);
    }

    function prevValueClass(str) {
        var n = parseFloat(String(str).replace(/[^0-9.-]/g, ''));
        if (!Number.isFinite(n)) return '';
        if (n > 0) return 'positive';
        if (n < 0) return 'negative';
        return '';
    }

    function normalizeRaw(raw) {
        var t = parseTime(raw.time || raw.date || raw.datetime);
        if (t == null) return null;
        var ev = raw.event || raw.name || raw.title || 'Economic event';
        var country = raw.country || '';
        var currency = raw.currency != null && raw.currency !== '' ? String(raw.currency) : '';
        var unit = raw.unit || raw.unitType || '';
        var est = raw.estimate != null ? raw.estimate : raw.forecast;
        var prev = raw.prev != null ? raw.prev : raw.previous;
        return {
            t: t,
            event: ev,
            country: country,
            currency: currency,
            countryKey: countryCode(country || currency) || '',
            flagEmoji: flagEmoji(country || currency),
            impact: impactClass(raw.impact),
            actual: fmtVal(raw.actual, unit),
            forecast: fmtVal(est, unit),
            previous: fmtVal(prev, unit),
            prevRaw: prev,
            unit: unit
        };
    }

    function timeParts(ms) {
        var d = new Date(ms);
        var hh = String(d.getHours()).padStart(2, '0');
        var mm = String(d.getMinutes()).padStart(2, '0');
        var y = d.getFullYear();
        var mo = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return { clock: hh + ':' + mm, dateStr: y + '.' + mo + '.' + day };
    }

    function formatCountdown(msUntil) {
        if (msUntil <= 0) return '—';
        var sec = Math.floor(msUntil / 1000);
        var s = sec % 60;
        var m = Math.floor(sec / 60) % 60;
        var h = Math.floor(sec / 3600) % 24;
        var d = Math.floor(sec / 86400);
        var parts = [];
        if (d > 0) parts.push(d + 'd');
        if (h > 0 || d > 0) parts.push(h + 'h');
        parts.push(m + 'm');
        parts.push(s + 's');
        return '- ' + parts.join(' ');
    }

    function filterEvents() {
        var q = state.query.trim().toLowerCase();
        var now = referenceNowMs();
        if (!Number.isFinite(now)) {
            now = Date.now();
        }
        var list = state.events.filter(function (e) {
            if (!passesUserFilters(e)) return false;
            var upcoming = e.t >= now;
            if (state.tab === 'upcoming' && !upcoming) return false;
            if (state.tab === 'previous' && upcoming) return false;
            if (!q) return true;
            var hay = (e.event + ' ' + e.country + ' ' + e.currency).toLowerCase();
            return hay.indexOf(q) !== -1;
        });
        if (state.tab === 'previous') {
            list.sort(function (a, b) { return b.t - a.t; });
        } else {
            list.sort(function (a, b) { return a.t - b.t; });
        }
        return list;
    }

    function renderItem(e) {
        var now = referenceNowMs();
        if (!Number.isFinite(now)) now = Date.now();
        var tp = timeParts(e.t);
        var upcoming = e.t >= now;
        var cd = upcoming ? formatCountdown(e.t - now) : '—';
        var flag = flagEmoji(e.country || e.currency);
        var prevCls = prevValueClass(e.previous);

        var impactBars = '';
        var ic = e.impact;
        if (ic === 'high') {
            impactBars = '<div class="news-impact high"><span class="news-impact-bar"></span><span class="news-impact-bar"></span><span class="news-impact-bar"></span></div>';
        } else if (ic === 'medium') {
            impactBars = '<div class="news-impact medium"><span class="news-impact-bar"></span><span class="news-impact-bar"></span><span class="news-impact-bar"></span></div>';
        } else {
            impactBars = '<div class="news-impact low"><span class="news-impact-bar"></span><span class="news-impact-bar"></span><span class="news-impact-bar"></span></div>';
        }

        var actualShow = upcoming ? '-' : e.actual;

        return (
            '<div class="news-item" data-event-ms="' + e.t + '">' +
            '<div class="news-item-header">' +
            '<span class="news-time">' + escapeHtml(tp.clock) + '</span>' +
            '<span class="news-countdown">' + escapeHtml(cd) + '</span>' +
            '</div>' +
            '<div class="news-item-title">' +
            '<span class="news-flag">' + flag + '</span>' +
            impactBars +
            '<span class="news-event-name">' + escapeHtml(e.event) + '</span>' +
            '</div>' +
            '<div class="news-event-date">' + escapeHtml(tp.dateStr) + '</div>' +
            '<div class="news-values">' +
            '<span class="news-value"><span class="news-value-label">Actual:</span> <span class="news-value-data">' + escapeHtml(String(actualShow)) + '</span></span>' +
            '<span class="news-value"><span class="news-value-label">Forecast:</span> <span class="news-value-data">' + escapeHtml(e.forecast) + '</span></span>' +
            '<span class="news-value"><span class="news-value-label">Previous:</span> <span class="news-value-data' + (prevCls ? ' ' + prevCls : '') + '">' + escapeHtml(e.previous) + '</span></span>' +
            '</div></div>'
        );
    }

    function allNewsItemRoots() {
        return document.querySelectorAll('[id="newsItems"]');
    }

    function setNewsItemsHtml(html) {
        var roots = allNewsItemRoots();
        for (var i = 0; i < roots.length; i++) {
            roots[i].innerHTML = html;
        }
    }

    function dispatchCalendarUpdated() {
        try {
            if (typeof window !== 'undefined' && window.dispatchEvent) {
                window.dispatchEvent(new CustomEvent('economicCalendarUpdated'));
            }
        } catch (err) {}
    }

    function render() {
        var hasRoots = allNewsItemRoots().length > 0;

        if (state.loading) {
            var rng = getCalendarFetchRange();
            var loadLabel = rng.fromStr === rng.toStr
                ? escapeHtml(rng.fromStr)
                : escapeHtml(rng.fromStr) + ' – ' + escapeHtml(rng.toStr);
            if (hasRoots) {
                setNewsItemsHtml(
                    '<div class="news-loading" style="padding:24px;text-align:center;color:#6a6a7a;">Loading calendar for ' +
                    loadLabel + '…</div>'
                );
            }
            dispatchCalendarUpdated();
            return;
        }
        if (state.error) {
            if (hasRoots) {
                setNewsItemsHtml('<div style="padding:20px;color:#ef4444;font-size:13px;">' + escapeHtml(state.error) + '</div>');
            }
            dispatchCalendarUpdated();
            return;
        }
        var list = filterEvents();
        if (!list.length) {
            var hint = 'No events match your filters or search. Try other impact levels, countries, or clear the search.';
            if (hasRoots) {
                setNewsItemsHtml('<div style="padding:24px;text-align:center;color:#6a6a7a;">' + escapeHtml(hint) + '</div>');
            }
            dispatchCalendarUpdated();
            return;
        }
        if (hasRoots) {
            setNewsItemsHtml(list.map(renderItem).join(''));
        }
        dispatchCalendarUpdated();
    }

    function tickCountdowns() {
        var now = referenceNowMs();
        if (!Number.isFinite(now)) now = Date.now();
        var nodes = document.querySelectorAll('[id="newsItems"] .news-item[data-event-ms]');
        for (var i = 0; i < nodes.length; i++) {
            var node = nodes[i];
            var ms = parseInt(node.getAttribute('data-event-ms'), 10);
            if (!Number.isFinite(ms)) continue;
            var cd = node.querySelector('.news-countdown');
            if (!cd) continue;
            if (ms >= now) {
                cd.textContent = formatCountdown(ms - now);
            } else {
                cd.textContent = '—';
            }
        }
    }

    function startCountdownLoop() {
        if (state.countdownTimer) clearInterval(state.countdownTimer);
        state.countdownTimer = setInterval(tickCountdowns, 1000);
    }

    function stopCountdownLoop() {
        if (state.countdownTimer) {
            clearInterval(state.countdownTimer);
            state.countdownTimer = null;
        }
    }

    function detailFromJson(j, status) {
        if (!j || typeof j !== 'object') return 'HTTP ' + status;
        var d = j.detail;
        if (typeof d === 'string') return d;
        if (Array.isArray(d) && d.length && d[0].msg) {
            return d.map(function (x) { return x.msg; }).join(' ');
        }
        if (j.error) return String(j.error);
        return 'HTTP ' + status;
    }

    async function loadCalendar(force) {
        if (state.loading && !force) return;
        if (!force && lastFetchFinishedAt && (Date.now() - lastFetchFinishedAt < FETCH_COOLDOWN_MS)) return;
        var myId = ++calendarLoadId;
        state.loading = true;
        state.error = null;
        render();

        try {
            var rng = getCalendarFetchRange();
            var fromStr = rng.fromStr;
            var toStr = rng.toStr;
            var url = '/api/finnhub/calendar/economic?from=' + encodeURIComponent(fromStr) + '&to=' + encodeURIComponent(toStr);
            var r = await fetch(url, { method: 'GET', credentials: 'include' });
            var j = await r.json().catch(function () { return {}; });
            if (!r.ok) {
                throw new Error(detailFromJson(j, r.status));
            }
            if (j.error) throw new Error(j.error);
            var rawList = j.economicCalendar || j.data || [];
            if (!Array.isArray(rawList)) rawList = [];
            var out = [];
            for (var i = 0; i < rawList.length; i++) {
                var n = normalizeRaw(rawList[i]);
                if (n) out.push(n);
            }
            out.sort(function (a, b) { return a.t - b.t; });
            if (myId !== calendarLoadId) return;
            state.events = out;
            mergeIntoChartMarkerCache(out);
            pruneChartMarkerCache();
            state.loaded = true;
            state.loadedRangeKey = rng.rangeKey;
        } catch (err) {
            if (myId !== calendarLoadId) return;
            state.error = (err && err.message) ? String(err.message) : 'Failed to load calendar';
            // Keep existing events visible on error — don't clear flags from chart
            if (!state.events || state.events.length === 0) {
                state.loaded = false;
                state.loadedRangeKey = null;
            }
        } finally {
            if (myId !== calendarLoadId) return;
            lastFetchFinishedAt = Date.now();
            state.loading = false;
            render();
            startCountdownLoop();
            requestChartMarkerRedraw();
            requestMultichartNewsMarkerRedraw();
            syncFilterControlsToDom();
        }
    }

    function syncFilterControlsToDom() {
        document.querySelectorAll('.news-filter-impact-high').forEach(function (el) {
            el.checked = state.filters.impactHigh;
        });
        document.querySelectorAll('.news-filter-impact-med').forEach(function (el) {
            el.checked = state.filters.impactMedium;
        });
        document.querySelectorAll('.news-filter-impact-low').forEach(function (el) {
            el.checked = state.filters.impactLow;
        });
        document.querySelectorAll('.news-filter-pair-only').forEach(function (el) {
            el.checked = state.filters.pairOnly;
        });
        rebuildCountryMultiselect();
    }

    function rebuildCountryMultiselect() {
        var lists = document.querySelectorAll('.news-country-filter-list');
        if (!lists.length) return;
        var seen = {};
        var rows = [];
        state.events.forEach(function (e) {
            var k = e.countryKey || countryCode(e.country || '');
            if (!k || seen[k]) return;
            seen[k] = true;
            rows.push({ code: k, label: (e.country && String(e.country).trim()) ? e.country : k });
        });
        rows.sort(function (a, b) { return a.label.localeCompare(b.label); });
        var codes = state.filters.countryCodes;
        var allCountries = !codes || codes.length === 0;
        var html = rows.map(function (row) {
            var sel = allCountries || codes.indexOf(row.code) !== -1;
            return (
                '<label class="news-country-item">' +
                '<input type="checkbox" class="news-country-filter-cb" value="' + escapeHtml(row.code) + '"' + (sel ? ' checked' : '') + '/>' +
                '<span class="news-country-item-code">' + escapeHtml(row.code) + '</span>' +
                '<span class="news-country-item-name">' + escapeHtml(row.label) + '</span>' +
                '</label>'
            );
        }).join('');
        for (var s = 0; s < lists.length; s++) {
            lists[s].innerHTML = html;
        }
    }

    function applyFiltersFromUi() {
        var h = document.querySelector('.news-filter-impact-high');
        var m = document.querySelector('.news-filter-impact-med');
        var l = document.querySelector('.news-filter-impact-low');
        var p = document.querySelector('.news-filter-pair-only');
        if (h) state.filters.impactHigh = !!h.checked;
        if (m) state.filters.impactMedium = !!m.checked;
        if (l) state.filters.impactLow = !!l.checked;
        if (p) state.filters.pairOnly = !!p.checked;
        document.querySelectorAll('.news-filter-impact-high').forEach(function (el) { el.checked = state.filters.impactHigh; });
        document.querySelectorAll('.news-filter-impact-med').forEach(function (el) { el.checked = state.filters.impactMedium; });
        document.querySelectorAll('.news-filter-impact-low').forEach(function (el) { el.checked = state.filters.impactLow; });
        document.querySelectorAll('.news-filter-pair-only').forEach(function (el) { el.checked = state.filters.pairOnly; });
        var primaryList = document.querySelector('.news-country-filter-list');
        if (primaryList) {
            var cbs = primaryList.querySelectorAll('.news-country-filter-cb');
            var total = cbs.length;
            var picked = [];
            for (var i = 0; i < cbs.length; i++) {
                if (cbs[i].checked) picked.push(cbs[i].value);
            }
            if (picked.length === 0 || picked.length === total) {
                state.filters.countryCodes = [];
            } else {
                state.filters.countryCodes = picked.slice();
            }
        }
        var allC = !state.filters.countryCodes || state.filters.countryCodes.length === 0;
        document.querySelectorAll('.news-country-filter-list').forEach(function (lst) {
            if (lst === primaryList) return;
            lst.querySelectorAll('.news-country-filter-cb').forEach(function (cb) {
                cb.checked = allC || state.filters.countryCodes.indexOf(cb.value) !== -1;
            });
        });
        saveFiltersToStorage();
        render();
        requestChartMarkerRedraw();
    }

    var filtersWired = false;
    function bindNewsFilters() {
        if (filtersWired) return;
        filtersWired = true;
        document.addEventListener('change', function (e) {
            var t = e.target;
            if (!t || !t.closest) return;
            if (!t.closest('.news-filters')) return;
            if (t.classList.contains('news-filter-impact-high') || t.classList.contains('news-filter-impact-med') ||
                t.classList.contains('news-filter-impact-low') || t.classList.contains('news-filter-pair-only') ||
                t.classList.contains('news-country-filter-cb')) {
                applyFiltersFromUi();
            }
        });
        document.addEventListener('click', function (e) {
            var btn = e.target && e.target.closest ? e.target.closest('.news-filter-country-all') : null;
            if (!btn || !btn.closest('.news-filters')) return;
            e.preventDefault();
            state.filters.countryCodes = [];
            saveFiltersToStorage();
            syncFilterControlsToDom();
            render();
            requestChartMarkerRedraw();
        });
    }

    var tabsWired = false;
    var searchDebounce = null;
    var boundSearchInputs = typeof WeakSet !== 'undefined' ? new WeakSet() : null;

    function syncTabClasses() {
        document.querySelectorAll('.news-tab[data-tab]').forEach(function (el) {
            el.classList.toggle('active', el.getAttribute('data-tab') === state.tab);
        });
    }

    function wireTabs() {
        if (tabsWired) return;
        tabsWired = true;
        var active = document.querySelector('.news-tab.active');
        if (active && active.getAttribute('data-tab')) {
            state.tab = active.getAttribute('data-tab');
        }
        document.addEventListener('click', function (e) {
            var tab = e.target && e.target.closest ? e.target.closest('.news-tab') : null;
            if (!tab || !tab.getAttribute('data-tab')) return;
            // Must work when news HTML is cloned into other panels (e.g. global market) — not only under #newsContent.
            if (!tab.closest('.news-tabs')) return;
            var t = tab.getAttribute('data-tab');
            state.tab = t;
            syncTabClasses();
            render();
        });
    }

    function onSearchInput(e) {
        var input = e.target;
        state.query = input.value || '';
        document.querySelectorAll('[id="newsSearchInput"]').forEach(function (inp) {
            if (inp !== input) inp.value = state.query;
        });
        if (searchDebounce) clearTimeout(searchDebounce);
        searchDebounce = setTimeout(function () {
            render();
        }, 200);
    }

    /** Redraw main chart canvas so time-axis economic markers track pan/zoom (see chart.js). */
    function requestChartMarkerRedraw() {
        var ch = window.chart || window.mainChart;
        if (ch && typeof ch.scheduleRender === 'function') {
            ch.scheduleRender();
        }
    }

    /**
     * Pair-filtered releases for the loaded range — used on the time axis, not search/tab.
     */
    window.__economicCalendarForChart = {
        /** Unfiltered Finnhub rows for multichart iframe tiles (host is source of truth). */
        getSourceEvents: function () {
            return collectMarkerSourceEvents();
        },
        getEvents: function () {
            if (canUseParentCalendarSource()) {
                try {
                    var parentSource = window.parent.__economicCalendarForChart.getSourceEvents();
                    var embedFilters = getEffectiveNewsFiltersForEmbed();
                    if (!embedFilters) return [];
                    return filterSourceEvents(parentSource, embedFilters);
                } catch (eEmbed) {
                    return [];
                }
            }
            var fp = axisEventsCacheFingerprint();
            if (fp === _axisEventsCacheFp && _axisEventsCacheArr) {
                return _axisEventsCacheArr;
            }
            var source = collectMarkerSourceEvents();
            if (!source.length) {
                _axisEventsCacheFp = fp;
                _axisEventsCacheArr = [];
                return _axisEventsCacheArr;
            }
            var out = filterSourceEvents(source, state.filters);
            _axisEventsCacheFp = fp;
            _axisEventsCacheArr = out;
            return out;
        },
        getFlagEmoji: function (code) {
            return flagEmoji(code);
        },
        getFlagImageUrl: function (code) {
            return flagImageUrl(code);
        },
        /** ISO/euro flag code for an event — mirrors V9 FlagSvg input (countryKey / currency). */
        getCalendarFlagCode: function (ev) {
            if (!ev) return '';
            var raw = ev.country || ev.currency || '';
            return calendarFlagCode(raw) || '';
        }
    };

    function bindNewsSearchInputs() {
        document.querySelectorAll('[id="newsSearchInput"]').forEach(function (input) {
            if (boundSearchInputs) {
                if (boundSearchInputs.has(input)) return;
                boundSearchInputs.add(input);
            } else if (input.getAttribute('data-news-search-bound')) {
                return;
            } else {
                input.setAttribute('data-news-search-bound', '1');
            }
            input.value = state.query;
            input.addEventListener('input', onSearchInput);
        });
    }

    window.loadEconomicNewsSidebar = function () {
        wireTabs();
        syncTabClasses();
        bindNewsSearchInputs();
        bindNewsFilters();
        syncFilterControlsToDom();
        var rng = getCalendarFetchRange();
        if (!state.loaded || state.loadedRangeKey !== rng.rangeKey) {
            loadCalendar();
        } else {
            render();
            startCountdownLoop();
            requestChartMarkerRedraw();
        }
    };

    window.refreshEconomicNewsSidebar = function () {
        state.loaded = false;
        state.loadedRangeKey = null;
        clearChartMarkerCache();
        loadCalendar(true);
    };

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stopCountdownLoop();
        else if (state.loaded) startCountdownLoop();
    });

    window.addEventListener('replayVirtualTimeChanged', function () {
        if (state.replayDayReloadTimer) clearTimeout(state.replayDayReloadTimer);
        state.replayDayReloadTimer = setTimeout(function () {
            state.replayDayReloadTimer = null;
            requestChartMarkerRedraw();
            var rng = getCalendarFetchRange();
            if (state.loaded && state.loadedRangeKey === rng.rangeKey) {
                if (newsPanelIsActive()) {
                    render();
                    startCountdownLoop();
                }
                return;
            }
            state.loaded = false;
            state.loadedRangeKey = null;
            loadCalendar(true);
        }, 400);
    });

    function onChartContextReady() {
        if (canUseParentCalendarSource()) {
            requestChartMarkerRedraw();
            return;
        }
        var rng = getCalendarFetchRange();
        // Load calendar for the chart bar range even when News is closed so time-axis markers work immediately.
        if (!state.loading && (!state.loaded || state.loadedRangeKey !== rng.rangeKey)) {
            loadCalendar();
            return;
        }
        if (newsPanelIsActive() && state.loaded) {
            render();
            startCountdownLoop();
        }
        requestChartMarkerRedraw();
    }

    window.addEventListener('chartDataLoaded', function () {
        onChartContextReady();
    });

    // chart.js runs before this script; first chartDataLoaded may fire before the listener exists — catch up once DOM/scripts are ready.
    if (typeof window !== 'undefined') {
        setTimeout(function () {
            var ch = window.chart || window.mainChart;
            if (ch && Array.isArray(ch.data) && ch.data.length) {
                onChartContextReady();
            }
        }, 0);
    }

    /** Called from chart.js render after pan/zoom — reload Finnhub range when visible dates change (long histories). */
    window.__economicCalendarNotifyChartRender = function (chart) {
        var ch = window.chart || window.mainChart;
        if (!chart || chart !== ch || chart.isPanel) return;
        if (calendarPanDebounceTimer) clearTimeout(calendarPanDebounceTimer);
        calendarPanDebounceTimer = setTimeout(function () {
            calendarPanDebounceTimer = null;
            try {
                var rng = getCalendarFetchRange();
                if (state.loading) return;
                if (state.loaded && state.loadedRangeKey === rng.rangeKey) return;
                // Skip reload if new range is within the already-loaded range
                if (state.loaded && state.loadedRangeKey) {
                    var parts = state.loadedRangeKey.split('|');
                    if (parts.length === 2 && rng.fromStr >= parts[0] && rng.toStr <= parts[1]) return;
                }
                loadCalendar();
            } catch (err) {}
        }, 350);
    };

    /**
     * V9 React rail — same filters/tab/query as the DOM sidebar, without duplicating Finnhub logic.
     */
    window.__economicCalendarUi = {
        referenceNowMs: referenceNowMs,
        getFilteredEvents: function () {
            return filterEvents().slice();
        },
        getStatus: function () {
            return {
                loading: state.loading,
                error: state.error,
                tab: state.tab,
                query: state.query,
                loaded: state.loaded,
                filters: {
                    impactHigh: state.filters.impactHigh,
                    impactMedium: state.filters.impactMedium,
                    impactLow: state.filters.impactLow,
                    pairOnly: state.filters.pairOnly,
                    countryCodes: state.filters.countryCodes ? state.filters.countryCodes.slice() : []
                }
            };
        },
        setTab: function (t) {
            if (t !== 'upcoming' && t !== 'previous') return;
            state.tab = t;
            syncTabClasses();
            render();
            requestChartMarkerRedraw();
        },
        setQuery: function (q) {
            state.query = q != null ? String(q) : '';
            render();
        },
        setFilters: function (partial) {
            if (!partial || typeof partial !== 'object') return;
            var f = state.filters;
            if (typeof partial.impactHigh === 'boolean') f.impactHigh = partial.impactHigh;
            if (typeof partial.impactMedium === 'boolean') f.impactMedium = partial.impactMedium;
            if (typeof partial.impactLow === 'boolean') f.impactLow = partial.impactLow;
            if (typeof partial.pairOnly === 'boolean') f.pairOnly = partial.pairOnly;
            if (Array.isArray(partial.countryCodes)) {
                f.countryCodes = partial.countryCodes.filter(function (x) {
                    return typeof x === 'string';
                });
            }
            saveFiltersToStorage();
            syncFilterControlsToDom();
            render();
            invalidateAxisEventsCache();
            requestChartMarkerRedraw();
            requestMultichartNewsMarkerRedraw();
        },
        applyMirroredFilters: function (filters) {
            applyMirroredNewsFilters(filters);
        },
        displayForEvent: function (e) {
            if (!e || !Number.isFinite(e.t)) return null;
            var now = referenceNowMs();
            if (!Number.isFinite(now)) now = Date.now();
            var tp = timeParts(e.t);
            var upcoming = e.t >= now;
            return {
                time: tp.clock,
                dateStr: tp.dateStr,
                upcoming: upcoming,
                countdown: upcoming ? formatCountdown(e.t - now) : ''
            };
        }
    };
})();
