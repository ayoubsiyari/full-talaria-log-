/* =============================================================================
 * DISQUALIFIED AS A GATE - packet B-W14, rejected by B-R8 (73 designed / 26 survived).
 * Renamed off the `.red.` convention per VER-03. A pass here is not evidence.
 *
 * Why it is not a gate: a 51-line reimplementation containing ZERO product code
 * passes all 15 cells. Every mutant is anchored on an exact product source string,
 * so the mutation set can only probe territory the cells already see. Its honest
 * 22/0 score therefore pins a thin behavioural silhouette, not the product.
 *
 * "A no-op stub dies" is NOT the same claim as "only the product passes."
 * This suite proves the first and fails the second. That distinction is the lesson.
 *
 * Kept for its cell design, which is good: the executed value matrix over
 * isFiniteBarTime (24 values, 0 survivors) is sound and reusable.
 * ============================================================================= */
/**
 * B-M10 — trade-duration clock, data-durability gate.
 *
 * Trigger: the value written lands in the trade ledger (`this.tradeJournal`), so every cell
 * below drives the real `closePositionAtPrice` and reads the row that `upsertJournalEntry`
 * appended. Nothing here extracts or evaluates source text: the previous attempt did, and a
 * decoy resolver inside `if (false) { ... }` passed it while the real resolver was `Date.now()`.
 * Mutants are applied by writing a mutated copy of `order-manager.js` to a temp dir and
 * `require`-ing it, so dead code and shape-only stubs are executed and die.
 *
 * Run: node b-m10-duration-clock.red.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PRODUCT = path.join(HERE, 'order-manager.js');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Fixture clocks. WALL is far in the future of BAR so any wall-clock leak shows
// up as a multi-year duration, which is the reported symptom.
// ---------------------------------------------------------------------------
const BAR_0 = 1_672_531_200_000; // 2023-01-01T00:00:00Z
const STEP = 60_000;
const WALL = 1_800_000_000_000; // 2027-01-15 — the fake Date.now()
const HOUR = 3_600_000;
const YEAR_HOURS = 24 * 365;

const EUR_BARS = [0, 1, 2, 3].map((i) => ({ t: BAR_0 + i * STEP, o: 1.1, h: 1.2, l: 1.0, c: 1.15 }));
const GBP_BARS = [0, 1, 2].map((i) => ({ t: BAR_0 + 500_000 + i * STEP, o: 1.3, h: 1.4, l: 1.2, c: 1.35 }));

const EUR_LAST = EUR_BARS[EUR_BARS.length - 1].t;
const GBP_LAST = GBP_BARS[GBP_BARS.length - 1].t;

/** Bars the real `_getCurrentCandleForChart` refuses (no numeric close) but that still carry a bar time. */
const CLOSELESS_BARS = [0, 1].map((i) => ({ t: BAR_0 + i * STEP, o: 1.1, h: 1.2, l: 1.0 }));
const CLOSELESS_LAST = CLOSELESS_BARS[CLOSELESS_BARS.length - 1].t;

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

/**
 * Methods the fixture is allowed to replace. Everything outside this list runs the real
 * implementation — in particular the close-time resolver, the guard predicate, the duration
 * arithmetic, `_enrichJournalEntryForPersistence` and `upsertJournalEntry`.
 */
