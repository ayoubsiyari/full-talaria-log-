/**
 * session-calendar.js — per-instrument-class session bucketing for higher timeframes.
 *
 * Row: Session-calendar bucketing (canary blocker) · Class: correctness (§A4c)
 * Contract: chart v 1.4/chart/modules/session-calendar.contract.json
 * Finding: docs/plan3/FINDING-SESSION-CALENDAR-20260727.md
 *
 * ONE bucket-boundary implementation for BOTH resample paths
 * (chart.js _resampleDataFull, chart-data-pipeline.js _tryIncrementalResample).
 * Two independent boundary computations is a fresh bug class — callers must not
 * compute `Math.floor(t / tfMs) * tfMs` themselves; ask for it here instead
 * (`epochAlignedBucketStart`), so the kill-switch path is the same code too.
 *
 * LABEL CONVENTION (Director-decided, encoded here):
 *   stamp-at-open + session-date naming.
 *   `bucketStart()` returns the session OPEN instant — that is the bar's `t`.
 *   `sessionLabel()` returns the name the display layer must render. For FX the
 *   label date is the open's local date + 1 day, so the bucket opening
 *   Sunday 17:00 ET is NAMED MONDAY, and Thursday 17:00 ET is named Friday.
 *
 * INSTRUMENT IDENTITY: the product path resolves its class through
 * `classFromRegistry(window.marketCalcEngine, chart.currentSymbol)`, i.e. the
 * existing MarketCalculationEngine instrument registry — NOT the string-shape
 * heuristic in `resolveInstrumentClass`, which cannot read the display labels
 * chart.js actually stores. An unregistered symbol resolves to null and the
 * caller must keep today's grid and announce the degradation; guessing a
 * session for an unidentified instrument is the one outcome forbidden here.
 *
 * DST: the anchor is a LOCAL WALL-CLOCK hour resolved through the IANA zone
 * database, never a fixed millisecond offset. Session days across a US DST
 * boundary are therefore 23h or 25h long while the local open stays 17:00.
 *
 * Kill-switch (correctness class, §A4c): __TALARIA_DISABLE_SESSION_CALENDAR_V1
 *   truthy → every call degrades to the legacy epoch-aligned floor, exactly
 *   reproducing pre-fix behaviour for all timeframes.
 *
 * Pure functions. No DOM. Loadable in Node (module.exports) and browser shells.
 */