const STUBBED = {
    // pricing / accounting — not under test, must not need a market config
    estimateOpenLegPnLSlice: () => 10,
    _roundTripCommissionForLots: () => 0,
    _calculatePositionPnL: () => 0,
    _applyHalfSpreadExitPrice: (px) => Number(px),
    _computePlannedRRAtEntry: () => null,
    _computeBlendedRR: () => null,
    _signedRMultiple: () => null,
    _getActiveInstrumentSettings: () => ({ spread_pips: 0, commission_per_lot_per_side: 0, pip_value_per_lot: 10 }),
    _getSessionDefaultTradeSetup: () => 'setup',
    _journalCloseTypeLabel: (_p, hitType) => String(hitType || 'MANUAL'),
    // excursion bookkeeping — heavy, orthogonal
    _freezeInTradeExcursionSnapshot: () => {},
    _m19ExcursionSampleCount: () => 0,
    _m19AssignCanonicalExcursionStorage: () => {},
    _finalizeExcursionScalars: () => {},
    // markers / DOM / notifications
    _exitMarkerAnchorTimeMsFromClose: () => null,
    drawExitMarker: () => {},
    drawMfeMaeMarkers: () => {},
    removeOrderLine: () => {},
    removeSLTPLines: () => {},
    removeMultiTPAvgLine: () => {},
    removeEntryMarker: () => {},
    removeMfeMaeMarkers: () => {},
    removePreviewLines: () => {},
    _cleanupOrderVisualsAfterClose: () => {},
    _scheduleClosedJournalMarkerRedraw: () => {},
    _ensurePendingTargetsSurvive: () => {},
    updatePositionsPanel: () => {},
    updateJournalTab: () => {},
    showNotification: () => {},
    showTradeJournalModal: () => {},
    playOrderSound: () => {},
    // persistence side channels — the in-memory ledger is the assertion surface
    persistJournal: () => {},
    persistRuntimeOrderState: () => {},
    _syncOrderServiceOpenAfterClose: () => {},
    _m20A1ScheduleRetainedSweep: () => {},
    _m19NoteJournalStructuralMutation: () => {},
    _m19NoteJournalAppend: () => {},
};

function makeChart({ symbol, fileId, data, rawData, replay }) {
    return {
        currentSymbol: symbol,
        currentFileId: fileId,
        currentTimeframe: '1m',
        data: data === undefined ? null : data,
        rawData: rawData === undefined ? null : rawData,
        replaySystem: replay === undefined ? null : replay,
        svg: { append() {} },
        getActiveTradingSessionId: () => 'session-b-m10',
    };
}

function makeReplay({ active = true, fullRawData = null } = {}) {
    return { isActive: active, fullRawData, animatingCandle: null, currentIndex: null, playbackMode: 'candle' };
}

/**
 * Build a manager over the real prototype and drive one full close through it.
 * Returns the ledger row the product wrote, so every assertion is on persisted data.
 */
function closeOnce(OrderManager, opts = {}) {
    // `openTime` is destructured by hand: a default would silently rewrite the `undefined` cell.
    const openTime = Object.prototype.hasOwnProperty.call(opts, 'openTime') ? opts.openTime : BAR_0;
    const {
        bgCloseTime = null,
        posTicker = 'EURUSD',
        posFileId = 'f-eur',
        charts = null,
        activeChartIndex = 0,
        multiPanel = false,
        currentCandleFromChart = true,
        tpTargets = null,
        targetId = null,
    } = opts;

    const chartList = charts || [
        makeChart({
            symbol: 'EURUSD',
            fileId: 'f-eur',
            data: EUR_BARS,
            rawData: EUR_BARS,
            replay: makeReplay({ fullRawData: EUR_BARS }),
        }),
    ];
    const activeChart = chartList[activeChartIndex];

    global.window = {
        getActiveChart: () => activeChart,
        panelManager: multiPanel
            ? { currentLayout: String(chartList.length), panels: chartList.map((c) => ({ chartInstance: c })) }
            : { currentLayout: '1' },
    };
    global.document = undefined;

    const om = Object.create(OrderManager.prototype);
    Object.assign(om, STUBBED);
    om.chart = chartList[0];
    om.balance = 10_000;
    om.equity = 10_000;
    om.initialBalance = 10_000;
    om.pipValuePerLot = 10;
    om.pendingOrders = [];
    om.closedPositions = [];
    om.tradeJournal = [];
    om.mfeMaeTrackingPositions = [];
    om.mfeMaeTrackingHours = 0;
    om.mfeMaeTrackingEnabled = false;
    om.scaledTrades = new Map();
    om.splitTrades = new Map();
    om.orderService = null;

    // `currentCandle` comes from the real `getCurrentCandle()` unless a cell needs it absent.
    if (!currentCandleFromChart) om.getCurrentCandle = () => null;

    const position = {
        id: 4242,
        type: 'BUY',
        ticker: posTicker,
        symbol: posTicker,
        sourceFileId: posFileId,
        openPrice: 1.1,
        quantity: 1,
        originalQuantity: 1,
        stopLoss: 1.0,
        takeProfit: 1.3,
        riskAmount: 100,
        originalRiskAmount: 100,
        openTime,
        status: 'OPEN',
    };
    if (tpTargets) position.tpTargets = tpTargets;
    om.openPositions = [position];

    const realNow = Date.now;
    Date.now = () => WALL;
    try {
        om.closePositionAtPrice(4242, 1.2, 'TP', null, targetId, bgCloseTime);
    } finally {
        Date.now = realNow;
    }

    const row = om.tradeJournal.find((t) => (t.tradeId ?? t.id) === 4242) || null;
    return { om, position, row };
}

/** Duration the ledger row actually carries, in hours, or null when the row withheld it. */
function ledgerHours(row) {
    if (!row) return null;
    const h = row.holdingTimeHours;
    return h == null ? null : Number(h);
}

// ---------------------------------------------------------------------------
// Cells. Each is named, each asserts on the ledger row, each can fail.
// `breaks` records the product change that makes the cell go red — a cell with no
// answer would be deleted rather than shipped.
// ---------------------------------------------------------------------------
const CELLS = [
    {
        name: 'GUARD-01: null openTime is rejected — no multi-decade duration reaches the ledger',
        breaks: 'guarding openTime with Number.isFinite(Number(x)) again, or dropping the openTime guard',
        run(OM) {
            const { row } = closeOnce(OM, { openTime: null });
            assert.ok(row, 'the trade must still be written to the ledger');
            const hours = ledgerHours(row);
            assert.equal(hours, null, `null openTime must withhold the duration, got ${hours}h`);
            assert.equal(row.holdingTimeMs ?? null, null, 'no fabricated holdingTimeMs');
            assert.ok(
                Number.isFinite(Number(row.closeTime)),
                'the close must still be dated so the row survives CSV re-import (closeTime is required)',
            );
        },
    },
    ...[
        ['undefined', undefined],
        ["'' (empty string)", ''],
        ['false', false],
        ['[] (empty array)', []],
        ['NaN', NaN],
        ['Infinity', Infinity],
    ].map(([label, value]) => ({
        name: `coercible-to-zero openTime ${label} is rejected`,
        breaks: 'any coercion-based openTime guard — Number(x), parseInt(x), +x all accept this value',
        run(OM) {
            const { row } = closeOnce(OM, { openTime: value });
            assert.ok(row, 'the trade must still be written to the ledger');
            const hours = ledgerHours(row);
            assert.equal(hours, null, `openTime ${label} must withhold the duration, got ${hours}h`);
        },
    })),
    {
        name: 'a valid replayed open/close writes a real duration and the full enriched row',
        breaks: 'withholding durations unconditionally, or making closeTime nullable so '
            + '_enrichJournalEntryForPersistence early-returns and drops savedAt / trading_session_id',
        run(OM) {
            const openTime = BAR_0;
            const { row } = closeOnce(OM, { openTime, bgCloseTime: BAR_0 + 2 * STEP });
            assert.ok(row, 'ledger row missing');
            assert.equal(row.closeTime, BAR_0 + 2 * STEP);
            assert.equal(ledgerHours(row), Number(((2 * STEP) / HOUR).toFixed(2)));
            assert.equal(row.holdingTimeMs, 2 * STEP, 'enrich must fill holdingTimeMs');
            assert.ok(row.savedAt != null, 'enrich ran to completion: savedAt present');
            assert.equal(row.trading_session_id, 'session-b-m10', 'enrich ran to completion: session id present');
        },
    },
    {
        name: 'bgCloseTime === 0 is a real time, not an absent one — duration 0',
        breaks: 'restoring the `||` chain, or a truthiness test in place of the predicate',
        run(OM) {
            const { row } = closeOnce(OM, { openTime: 0, bgCloseTime: 0 });
            assert.ok(row, 'ledger row missing');
            assert.equal(row.closeTime, 0, 'bgCloseTime 0 must win, not fall through');
            assert.equal(ledgerHours(row), 0, 'duration must be exactly 0');
        },
    },
    {
        name: 'close with evalCandle and currentCandle absent resolves to a bar, never the wall clock',
        breaks: 'reinstating the Date.now() tail, or deleting the fullRawData tier',
        run(OM) {
            // Bars with no numeric close: the real `_getCurrentCandleForChart` rejects them, so
            // `getCurrentCandle()` genuinely returns null here rather than being stubbed out.
            const ch = makeChart({
                symbol: 'EURUSD', fileId: 'f-eur',
                data: CLOSELESS_BARS, rawData: CLOSELESS_BARS,
                replay: makeReplay({ fullRawData: CLOSELESS_BARS }),
            });
            const { om, row } = closeOnce(OM, { openTime: BAR_0, charts: [ch] });
            assert.equal(om.getCurrentCandle(), null, 'fixture precondition: no usable candle');
            assert.ok(row, 'ledger row missing');
            assert.equal(row.closeTime, CLOSELESS_LAST, 'must resolve to the last replay bar');
            assert.notEqual(row.closeTime, WALL, 'wall clock leaked into the ledger');
            const hours = ledgerHours(row);
            assert.ok(hours != null && hours < YEAR_HOURS, `duration must stay bounded, got ${hours}h`);
        },
    },
    {
        name: 'the playhead dataset outranks the last *loaded* bar, which is in the trade\'s future',
        breaks: 'deleting the rs.fullRawData tier, so the close is dated from bars replay has not reached',
        run(OM) {
            const ch = makeChart({
                symbol: 'EURUSD', fileId: 'f-eur',
                data: [{ t: BAR_0 + 90 * STEP }],      // resampled, furthest ahead
                rawData: [{ t: BAR_0 + 50 * STEP }],   // loaded, ahead of the playhead
                replay: makeReplay({ fullRawData: [{ t: BAR_0 + 2 * STEP }] }), // the playhead
            });
            const { row } = closeOnce(OM, { openTime: BAR_0, charts: [ch] });
            assert.ok(row, 'ledger row missing');
            assert.equal(row.closeTime, BAR_0 + 2 * STEP, 'must date the close at the playhead');
        },
    },
    {
        name: 'cross-instrument context chart does not date a GBP close from the EUR the user is watching',
        breaks: 'resolving from _getOrderContextChart() without checking the ticker, i.e. dropping '
            + 'the isBackgroundClose gate on the evalCandle / currentCandle tiers',
        run(OM) {
            const eur = makeChart({
                symbol: 'EURUSD', fileId: 'f-eur',
                data: EUR_BARS, rawData: EUR_BARS, replay: makeReplay({ fullRawData: EUR_BARS }),
            });
            const gbp = makeChart({
                symbol: 'GBPUSD', fileId: 'f-gbp',
                data: GBP_BARS, rawData: GBP_BARS, replay: makeReplay({ fullRawData: GBP_BARS }),
            });
            const { row } = closeOnce(OM, {
                openTime: GBP_BARS[0].t,
                posTicker: 'GBPUSD',
                posFileId: 'f-gbp',
                charts: [eur, gbp],
                activeChartIndex: 0, // user is looking at EURUSD
                multiPanel: true,
            });
            assert.ok(row, 'ledger row missing');
            assert.equal(row.closeTime, GBP_LAST, 'must date the close from the GBP surface');
            assert.notEqual(row.closeTime, EUR_LAST, 'dated the close from the wrong instrument');
        },
    },
    {
        name: 'resampled `data` must not outrank the raw playhead series `rawData`',
        breaks: 'reordering the tiers to prefer ch.data, the preference _getCurrentCandleForChart warns against',
        run(OM) {
            const ch = makeChart({
                symbol: 'EURUSD', fileId: 'f-eur',
                data: [{ t: BAR_0 + 90 * STEP }],   // coarse bucket, ahead of the playhead
                rawData: [{ t: BAR_0 + STEP }],     // raw playhead series
                replay: makeReplay({ active: true, fullRawData: null }),
            });
            const { row } = closeOnce(OM, { openTime: BAR_0, charts: [ch] });
            assert.ok(row, 'ledger row missing');
            assert.equal(row.closeTime, BAR_0 + STEP, 'raw playhead bar must win over the resampled bucket');
        },
    },
    {
        name: 'background close with no on-screen owning chart still lands on the replay playhead',
        breaks: 'deleting the session-replay tier, which drops the close to a zero-length trade '
            + 'dated at its own open; or letting the wall clock back in',
        run(OM) {
            const eur = makeChart({
                symbol: 'EURUSD', fileId: 'f-eur',
                data: EUR_BARS, rawData: EUR_BARS, replay: makeReplay({ fullRawData: EUR_BARS }),
            });
            const { row } = closeOnce(OM, {
                openTime: BAR_0,
                posTicker: 'AUDUSD',
                posFileId: 'f-aud',
                charts: [eur],
            });
            assert.ok(row, 'ledger row missing');
            assert.notEqual(row.closeTime, WALL, 'wall clock leaked into a background close');
            assert.equal(row.closeTime, EUR_LAST, 'must fall back to the session replay playhead');
            const hours = ledgerHours(row);
            assert.ok(hours != null && hours > 0 && hours < YEAR_HOURS, `duration must be real and bounded, got ${hours}h`);
        },
    },
    {
        name: 'no clock anywhere: the close is refused atomically and the TP target is released',
        breaks: 'dating the close from the wall clock instead of refusing; or refusing without '
            + 'reverting tgt.hit, which strands the target and the engine never retries',
        run(OM) {
            const blank = makeChart({ symbol: 'EURUSD', fileId: 'f-eur', data: null, rawData: null, replay: null });
            const targets = [{ id: 't1', price: 1.2, percentage: 100, hit: true }];
            const { om, position, row } = closeOnce(OM, {
                openTime: null, charts: [blank], tpTargets: targets, targetId: 't1',
            });
            assert.equal(row, null, 'an undateable close must not reach the ledger');
            assert.ok(om.openPositions.includes(position), 'the position must stay open');
            assert.equal(om.closedPositions.length, 0, 'nothing may be moved to closedPositions');
            assert.equal(om.balance, 10_000, 'the balance must be untouched');
            assert.equal(position.status, 'OPEN', 'the position must not be marked closed');
            assert.equal(targets[0].hit, false, 'the TP target must be released so the hit can re-fire');
        },
    },
];