(function (global) {
    'use strict';

    var VERSION = '20260728b83';
    var KILL_SWITCH = '__TALARIA_DISABLE_SESSION_CALENDAR_V1';

    /* -- instrument-class registry (extensible; see contract sidecar) ------ */

    var CLASS_DEFS = [
        {
            id: 'fx',
            label: 'Spot FX',
            status: 'implemented',
            zone: 'America/New_York',
            // Session opens 17:00 local, DST-aware. Week opens Sunday 17:00 local.
            dailyOpenMinute: 17 * 60,
            weekOpenWeekday: 0,
            // Session-date naming: open's local date + 1 day (Sun 17:00 -> Monday).
            labelOffsetDays: 1,
            symbols: 'ISO-4217 pairs (EURUSD, GBPJPY, ...), metals vs USD'
        },
        {
            id: 'crypto',
            label: 'Crypto (24/7)',
            status: 'implemented',
            zone: 'UTC',
            // 00:00 UTC — already correct under the legacy epoch floor for daily.
            dailyOpenMinute: 0,
            weekOpenWeekday: 1,
            labelOffsetDays: 0,
            symbols: 'BTCUSD, ETHUSD, ...USDT'
        },
        {
            id: 'cme-index-futures',
            label: 'CME index futures',
            // DECLARED, NOT IMPLEMENTED. Proves the registry is extensible without
            // inventing a calendar we have not sourced. Falls back to legacy epoch
            // alignment, so wiring this class changes nothing today.
            status: 'declared',
            zone: 'America/Chicago',
            dailyOpenMinute: null,
            weekOpenWeekday: null,
            labelOffsetDays: null,
            requires: ['cme-holiday-calendar', 'cme-daily-maintenance-break', 'cme-early-close-table'],
            symbols: 'ES, NQ, MES, MNQ, YM, RTY'
        },
        {
            id: 'us-equities',
            label: 'US equities',
            // DECLARED, NOT IMPLEMENTED. Reachable in the product today:
            // MarketCalculationEngine classifies AAPL-style tickers as `stocks`,
            // so the market-type map must have somewhere real to send them.
            // Falls back to legacy epoch alignment — no behaviour change.
            status: 'declared',
            zone: 'America/New_York',
            dailyOpenMinute: null,
            weekOpenWeekday: null,
            labelOffsetDays: null,
            requires: ['nyse-holiday-calendar', 'nyse-half-day-table', 'rth-vs-eth-decision'],
            symbols: 'AAPL, MSFT, ... (MarketCalculationEngine type "stocks")'
        },
        {
            id: 'unknown',
            label: 'Unclassified instrument',
            // Safe default: never guess a session for an instrument we cannot
            // classify — degrade to today's behaviour instead.
            status: 'declared',
            zone: null,
            dailyOpenMinute: null,
            weekOpenWeekday: null,
            labelOffsetDays: null,
            symbols: '(fallback)'
        }
    ];

    var CLASSES = {};
    for (var ci = 0; ci < CLASS_DEFS.length; ci++) CLASSES[CLASS_DEFS[ci].id] = CLASS_DEFS[ci];

    var FX_CURRENCIES = [
        'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD',
        'SEK', 'NOK', 'DKK', 'SGD', 'HKD', 'MXN', 'ZAR', 'TRY',
        'PLN', 'HUF', 'CZK', 'CNH', 'XAU', 'XAG'
    ];
    var CRYPTO_BASES = ['BTC', 'ETH', 'XRP', 'LTC', 'SOL', 'ADA', 'DOGE', 'BNB', 'AVAX', 'DOT'];
    var CME_ROOTS = ['MES', 'MNQ', 'MYM', 'M2K', 'ES', 'NQ', 'YM', 'RTY'];

    /* -- zone primitives (DST-aware; no fixed offsets anywhere) ----------- */

    var WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var DAY_MS = 86400000;
    var OFFSET_CACHE_MAX = 512;
    var formatterCache = {};
    var offsetCache = {};
    var offsetCacheKeys = [];

    var stats = {
        zoneOffsetLookups: 0,
        formatterCalls: 0,
        bucketStartCalls: 0,
        boundaryCacheHits: 0,
        boundaryRecomputes: 0,
        epochFallbacks: 0,
        registryLookups: 0,
        registryUnavailable: 0,
        // Diagnostics for the two documented-but-unreachable DST branches in
        // `wallToUtc`. Non-zero means an added instrument class anchors near a
        // transition and the constant-anchor invariant needs re-proving.
        wallClockGapAdjustments: 0,
        wallClockTransitionCrossings: 0
    };

    function formatterFor(zone) {
        var f = formatterCache[zone];
        if (!f) {
            f = new Intl.DateTimeFormat('en-US', {
                timeZone: zone,
                hourCycle: 'h23',
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
            formatterCache[zone] = f;
        }
        return f;
    }

    /** Local wall-clock parts for a UTC instant, via the IANA zone database. */
    function zoneParts(zone, t) {
        if (zone === 'UTC') {
            var d = new Date(t);
            return {
                year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(),
                hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds()
            };
        }
        stats.formatterCalls++;
        var parts = formatterFor(zone).formatToParts(new Date(t));
        var out = {};
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            if (p.type === 'year') out.year = parseInt(p.value, 10);
            else if (p.type === 'month') out.month = parseInt(p.value, 10);
            else if (p.type === 'day') out.day = parseInt(p.value, 10);
            else if (p.type === 'hour') out.hour = parseInt(p.value, 10) % 24;
            else if (p.type === 'minute') out.minute = parseInt(p.value, 10);
            else if (p.type === 'second') out.second = parseInt(p.value, 10);
        }
        return out;
    }

    /**
     * Offset (ms) to ADD to a UTC instant to get its local wall clock in `zone`.
     * Cached per zone per UTC hour — a resample pass over 1m bars would otherwise
     * make one Intl call per bar (§A9: this path is memory/CPU sensitive).
     */
    function zoneOffsetMs(zone, t) {
        stats.zoneOffsetLookups++;
        if (zone === 'UTC') return 0;
        var key = zone + '#' + Math.floor(t / 3600000);
        var hit = offsetCache[key];
        if (hit !== undefined) return hit;
        var p = zoneParts(zone, t);
        var asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second, 0);
        var off = asUtc - (Math.floor(t / 1000) * 1000);
        if (offsetCacheKeys.length >= OFFSET_CACHE_MAX) delete offsetCache[offsetCacheKeys.shift()];
        offsetCacheKeys.push(key);
        offsetCache[key] = off;
        return off;
    }

    /**
     * Inverse of zoneParts: the UTC instant for a local wall-clock time.
     * Two-pass so a DST change between guess and result is absorbed.
     *
     * TWO DST EDGE CASES — DELIBERATE, DOCUMENTED POLICY, NOT TESTED BEHAVIOUR.
     *
     * Neither branch is reachable for the two IMPLEMENTED classes: FX anchors at
     * 17:00 America/New_York and crypto at 00:00 UTC, while US transitions occur
     * at 02:00 local and UTC has none. They are therefore UNTESTED by the oracle
     * (forced probes only, no fixture reaches them). They exist so that adding a
     * class cannot silently yield a wrong instant, and each is COUNTED so an
     * added class announces itself instead of drifting:
     *
     *   GAP (spring-forward: e.g. 02:30 local never occurs on the transition
     *   day). Policy: return the first instant AFTER the gap. Consequence: the
     *   caller's local anchor MOVES for that one session, which BREAKS the
     *   constant-anchor invariant this module's own callers assert. That is a
     *   defect signal, not normal operation — hence `wallClockGapAdjustments`.
     *   An anchor inside a gap is unrepresentable; no return value is correct,
     *   so the counter is the contract rather than the value.
     *
     *   AMBIGUOUS (fall-back: e.g. 01:30 local occurs twice). Policy: the
     *   EARLIER occurrence, i.e. the pre-transition offset, which is what the
     *   two-pass converges to. Chosen deliberately so the session opens as early
     *   as possible and no bar between the two occurrences is orphaned ahead of
     *   its own session open.
     *
     *   THE AMBIGUITY BRANCH IS UNGUARDED, AND `wallClockTransitionCrossings`
     *   DOES NOT DETECT IT. That counter fires when the two offset probes
     *   DISAGREE, which is a near-transition signal, not the ambiguity
     *   condition: a genuinely ambiguous wall time can converge on the first
     *   pass and return the correct earlier occurrence with the counter reading
     *   zero. It is retained as a cheap near-transition tripwire — it costs
     *   nothing, both offsets are already in hand — but it must NOT be read as
     *   "no ambiguous time was requested". Detecting ambiguity properly needs a
     *   third probe on the far side of the transition, i.e. an extra Intl call
     *   on every boundary, which cell K's cost bound does not allow for a branch
     *   no implemented class can reach. Recorded rather than paid for.
     *
     * `wallClockGapAdjustments` DOES detect its condition exactly: it fires on a
     * failed round-trip, which is precisely what a non-existent wall time is.
     */
    function wallToUtc(zone, year, month, day, minuteOfDay) {
        var naive = Date.UTC(year, month - 1, day, 0, 0, 0, 0) + minuteOfDay * 60000;
        if (zone === 'UTC') return naive;
        var offGuess = zoneOffsetMs(zone, naive);
        var t = naive - offGuess;
        var offResolved = zoneOffsetMs(zone, t);
        t = naive - offResolved;
        // Near-transition tripwire, NOT an ambiguity detector — see above.
        if (offResolved !== offGuess) stats.wallClockTransitionCrossings++;
        var check = zoneParts(zone, t);
        if (check.year !== year || check.month !== month || check.day !== day
            || (check.hour * 60 + check.minute) !== minuteOfDay) {
            // The requested wall time does not exist: spring-forward gap.
            stats.wallClockGapAdjustments++;
            var probe = naive - zoneOffsetMs(zone, naive - 3 * 3600000);
            if (probe > t) t = probe;
        }
        return t;
    }

    function shiftLocalDate(year, month, day, deltaDays) {
        var d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0) + deltaDays * DAY_MS);
        return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
    }

    function localWeekday(year, month, day) {
        return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).getUTCDay();
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n); }

    /* -- timeframe classification ----------------------------------------- */

    var CALENDAR_UNITS = { d: 'day', w: 'week', wk: 'week' };

    /**
     * Does this timeframe bucket by session calendar?
     * Monthly (`Nmo`) is deliberately EXCLUDED — chart.js already buckets it by
     * real calendar months and that branch must not be touched.
     */
    function classifyTimeframe(timeframe) {
        var tf = String(timeframe == null ? '' : timeframe).toLowerCase().trim();
        var m = tf.match(/^(\d+)(mo|wk|[a-z])$/);
        if (!m) return { handled: false, unit: null, count: 0, reason: 'unparsed' };
        var count = parseInt(m[1], 10);
        var unit = m[2];
        if (unit === 'mo') {
            return { handled: false, unit: 'month', count: count, reason: 'calendar-month-branch-owns-this' };
        }
        var mapped = CALENDAR_UNITS[unit];
        if (!mapped) {
            return { handled: false, unit: unit, count: count, reason: 'sub-daily-epoch-aligned-is-correct' };
        }
        if (count !== 1) {
            return { handled: false, unit: mapped, count: count, reason: 'multiple-of-session-unit-not-specified' };
        }
        return { handled: true, unit: mapped, count: count, reason: null };
    }

    /* -- instrument-class resolution -------------------------------------- */

    function resolveInstrumentClass(symbol, options) {
        var opts = options || {};
        if (opts.instrumentClass && CLASSES[opts.instrumentClass]) return opts.instrumentClass;
        var s = String(symbol == null ? '' : symbol).toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!s) return 'unknown';
        for (var i = 0; i < CRYPTO_BASES.length; i++) {
            if (s.indexOf(CRYPTO_BASES[i]) === 0) return 'crypto';
        }
        if (s.indexOf('USDT') >= 0 || s.indexOf('USDC') >= 0) return 'crypto';
        for (var j = 0; j < CME_ROOTS.length; j++) {
            var root = CME_ROOTS[j];
            if (s === root || new RegExp('^' + root + '[FGHJKMNQUVXZ]\\d{1,2}$').test(s)) {
                return 'cme-index-futures';
            }
        }
        if (s.length === 6
            && FX_CURRENCIES.indexOf(s.slice(0, 3)) >= 0
            && FX_CURRENCIES.indexOf(s.slice(3, 6)) >= 0) {
            return 'fx';
        }
        return 'unknown';
    }

    /* -- instrument identity from the PRODUCT's own registry --------------- */
    //
    // `resolveInstrumentClass` above is a string-shape heuristic. It is adequate
    // for a caller that already holds a clean ticker, and it is what the Node
    // API and the oracle use directly, but it MUST NOT be the product's source
    // of truth: chart.js stores a DISPLAY LABEL in `currentSymbol`, which can be
    // `EURUSD_FULL_1MIN_1MIN`, `20251028_194229_GBPUSD`, `EUR/USD`, `FILE_1234`
    // or null. The heuristic classifies only the third of those correctly.
    //
    // MarketCalculationEngine (modules/market-calculations.js) already owns
    // symbol -> instrument-type resolution for exactly these shapes, is loaded on
    // every chart shell, and is maintained because misclassification there breaks
    // P&L. Session bucketing consumes THAT answer rather than growing a second,
    // weaker copy of it.

    /*
     * ┌──────────────────────────────────────────────────────────────────────┐
     * │ WARNING — `futures` IS A COARSER BUCKET THAN THE CLASS NAME SUGGESTS │
     * └──────────────────────────────────────────────────────────────────────┘
     * `MarketCalculationEngine` types ALL 30 futures rows as `futures`, so this
     * line routes energies (CL, NG, RB, HO), metals (GC, SI, HG, PL), bonds
     * (ZB, ZN, ZF, ZT), grains (ZC, ZW, ZS) and FX futures (6E, 6B, 6J, ...)
     * into a class NAMED `cme-index-futures`.
     *
     * That is INERT TODAY and only today: the class is `declared`, so every one
     * of those rows falls back to legacy epoch alignment and nothing moves.
     *
     * IT BECOMES A DEFECT THE MOMENT SOMEONE IMPLEMENTS THE CLASS. Whoever does
     * that will naturally implement CME EQUITY INDEX hours, and those hours will
     * silently land on grains, energies, metals and bonds, which keep different
     * session calendars — grains most of all (CBOT ags have a mid-session pause
     * and a different open entirely). The class NAME actively disguises this,
     * which is why the warning is here and not only in the packet.
     *
     * DO NOT implement `cme-index-futures` without first splitting this map by
     * product group. Deliberately not restructured in this packet: doing so
     * would change classification for 30 rows with no oracle coverage behind it.
     * Recorded for Manager A, packet session-calendar-red §8.3.
     */
    var MARKET_TYPE_TO_CLASS = {
        forex: 'fx',
        crypto: 'crypto',
        futures: 'cme-index-futures',
        stocks: 'us-equities'
    };

    /** MarketCalculationEngine `specs.type` -> session class id, or null. */
    function classFromMarketType(marketType) {
        var key = String(marketType == null ? '' : marketType).toLowerCase();
        return Object.prototype.hasOwnProperty.call(MARKET_TYPE_TO_CLASS, key)
            ? MARKET_TYPE_TO_CLASS[key]
            : null;
    }

    /**
     * Instrument identity for a product symbol, via the instrument registry.
     *
     * Returns a null class — meaning IDENTITY NOT ESTABLISHED — rather than
     * guessing. `MarketCalculationEngine.detectMarketType` deliberately defaults
     * to 'forex' for anything it cannot place, which is the right default for
     * position sizing but catastrophic here: it would apply a 17:00 New York FX
     * session to a `FILE_1234` dataset that may be NQ futures, silently changing
     * displayed values. So the confidence gate is `isRegistered()` — an explicit
     * registry row — and an unregistered symbol yields null. The caller must
     * treat null as "keep today's grid AND announce the degradation" (§A4c).
     *
     * `cacheable` IS PART OF THE CONTRACT AND CALLERS MUST HONOUR IT.
     * A memoising caller has to separate two very different negatives:
     *
     *   "the registry says this symbol is unknown"  -> settled, cacheable
     *   "the registry was not there to be asked"    -> transient, NOT cacheable
     *
     * Caching the second permanently poisons the symbol: the chart stays
     * epoch-aligned for the rest of the session even after the registry loads,
     * while every health signal reads green. That is §A4c capability loss
     * without failure in its purest form, and it is the reason this function
     * returns a record rather than a bare class id.
     *
     * @param {object} engine MarketCalculationEngine instance (window.marketCalcEngine)
     * @param {string} symbol chart.currentSymbol
     * @returns {{instrumentClass:string|null, cacheable:boolean, reason:string}}
     */
    function resolveIdentity(engine, symbol) {
        var s = (typeof symbol === 'string') ? symbol.trim() : '';
        if (!s) {
            return { instrumentClass: null, cacheable: true, reason: 'no-symbol' };
        }
        if (!engine || typeof engine.isRegistered !== 'function'
            || typeof engine.getSpecs !== 'function') {
            stats.registryUnavailable++;
            // Never cacheable: the registry may still be loading.
            return { instrumentClass: null, cacheable: false, reason: 'registry-unavailable' };
        }
        stats.registryLookups++;
        var registered = false;
        try {
            registered = !!engine.isRegistered(s);
        } catch (e) {
            // The registry answered with a throw, i.e. it did not answer.
            return { instrumentClass: null, cacheable: false, reason: 'registry-threw' };
        }
        if (!registered) {
            return { instrumentClass: null, cacheable: true, reason: 'symbol-not-registered' };
        }
        var specs = null;
        try {
            specs = engine.getSpecs(s);
        } catch (e) {
            return { instrumentClass: null, cacheable: false, reason: 'registry-threw' };
        }
        var cls = classFromMarketType(specs && specs.type);
        if (!cls) {
            return { instrumentClass: null, cacheable: true, reason: 'market-type-unmapped' };
        }
        return { instrumentClass: cls, cacheable: true, reason: 'resolved' };
    }

    /** Thin accessor over `resolveIdentity` for callers that do not memoise. */
    function classFromRegistry(engine, symbol) {
        return resolveIdentity(engine, symbol).instrumentClass;
    }

    /* -- legacy path (kept HERE so both call sites share one implementation) */

    function epochAlignedBucketStart(timestampMs, timeframeMs) {
        return Math.floor(timestampMs / timeframeMs) * timeframeMs;
    }

    /* -- session boundaries ----------------------------------------------- */

    /** Open instant of the session day containing `t`. */
    function sessionDayOpen(def, t) {
        var p = zoneParts(def.zone, t);
        var y = p.year, mo = p.month, d = p.day;
        if ((p.hour * 60 + p.minute) < def.dailyOpenMinute) {
            var prev = shiftLocalDate(y, mo, d, -1);
            y = prev.year; mo = prev.month; d = prev.day;
        }
        return wallToUtc(def.zone, y, mo, d, def.dailyOpenMinute);
    }

    /** Open instant of the session week containing `t`. */
    function sessionWeekOpen(def, t) {
        var dayOpen = sessionDayOpen(def, t);
        var p = zoneParts(def.zone, dayOpen);
        var back = (localWeekday(p.year, p.month, p.day) - def.weekOpenWeekday + 7) % 7;
        var target = back === 0 ? p : shiftLocalDate(p.year, p.month, p.day, -back);
        return wallToUtc(def.zone, target.year, target.month, target.day, def.dailyOpenMinute);
    }

    /* -- monotonic boundary cache ----------------------------------------- */
    //
    // The resample loop walks sorted bars, so a bar almost always lands inside
    // the window resolved for the previous bar. Caching [open, nextOpen) makes
    // the zone work O(buckets) instead of O(bars).

    var windowCache = {};

    function cachedBoundary(def, unit, t) {
        var key = def.id + '#' + unit;
        var w = windowCache[key];
        if (w && t >= w.open && t < w.next) {
            stats.boundaryCacheHits++;
            return w.open;
        }
        stats.boundaryRecomputes++;
        var open = unit === 'week' ? sessionWeekOpen(def, t) : sessionDayOpen(def, t);
        // 23h/25h DST sessions mean `open + 24h` is not the next open — resolve it.
        var next = unit === 'week'
            ? sessionWeekOpen(def, open + 8 * DAY_MS)
            : sessionDayOpen(def, open + DAY_MS + 3600000);
        if (!(next > open)) next = open + (unit === 'week' ? 7 * DAY_MS : DAY_MS);
        windowCache[key] = { open: open, next: next };
        return open;
    }

    function resetCaches() {
        windowCache = {};
        offsetCache = {};
        offsetCacheKeys = [];
        stats.zoneOffsetLookups = 0;
        stats.formatterCalls = 0;
        stats.bucketStartCalls = 0;
        stats.boundaryCacheHits = 0;
        stats.boundaryRecomputes = 0;
        stats.epochFallbacks = 0;
        stats.registryLookups = 0;
        stats.registryUnavailable = 0;
        stats.wallClockGapAdjustments = 0;
        stats.wallClockTransitionCrossings = 0;
    }

    /* -- public API ------------------------------------------------------- */

    function isEnabled() {
        return !global[KILL_SWITCH];
    }

    /**
     * THE shared bucket boundary. Both resample paths must call exactly this.
     *
     * @param {number} timestampMs raw bar timestamp (epoch ms, UTC)
     * @param {string} timeframe   display timeframe ('1d', '1w', '5m', '1mo', ...)
     * @param {{timeframeMs:number, symbol?:string, instrumentClass?:string}} options
     *        `timeframeMs` MUST come from the caller's own parseTimeframe so the
     *        legacy/fallback answer can never diverge from the caller's grid.
     * @returns {number} bucket open instant (epoch ms)
     */
    function bucketStart(timestampMs, timeframe, options) {
        stats.bucketStartCalls++;
        var opts = options || {};
        var tfMs = Number(opts.timeframeMs);
        var t = Number(timestampMs);
        if (!isFinite(t) || !isFinite(tfMs) || tfMs <= 0) return NaN;

        if (!isEnabled()) { stats.epochFallbacks++; return epochAlignedBucketStart(t, tfMs); }

        var spec = classifyTimeframe(timeframe);
        if (!spec.handled) { stats.epochFallbacks++; return epochAlignedBucketStart(t, tfMs); }

        // An explicit anchor takes precedence over instrument-class lookup.
        // This is the INDICATOR-FACING surface: the anchoring audit expects the
        // FVG's private 18:00 ET constant and the Weekly Map's Monday-ET
        // constant to become entries here rather than stay private. Nothing
        // migrates onto it in this packet, but the boundary engine is already
        // parameterised by (zone, dailyOpenMinute, weekOpenWeekday), so the
        // extension point costs nothing and its absence would have forced those
        // callers to invent an eighth and ninth calendar to get in.
        if (opts.anchor) {
            var anchor = normaliseAnchor(opts.anchor);
            if (!anchor) { stats.epochFallbacks++; return epochAlignedBucketStart(t, tfMs); }
            return cachedBoundary(anchor, spec.unit, t);
        }

        var def = CLASSES[resolveInstrumentClass(opts.symbol, opts)];
        if (!def || def.status !== 'implemented') {
            stats.epochFallbacks++;
            return epochAlignedBucketStart(t, tfMs);
        }
        return cachedBoundary(def, spec.unit, t);
    }

    /**
     * Validate a caller-supplied anchor into the same shape a class def has.
     * Fails CLOSED (returns null, caller falls back to epoch-aligned) rather
     * than coercing, because a silently-defaulted anchor is exactly the class
     * of bug this module exists to remove.
     */
    function normaliseAnchor(a) {
        if (!a || typeof a !== 'object') return null;
        var zone = typeof a.zone === 'string' && a.zone ? a.zone : null;
        var minute = Number(a.dailyOpenMinute);
        var weekday = Number(a.weekOpenWeekday);
        if (!zone) return null;
        if (!isFinite(minute) || minute < 0 || minute >= 1440) return null;
        if (!isFinite(weekday) || weekday < 0 || weekday > 6) return null;
        var offset = a.labelOffsetDays === undefined ? 0 : Number(a.labelOffsetDays);
        if (!isFinite(offset)) return null;
        return {
            id: typeof a.id === 'string' && a.id ? a.id : 'anchor:' + zone + '@' + minute + '/' + weekday,
            zone: zone,
            dailyOpenMinute: minute,
            weekOpenWeekday: weekday,
            labelOffsetDays: offset,
            status: 'implemented'
        };
    }

    /**
     * Named anchors the audit expects to migrate here. DECLARED, NOT WIRED:
     * nothing reads these yet and no indicator has been changed. They are
     * present so the two known future callers have a name to move to, and so
     * that the values are reviewed here rather than rediscovered from each
     * indicator's private constants.
     *
     *   `fvg-18-et`      — talaria-fvg-indicator.js, 18:00 America/New_York.
     *                      NOTE it disagrees with the FX session open by one
     *                      hour; that disagreement is REAL and is one of the
     *                      seven calendars the audit found. Recorded, not
     *                      reconciled — reconciling it is a separate row.
     *   `weekly-map-mon` — talaria-weekly-map-indicator.js, Monday 00:00 ET.
     */
    var NAMED_ANCHORS = {
        'fvg-18-et': {
            id: 'fvg-18-et', zone: 'America/New_York',
            dailyOpenMinute: 18 * 60, weekOpenWeekday: 0, labelOffsetDays: 1,
            status: 'declared', source: 'talaria-fvg-indicator.js periodStart()'
        },
        'weekly-map-mon': {
            id: 'weekly-map-mon', zone: 'America/New_York',
            dailyOpenMinute: 0, weekOpenWeekday: 1, labelOffsetDays: 0,
            status: 'declared', source: 'talaria-weekly-map-indicator.js'
        }
    };

    function namedAnchor(id) {
        var a = NAMED_ANCHORS[id];
        return a ? normaliseAnchor(a) : null;
    }

    function namedAnchors() {
        return Object.keys(NAMED_ANCHORS).map(function (k) {
            var a = NAMED_ANCHORS[k];
            return {
                id: a.id, zone: a.zone, dailyOpenMinute: a.dailyOpenMinute,
                weekOpenWeekday: a.weekOpenWeekday, labelOffsetDays: a.labelOffsetDays,
                status: a.status, source: a.source
            };
        });
    }

    /**
     * Session-date naming for a bucket produced by `bucketStart`.
     * FX: label date = open's local date + 1 day, so a Sunday 17:00 open is MONDAY.
     */
    function sessionLabel(bucketOpenMs, timeframe, options) {
        var opts = options || {};
        var t = Number(bucketOpenMs);
        if (!isFinite(t)) return null;
        var spec = classifyTimeframe(timeframe);
        var def = CLASSES[resolveInstrumentClass(opts.symbol, opts)];
        if (!isEnabled() || !spec.handled || !def || def.status !== 'implemented') {
            var u = new Date(t);
            return {
                key: u.getUTCFullYear() + '-' + pad2(u.getUTCMonth() + 1) + '-' + pad2(u.getUTCDate()),
                weekday: WEEKDAYS[u.getUTCDay()],
                year: u.getUTCFullYear(), month: u.getUTCMonth() + 1, day: u.getUTCDate(),
                zone: 'UTC', convention: 'legacy-utc-stamp', openMs: t
            };
        }
        var p = zoneParts(def.zone, t);
        var shifted = shiftLocalDate(p.year, p.month, p.day, def.labelOffsetDays);
        return {
            key: shifted.year + '-' + pad2(shifted.month) + '-' + pad2(shifted.day),
            weekday: WEEKDAYS[localWeekday(shifted.year, shifted.month, shifted.day)],
            year: shifted.year, month: shifted.month, day: shifted.day,
            zone: def.zone,
            convention: 'stamp-at-open/session-date-naming',
            openMs: t,
            openLocalMinuteOfDay: p.hour * 60 + p.minute,
            openLocalWeekday: WEEKDAYS[localWeekday(p.year, p.month, p.day)]
        };
    }

    /** Diagnostic view — used by oracles to report actual-vs-expected. */
    function explain(timestampMs, timeframe, options) {
        var opts = options || {};
        var spec = classifyTimeframe(timeframe);
        var classId = resolveInstrumentClass(opts.symbol, opts);
        var def = CLASSES[classId];
        var open = bucketStart(timestampMs, timeframe, opts);
        var via = !isEnabled() ? 'kill-switch-epoch'
            : !spec.handled ? ('epoch:' + spec.reason)
                : (def && def.status === 'implemented') ? 'session-calendar'
                    : ('epoch:class-' + (def ? def.status : 'missing'));
        return {
            timestampMs: Number(timestampMs),
            timeframe: String(timeframe),
            unit: spec.unit,
            handled: spec.handled,
            instrumentClass: classId,
            zone: def ? def.zone : null,
            via: via,
            bucketOpenMs: open,
            label: sessionLabel(open, timeframe, opts)
        };
    }

    /** Local wall-clock anchor of a bucket open — the DST assertion surface. */
    function openLocalTime(bucketOpenMs, options) {
        var opts = options || {};
        // An explicit anchor names its own zone; without this branch the
        // reporting side silently falls back to UTC while the bucketing side
        // uses the anchor, which is the exact shape of a wrong-but-plausible
        // answer. Same precedence as `bucketStart`.
        var def = opts.anchor ? normaliseAnchor(opts.anchor)
            : CLASSES[resolveInstrumentClass(opts.symbol, opts)];
        var zone = (def && def.zone) || 'UTC';
        var t = Number(bucketOpenMs);
        var p = zoneParts(zone, t);
        return {
            zone: zone,
            hour: p.hour,
            minute: p.minute,
            minuteOfDay: p.hour * 60 + p.minute,
            weekday: WEEKDAYS[localWeekday(p.year, p.month, p.day)],
            date: p.year + '-' + pad2(p.month) + '-' + pad2(p.day),
            offsetMinutes: -zoneOffsetMs(zone, t) / 60000
        };
    }

    function instrumentClasses() {
        return CLASS_DEFS.map(function (d) {
            return {
                id: d.id, label: d.label, status: d.status, zone: d.zone,
                dailyOpenMinute: d.dailyOpenMinute, weekOpenWeekday: d.weekOpenWeekday,
                labelOffsetDays: d.labelOffsetDays,
                requires: d.requires || [], symbols: d.symbols
            };
        });
    }

    var SessionCalendar = {
        VERSION: VERSION,
        KILL_SWITCH: KILL_SWITCH,
        LABEL_CONVENTION: 'stamp-at-open/session-date-naming',
        isEnabled: isEnabled,
        classifyTimeframe: classifyTimeframe,
        resolveInstrumentClass: resolveInstrumentClass,
        classFromMarketType: classFromMarketType,
        classFromRegistry: classFromRegistry,
        resolveIdentity: resolveIdentity,
        instrumentClasses: instrumentClasses,
        describeClass: function (id) {
            if (!CLASSES[id]) return null;
            return instrumentClasses().filter(function (d) { return d.id === id; })[0];
        },
        bucketStart: bucketStart,
        normaliseAnchor: normaliseAnchor,
        namedAnchor: namedAnchor,
        namedAnchors: namedAnchors,
        epochAlignedBucketStart: epochAlignedBucketStart,
        sessionLabel: sessionLabel,
        openLocalTime: openLocalTime,
        explain: explain,
        resetCaches: resetCaches,
        stats: function () {
            return {
                zoneOffsetLookups: stats.zoneOffsetLookups,
                formatterCalls: stats.formatterCalls,
                bucketStartCalls: stats.bucketStartCalls,
                boundaryCacheHits: stats.boundaryCacheHits,
                boundaryRecomputes: stats.boundaryRecomputes,
                epochFallbacks: stats.epochFallbacks,
                registryLookups: stats.registryLookups,
                registryUnavailable: stats.registryUnavailable,
                wallClockGapAdjustments: stats.wallClockGapAdjustments,
                wallClockTransitionCrossings: stats.wallClockTransitionCrossings
            };
        }
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SessionCalendar;
    }
    if (global) {
        global.SessionCalendar = SessionCalendar;
        if (typeof global.__talariaRegisterModule === 'function') {
            global.__talariaRegisterModule({
                module: 'SessionCalendar',
                version: VERSION,
                class: 'correctness',
                status: 'loaded'
            });
        }
    }
})(typeof window !== 'undefined' ? window : (typeof self !== 'undefined' ? self : global));