/**
 * The product logs heavily on every close. Silence it while cells run so the gate output is
 * readable; assertions travel as exceptions, not as text, so nothing is hidden.
 */
function quietly(fn) {
    const saved = { log: console.log, warn: console.warn, error: console.error };
    console.log = () => {};
    console.warn = () => {};
    console.error = () => {};
    try {
        return fn();
    } finally {
        Object.assign(console, saved);
    }
}

function runCells(OM) {
    for (const cell of CELLS) cell.run(OM);
}

// ---------------------------------------------------------------------------
// Mutation harness — mutants are executed, not read.
// ---------------------------------------------------------------------------
let tmpSeq = 0;
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'b-m10-'));

function loadMutant(source) {
    const file = path.join(TMP_ROOT, `om-${tmpSeq++}.cjs`);
    fs.writeFileSync(file, source, 'utf8');
    return require(file);
}

function must(source, needle, replacement, label) {
    assert.ok(source.includes(needle), `mutation setup failed: ${label} needle not found`);
    return source.replace(needle, replacement);
}

const RESOLVER_HEAD = '    _resolveCloseBarTimeMs(position, bgCloseTime, evalCandle, currentCandle, isBackgroundClose) {';

function mutants(source) {
    return [
        // --- the two shapes this packet exists to keep out of the tree ----------
        {
            name: 'P0 pre-fix resolver: (Number.isFinite(bg) ? bg : null) || evalCandle.t || Date.now()',
            source: must(source, RESOLVER_HEAD,
                `${RESOLVER_HEAD}\n`
                + '        const legacy = (Number.isFinite(bgCloseTime) ? bgCloseTime : null)\n'
                + "            || (evalCandle ? evalCandle.t : Date.now());\n"
                + "        return { ms: legacy, source: 'legacy' };", 'P0'),
        },
        {
            name: 'P1 rejected attempt\'s guard: Number.isFinite(Number(position.openTime))',
            source: must(source, '            const openTimeMs = barTimeMsOrNull(position.openTime);',
                '            const openTimeMs = Number.isFinite(Number(position.openTime))\n'
                + '                ? Number(position.openTime)\n'
                + '                : null;', 'P1'),
        },
        // --- corruption class: a wrong value reaches the ledger -----------------
        {
            name: 'C1 resolver falls back to the wall clock',
            source: must(source, RESOLVER_HEAD, `${RESOLVER_HEAD}\n        return { ms: Date.now(), source: 'wall' };`,
                'C1'),
        },
        {
            name: 'C2 shape-correct stub resolver (right shape, no behaviour)',
            source: must(source, RESOLVER_HEAD, `${RESOLVER_HEAD}\n        return { ms: 0, source: 'stub' };`, 'C2'),
        },
        {
            name: 'C3 dead-code decoy: correct resolver behind if (false), real one is Date.now()',
            source: must(
                source, RESOLVER_HEAD,
                `${RESOLVER_HEAD}\n        if (false) {\n`
                + `            const bg = barTimeMsOrNull(bgCloseTime);\n`
                + `            if (bg !== null) return { ms: bg, source: 'bgCloseTime' };\n`
                + `            const t = this._lastBarTimeMs(this.chart && this.chart.rawData);\n`
                + `            if (t !== null) return { ms: t, source: 'rawData' };\n`
                + `        }\n        return { ms: Date.now(), source: 'wall' };`,
                'C3',
            ),
        },
        {
            name: 'C4 early return inserted immediately before the real resolver body',
            source: must(source, RESOLVER_HEAD,
                `${RESOLVER_HEAD}\n        if (true) { return { ms: Date.now(), source: 'wall' }; }`, 'C4'),
        },
        {
            name: 'C5 predicate reverts to coercion (Number(null) === 0 passes)',
            source: must(
                source,
                "function isFiniteBarTime(value) {\n    if (typeof value === 'number') return Number.isFinite(value);",
                'function isFiniteBarTime(value) {\n    return Number.isFinite(Number(value));\n    /* unreachable */ if (false) {',
                'C5',
            ).replace('    return false;\n}\n\n/** Bar-clock epoch', '    }\n    return false;\n}\n\n/** Bar-clock epoch'),
        },
        {
            name: 'C6 bgCloseTime === 0 falls through again (truthiness)',
            source: must(source, "        if (bg !== null) return { ms: bg, source: 'bgCloseTime' };",
                "        if (bg) return { ms: bg, source: 'bgCloseTime' };", 'C6'),
        },
        {
            name: 'C7 background gate removed — foreign candle dates the close',
            source: must(source, '        if (!isBackgroundClose) {\n            const evalT',
                '        if (true) {\n            const evalT', 'C7'),
        },
        {
            name: 'C8 resampled `data` preferred over the raw playhead series',
            source: must(
                source,
                "            const rawT = this._lastBarTimeMs(ch && ch.rawData);\n"
                + "            if (rawT !== null) return { ms: rawT, source: 'rawData' };\n"
                + "            const dataT = this._lastBarTimeMs(ch && ch.data);\n"
                + "            if (dataT !== null) return { ms: dataT, source: 'data' };",
                "            const dataT = this._lastBarTimeMs(ch && ch.data);\n"
                + "            if (dataT !== null) return { ms: dataT, source: 'data' };\n"
                + "            const rawT = this._lastBarTimeMs(ch && ch.rawData);\n"
                + "            if (rawT !== null) return { ms: rawT, source: 'rawData' };",
                'C8',
            ),
        },
        {
            name: 'C9 openTime guard removed — raw subtraction returns',
            source: must(source, '            const holdingTimeMs = openTimeMs !== null ? closeTime - openTimeMs : null;',
                '            const holdingTimeMs = closeTime - position.openTime;', 'C9'),
        },
        {
            name: 'C10 duration written even when the guard rejected the open',
            source: must(source,
                '                    holdingTimeHours: holdingTimeHours !== null ? parseFloat(holdingTimeHours) : null,',
                '                    holdingTimeHours: parseFloat(closeTime - position.openTime) / 3600000,', 'C10'),
        },
        {
            name: 'C11 refusal branch replaced by a wall-clock close',
            source: must(
                must(source, '        if (!closeResolution) {', '        if (false) {', 'C11a'),
                '        const closeTime = closeResolution.ms;',
                '        const closeTime = closeResolution ? closeResolution.ms : Date.now();', 'C11b',
            ),
        },
        {
            name: 'C12 refusal does not release the TP target — the hit can never re-fire',
            source: must(
                source,
                '            if (targetId != null && Array.isArray(position.tpTargets)) {\n'
                + '                const tid = String(targetId);\n'
                + '                const tgt = position.tpTargets.find((t) => t && (String(t.id) === tid || t.id === targetId));\n'
                + '                if (tgt) tgt.hit = false;\n'
                + '            }\n'
                + '            console.error(',
                '            console.error(', 'C12',
            ),
        },
        // --- absence class: a value that should be there goes missing -----------
        {
            name: 'A1 resolver returns null — close refused, nothing reaches the ledger',
            source: must(source, RESOLVER_HEAD, `${RESOLVER_HEAD}\n        return null;`, 'A1'),
        },
        {
            name: 'A2 fullRawData tier deleted',
            source: must(source, "                if (fullT !== null) return { ms: fullT, source: 'fullRawData' };",
                '                if (false) { /* deleted */ }', 'A2'),
        },
        {
            name: 'A3 owning-chart tiers deleted entirely',
            source: must(source, '        const charts = this._closeTimeChartsForPosition(position, isBackgroundClose);',
                '        const charts = [];', 'A3'),
        },
        {
            name: 'A4 replay-playhead tier deleted',
            source: must(source, "            if (sessionT !== null) return { ms: sessionT, source: 'replayPlayhead' };",
                '            if (false) { /* deleted */ }', 'A4'),
        },
        {
            // Withholding only at the close site is an equivalent mutation: the enricher backfills
            // the duration from openTime/closeTime. The mutant has to silence both to mean anything.
            name: 'A5 duration never written (close site and enricher backfill)',
            source: must(
                must(source, '            const holdingTimeMs = openTimeMs !== null ? closeTime - openTimeMs : null;',
                    '            const holdingTimeMs = null;', 'A5a'),
                '            entry.holdingTimeHours = parseFloat((holdingTimeMs / (1000 * 60 * 60)).toFixed(2));',
                '            entry.holdingTimeHours = null;', 'A5b',
            ),
        },
        {
            name: 'A6 closeTime made nullable — enrich early-returns, row loses savedAt / session id',
            source: must(source, '        const closeTime = closeResolution.ms;',
                '        const closeTime = bgCloseTime != null ? closeResolution.ms : null;', 'A6'),
        },
        {
            name: 'A7 ledger write skipped for guard-rejected opens',
            // Anchored on the log line above the write: the bare `upsertJournalEntry(...)` call
            // also appears in `saveTradeToJournal`, and `String.replace` would mutate that one.
            source: must(source,
                '            console.log(`📔 Checking for duplicate with tradeId: "${tradeId}" (type: ${typeof tradeId})`);',
                '            if (!isFiniteBarTime(position.openTime)) return;', 'A7'),
        },
        {
            name: 'A8 owning-chart filter matches nothing (ticker check inverted)',
            source: must(source, '            if (this._positionTickerMatchesChartSymbol(position, ch)) add(ch);',
                '            if (!this._positionTickerMatchesChartSymbol(position, ch)) add(ch);', 'A8'),
        },
    ];
}

function runSuite() {
    const source = fs.readFileSync(PRODUCT, 'utf8');
    const OM = loadMutant(source); // the unmutated product, loaded the same way
    quietly(() => runCells(OM));

    const designed = mutants(source);
    const survivors = [];
    for (const mutant of designed) {
        let killed = false;
        let OMm = null;
        try {
            OMm = loadMutant(mutant.source);
        } catch (_syntax) {
            killed = true; // a mutant that will not even parse cannot ship
        }
        if (!killed) {
            try {
                quietly(() => runCells(OMm));
            } catch (_err) {
                killed = true;
            }
        }
        if (!killed) survivors.push(mutant.name);
    }
    return { designed: designed.length, survived: survivors.length, survivors, cells: CELLS.length };
}

let failed = false;
const runs = [];
for (let i = 1; i <= 3; i++) {
    try {
        runs.push(runSuite());
    } catch (err) {
        failed = true;
        console.error(`[b-m10-duration-clock] run ${i} FAILED on the unmutated product: ${err && err.message}`);
        break;
    }
}

if (!failed) {
    for (const [i, r] of runs.entries()) {
        console.log(`[b-m10-duration-clock] run ${i + 1}: ${r.cells} cells, ${r.designed} designed, ${r.survived} survived`);
        for (const s of r.survivors) console.error(`  [survived] ${s}`);
    }
    const signatures = new Set(runs.map((r) => `${r.designed}/${r.survived}/${r.survivors.join('|')}`));
    if (signatures.size !== 1) {
        failed = true;
        console.error('[b-m10-duration-clock] FAIL runs are not identical');
    }
    if (runs[0].survived !== 0) failed = true;
}

fs.rmSync(TMP_ROOT, { recursive: true, force: true });
if (failed) {
    process.exitCode = 1;
} else {
    console.log(`[b-m10-duration-clock] PASS ${runs[0].designed} designed / ${runs[0].survived} survived (3 identical runs)`);
}
