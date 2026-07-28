/**
 * m22-session-calendar-bucketing.red.test.mjs — RED oracle for the session-calendar
 * bucketing defect (canary blocker).
 *
 * Manager: A · Row: Session-calendar bucketing (canary blocker)
 * Packet: session-calendar-red · Tier: 3
 * Finding: docs/plan3/FINDING-SESSION-CALENDAR-20260727.md
 * Rulings: §A5 (test integrity), §A7 (differential oracle), §A4b (multichart cell),
 *          §A4c (kill-switch / correctness class)
 *
 * Provenance (§A5.5):
 *   authored against build 634448817
 *   mechanism row "Session-calendar bucketing (canary blocker)"
 *   last proven RED on build 634448817
 *
 * FIDELITY: every bucketing assertion runs the REAL product functions —
 * chart.js `_resampleDataFull` / `parseTimeframe` / `_prepareBarsForResampling`
 * lifted verbatim into a VM realm, and the real `ChartDataPipeline`
 * `_tryIncrementalResample`. See m22-session-calendar-harness.mjs for why and how.
 * No cell reimplements `Math.floor(t / tfMs) * tfMs` and compares it to itself.
 *
 * EPSILON: 0 (exact equality). Fixture prices are dyadic rationals
 * (1.25 + k/4096) and resampling only selects (first/last/max/min) and sums
 * integer volumes, so no rounding is possible. This is a structural property of
 * the fixture, not a tolerance fitted to an observed diff.
 *
 * RUN
 *   node --test --test-concurrency=1 "chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs"
 *
 * STATES (§A5.3 four-state proof; driver: m22-session-calendar-fourstate.mjs)
 *   M22_SC_STATE=broken    (default) real product as committed  -> MUST FAIL
 *   M22_SC_STATE=fixed     product + in-memory WIRING_PATCH      -> MUST PASS
 *   M22_SC_STATE=corrupt   fixed, but the helper's 17:00 anchor is corrupted to 16:00 -> MUST FAIL
 *   M22_SC_STATE=inverted  fixed, but every value assertion is inverted -> MUST FAIL
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import * as H from './m22-session-calendar-harness.mjs';

/* ── state / mode ────────────────────────────────────────────────────────── */

const STATE = String(process.env.M22_SC_STATE || 'broken').toLowerCase();
const VALID_STATES = new Set(['broken', 'fixed', 'corrupt', 'inverted']);
if (!VALID_STATES.has(STATE)) throw new Error(`M22_SC_STATE must be one of ${[...VALID_STATES].join('|')}`);

const MODE = STATE === 'broken' ? H.MODES.PRODUCT : H.MODES.SIMULATE_WIRED;
const CORRUPT = STATE === 'corrupt';
const INVERT = STATE === 'inverted';
/** True when session bucketing is actually in force in this run. */
const WIRED = MODE === H.MODES.SIMULATE_WIRED;

const FX = 'EURUSD';
const SESSION_OPEN_MINUTE_OF_DAY = 17 * 60; // 17:00 America/New_York
const SESSION_WEEKDAYS = new Set(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

/** Frozen pre-fix baseline, measured on build 634448817. Pinned, never regenerated. */
const FROZEN_TODAY = {
    po1d: { sha256: '89a9337f2df78ee8f00462d31e534898d1a1e1d71e6e147ecb76459b4aec1242', length: 24 },
    po1w: { sha256: '2507c75e36684a9dc6150cf59cc393569b2adbd8cbe77928f2c6d3986ce01642', length: 5 },
    po1h: { sha256: 'c53e9dc1b2890946ea541bad02c6b035796db8acce78b3f82fd55054bd7aa4ec', length: 480 },
    cont1mo: { sha256: 'a6a6e0e3ef377361d033dc2cf5e6c1adc145edd7179095433f186f45708102a5', length: 4 },
    cont3mo: { sha256: 'fef11fafd634fa79338ace522873edce7ad3a1faf544dab0c3bf26cf00d2421a', length: 2 },
    cont4h: { sha256: 'a69546357238be469ee792b29340cbbc2e289226f1611ab8e77cd9491e12e7bd', length: 720 },
    cont1h: { sha256: 'e2dbbb48cf314abdfacda7864b09a3aaf2850d70f275c35a4e49689eb78ac202', length: 2880 },
    min5m: { sha256: '5945310b18b956391b4d6252ffc1946119f93f9f7d8b8c0af6fa6dae5ba3e7d4', length: 864 },
    min15m: { sha256: 'ec56fed613d58f87c354ae85ccbc2eba630275fff1bc7f36dcc80643482c39b5', length: 288 },
    min1h: { sha256: '19d1896515d0cbe7cf2d5316d1128785ea66fc939f6104a79bc569f9eecba31d', length: 72 },
    min4h: { sha256: '3df802d25dcb4e5ed283d9d907659cbbea1c44647149cdd04a7bdb3abebf43df', length: 18 },
    crypto1d: { sha256: '69ff1adb2e56bd039e2b87759db5debad67540df67a937d497d399cac30ef6ec', length: 120 },
    crypto1w: { sha256: '6376497b0e7cebfa0fe230fc47faaa577034977b3b861e4a33475d1fb2e47e9b', length: 18 },
};

/**
 * Post-fix digests for outputs this packet DELIBERATELY changes. Only crypto
 * weekly is listed: it is the sole change made on the worker's own judgement
 * (Monday 00:00 UTC rather than the epoch floor's Thursday), so "it moved" is
 * not a sufficient assertion — it must move to one specific, reviewable series.
 * FX daily/weekly are pinned by literal session instants in cells B and C
 * instead, which is stronger than a digest.
 */
const FROZEN_WIRED = {
    crypto1w: { sha256: 'ae285d4b29d13ec46cb3602f6a577b2997b80067c042f281904a3579b25c2b73', length: 18 },
};

/* ── fixtures (built once; no wall clock, no RNG) ────────────────────────── */

const PO_BARS = H.fxBars(H.PO_WINDOW.startMs, H.PO_WINDOW.endMs, H.PO_WINDOW.stepMs);
const CONT_BARS = H.continuousBars(Date.UTC(2012, 10, 1), Date.UTC(2013, 2, 1), 3600000);
const MIN_BARS = H.continuousBars(Date.UTC(2013, 0, 2), Date.UTC(2013, 0, 5), 60000);
const SPRING_BARS = H.continuousBars(Date.UTC(2013, 2, 4), Date.UTC(2013, 2, 18), 3600000);
const FALL_BARS = H.continuousBars(Date.UTC(2013, 9, 28), Date.UTC(2013, 10, 11), 3600000);

/* ── reporting ───────────────────────────────────────────────────────────── */

const rows = [];
let pending = null;

function note(cell, name, pass, detail) {
    rows.push({ cell, name, pass: !!pass, detail: detail === undefined ? '' : detail });
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'} [${cell}] ${name}${detail ? ` — ${detail}` : ''}\n`);
}

/**
 * Value assertion with a recorded actual-vs-expected, honouring the inverted
 * state (§A5.3 state 4). `expected` and `actual` must be primitives or plain
 * JSON — never a wall clock, UUID, rAF ordering or float comparison (§A5.6).
 *
 * Failures are collected and raised together by `cellTest` so a RED run reports
 * EVERY divergence with values, not just the first one in the cell. The cell
 * still fails: nothing here can turn a failure into a pass.
 */
function expectEqual(cell, name, actual, expected, extra) {
    const a = typeof actual === 'object' ? JSON.stringify(actual) : String(actual);
    const e = typeof expected === 'object' ? JSON.stringify(expected) : String(expected);
    const same = a === e;
    const pass = INVERT ? !same : same;
    const detail = `actual=${a} expected=${e}${extra ? ` ${extra}` : ''}`;
    note(cell, name, pass, detail);
    if (!pass) {
        const record = { cell, name, detail };
        if (pending) pending.push(record);
        else throw new assert.AssertionError({ message: `[${cell}] ${name}: ${detail}` });
    }
}

/** A cell that raises every collected value divergence at once. */
function cellTest(name, fn) {
    test(name, () => {
        pending = [];
        let thrown = null;
        try {
            fn();
        } catch (error) {
            thrown = error;
        }
        const failures = pending;
        pending = null;
        if (thrown) {
            if (failures.length) {
                thrown.message = `${thrown.message}\n+ ${failures.length} collected value divergence(s):\n`
                    + failures.map((f) => `  - [${f.cell}] ${f.name}: ${f.detail}`).join('\n');
            }
            throw thrown;
        }
        if (failures.length) {
            throw new assert.AssertionError({
                message: `${failures.length} value assertion(s) failed:\n`
                    + failures.map((f) => `  - [${f.cell}] ${f.name}: ${f.detail}`).join('\n'),
            });
        }
    });
}

/* ── helpers over produced series ────────────────────────────────────────── */

function makeHarness(extra = {}) {
    return H.makeHarness({ mode: MODE, corruptCalendar: CORRUPT, symbol: FX, ...extra });
}

/** Independent OHLCV aggregate over a half-open window — no product code. */
function aggregateWindow(bars, fromMs, toMs) {
    const inWindow = bars.filter((b) => b.t >= fromMs && b.t < toMs);
    if (inWindow.length === 0) return null;
    let h = inWindow[0].h;
    let l = inWindow[0].l;
    let v = 0;
    for (const b of inWindow) {
        if (b.h > h) h = b.h;
        if (b.l < l) l = b.l;
        v += b.v;
    }
    return {
        count: inWindow.length,
        o: inWindow[0].o,
        h,
        l,
        c: inWindow[inWindow.length - 1].c,
        v,
    };
}

function ohlcvOf(bar) {
    return bar ? { o: bar.o, h: bar.h, l: bar.l, c: bar.c, v: bar.v } : null;
}

function labelKeysOf(SC, series, tf) {
    return series.map((b) => {
        const label = SC.sessionLabel(b.t, tf, { symbol: FX });
        return { t: b.t, key: label.key, weekday: label.weekday };
    });
}

function incrementalSeries(harness, bars, tf) {
    let calls = 0;
    const real = harness.pipeline._tryIncrementalResample.bind(harness.pipeline);
    harness.pipeline._tryIncrementalResample = (...args) => {
        const result = real(...args);
        if (result) calls += 1;
        return result;
    };
    const live = [];
    let out = [];
    for (const bar of bars) {
        live.push(bar);
        out = harness.pipeline.getResampledSeries(live, tf, 0);
    }
    return { series: out, incrementalCalls: calls, live };
}

/* ─────────────────────────────────────────────────────────────────────────
 * Cell 0 — harness fidelity. If these fail nothing below means anything.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cell0: harness executes the REAL product bucketing code', () => {
    const harness = makeHarness();
    const meta = harness.meta;

    note('0', 'mode', true, `state=${STATE} mode=${meta.mode} patched=${meta.patched} productWired=${meta.alreadyWired}`);
    note('0', 'lifted-method-digests', true, JSON.stringify(meta.liftedSha256));

    // Which methods came out of the product rather than out of the patch. Before
    // wiring this is the base three; after wiring it must include the two the
    // patch adds, so the harness runs product text in both worlds.
    const wired = H.productIsWired();
    note('0', 'lifted-from-product', true, `${meta.liftedFromProduct.join(',')} productIsWired=${wired}`);
    expectEqual('0', 'wired-methods-lifted-iff-product-is-wired',
        H.WIRED_LIFTED_METHODS.every((n) => meta.liftedFromProduct.includes(n)), wired,
        `lifted=${meta.liftedFromProduct.join(',')}`);

    // The lifted text must be the real thing. The defect formula is present in
    // the unpatched lift and absent once the product carries the wiring — so this
    // assertion INVERTS at the moment Manager A lands the patch, and is therefore
    // stated against `productIsWired()` rather than pinned to today's source.
    const lifted = H.liftChartMethods();
    const defectFormula = 'Math.floor(candle.t / timeframeMs) * timeframeMs';
    expectEqual('0', 'defect-formula-present-in-lifted-product-text',
        lifted._resampleDataFull.includes(defectFormula), !wired,
        `productIsWired=${wired} formula=${defectFormula}`);
    assert.equal(lifted.parseTimeframe.includes("'d': 24 * 60 * 60 * 1000"), true,
        'harness lifted a parseTimeframe that is not the product one — extraction is wrong');

    // parseTimeframe is the real one, with the fixed durations the finding names.
    expectEqual('0', 'real-parseTimeframe-1d', harness.chart.parseTimeframe('1d'), 86400000);
    expectEqual('0', 'real-parseTimeframe-1w', harness.chart.parseTimeframe('1w'), 604800000);

    // INVENTORY, report-only (deliberately not asserted so it cannot rot into a
    // gate on buggy behaviour). `_getMaxBarsOnScreen` accepts '1wk' as a weekly
    // timeframe, but parseTimeframe has no 'wk' unit and falls through to
    // minutes — so '1wk' currently resolves to 60000 ms. Separate latent defect;
    // reported to Manager A, not fixed here. SessionCalendar.classifyTimeframe
    // does recognise 'wk', so wiring must reconcile the two.
    note('0', 'inventory-parseTimeframe-1wk-resolves-to-minutes', true,
        `parseTimeframe('1wk')=${harness.chart.parseTimeframe('1wk')} (expected 604800000 if 1wk is reachable)`);

    // The real ChartDataPipeline is loaded, not a stub.
    assert.equal(typeof harness.pipeline._tryIncrementalResample, 'function');
    assert.equal(typeof harness.PipelineCtor.RENDER_BAR_BUDGET, 'number');
    note('0', 'real-ChartDataPipeline-loaded', true, `RENDER_BAR_BUDGET=${harness.PipelineCtor.RENDER_BAR_BUDGET}`);

    // Fixture shape is what the finding describes: full weekday sessions, no
    // Saturday bars, a short Sunday-evening reopen.
    expectEqual('0', 'fixture-bar-count', PO_BARS.length, 480);
    expectEqual('0', 'fixture-has-no-saturday-utc-bars',
        PO_BARS.some((b) => new Date(b.t).getUTCDay() === 6), false);
    expectEqual('0', 'fixture-sunday-reopen-bars',
        PO_BARS.filter((b) => b.t >= Date.UTC(2013, 0, 6, 22) && b.t < Date.UTC(2013, 0, 7)).length, 2);
    expectEqual('0', 'fixture-friday-4-jan-session-bar-count',
        aggregateWindow(PO_BARS, H.EXPECTED.friday20130104.openMs, H.EXPECTED.friday20130104.closeMs).count, 24);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell A — the helper's own contract (API surface, label convention, classes).
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellA: helper API surface, label convention and instrument-class registry', () => {
    const { SC } = makeHarness();
    assert.ok(SC, 'SessionCalendar did not publish onto the realm global');

    const surface = [
        'bucketStart', 'epochAlignedBucketStart', 'sessionLabel', 'openLocalTime',
        'classifyTimeframe', 'resolveInstrumentClass', 'instrumentClasses',
        'describeClass', 'explain', 'isEnabled', 'resetCaches', 'stats',
    ];
    for (const fn of surface) {
        assert.equal(typeof SC[fn], 'function', `SessionCalendar.${fn} missing`);
    }
    note('A', 'api-surface', true, surface.join(','));

    expectEqual('A', 'kill-switch-name', SC.KILL_SWITCH, H.KILL_SWITCH);
    expectEqual('A', 'label-convention', SC.LABEL_CONVENTION, H.LABEL_CONVENTION);

    // Timeframe classification: daily/weekly handled, monthly and intraday not.
    expectEqual('A', 'classify-1d', SC.classifyTimeframe('1d').handled, true);
    expectEqual('A', 'classify-1w', SC.classifyTimeframe('1w').handled, true);
    expectEqual('A', 'classify-1mo-excluded', SC.classifyTimeframe('1mo').reason, 'calendar-month-branch-owns-this');
    for (const tf of ['5m', '15m', '1h', '4h']) {
        expectEqual('A', `classify-${tf}-epoch-aligned-is-correct`, SC.classifyTimeframe(tf).handled, false);
    }

    // Per-instrument-class extensibility: two implemented; CME and US equities
    // declared. `us-equities` is not a class invented for coverage — the product
    // registry classifies AAPL-style tickers as `stocks`, so the market-type map
    // needs a real destination for them. Declared status means epoch fallback,
    // i.e. no behaviour change for equities datasets.
    const classes = SC.instrumentClasses();
    expectEqual('A', 'class-ids', classes.map((c) => c.id).join(','),
        'fx,crypto,cme-index-futures,us-equities,unknown');
    expectEqual('A', 'us-equities-declared-not-implemented',
        SC.describeClass('us-equities').status, 'declared');

    // The market-type map is total over what the product registry can return.
    expectEqual('A', 'market-type-map-forex', SC.classFromMarketType('forex'), 'fx');
    expectEqual('A', 'market-type-map-crypto', SC.classFromMarketType('crypto'), 'crypto');
    expectEqual('A', 'market-type-map-futures', SC.classFromMarketType('futures'), 'cme-index-futures');
    expectEqual('A', 'market-type-map-stocks', SC.classFromMarketType('stocks'), 'us-equities');
    expectEqual('A', 'market-type-map-unknown-is-null', SC.classFromMarketType('widgets'), null);
    // Every class the map targets must exist in the registry above.
    for (const type of ['forex', 'crypto', 'futures', 'stocks']) {
        expectEqual('A', `market-type-target-exists:${type}`,
            SC.describeClass(SC.classFromMarketType(type)) !== null, true);
    }
    expectEqual('A', 'fx-zone', SC.describeClass('fx').zone, 'America/New_York');
    expectEqual('A', 'fx-daily-open-minute-of-day', SC.describeClass('fx').dailyOpenMinute, SESSION_OPEN_MINUTE_OF_DAY);
    expectEqual('A', 'fx-week-open-weekday-sunday', SC.describeClass('fx').weekOpenWeekday, 0);
    expectEqual('A', 'fx-label-offset-days', SC.describeClass('fx').labelOffsetDays, 1);
    expectEqual('A', 'crypto-zone', SC.describeClass('crypto').zone, 'UTC');
    expectEqual('A', 'crypto-daily-open-minute-of-day', SC.describeClass('crypto').dailyOpenMinute, 0);
    expectEqual('A', 'cme-declared-not-implemented', SC.describeClass('cme-index-futures').status, 'declared');
    expectEqual('A', 'cme-requires-unsourced-calendar-inputs',
        SC.describeClass('cme-index-futures').requires.length, 3);

    expectEqual('A', 'resolve-EURUSD', SC.resolveInstrumentClass('EURUSD'), 'fx');
    expectEqual('A', 'resolve-BTCUSD', SC.resolveInstrumentClass('BTCUSD'), 'crypto');
    expectEqual('A', 'resolve-NQ', SC.resolveInstrumentClass('NQ'), 'cme-index-futures');
    expectEqual('A', 'resolve-unclassifiable-is-not-guessed', SC.resolveInstrumentClass('WIDGET1'), 'unknown');

    // A declared-but-unimplemented class must degrade to today's behaviour,
    // never throw and never invent a session.
    const t = Date.UTC(2013, 0, 4, 12);
    expectEqual('A', 'cme-falls-back-to-epoch',
        SC.bucketStart(t, '1d', { timeframeMs: 86400000, symbol: 'NQ' }),
        SC.epochAlignedBucketStart(t, 86400000));
    expectEqual('A', 'unknown-falls-back-to-epoch',
        SC.bucketStart(t, '1d', { timeframeMs: 86400000, symbol: 'WIDGET1' }),
        SC.epochAlignedBucketStart(t, 86400000));

    // THE label convention, stated as a value: Sunday 17:00 ET open is MONDAY.
    const sundayOpen = Date.UTC(2013, 0, 6, 22);
    const sundayLabel = SC.sessionLabel(sundayOpen, '1w', { symbol: FX });
    expectEqual('A', 'sunday-1700ET-open-is-named-monday',
        `${sundayLabel.key}/${sundayLabel.weekday}`, '2013-01-07/Mon');
    expectEqual('A', 'sunday-open-local-weekday-is-sunday', sundayLabel.openLocalWeekday, 'Sun');
    expectEqual('A', 'sunday-open-local-minute-of-day', sundayLabel.openLocalMinuteOfDay, SESSION_OPEN_MINUTE_OF_DAY);
    const thursdayOpen = H.EXPECTED.friday20130104.openMs;
    const thursdayLabel = SC.sessionLabel(thursdayOpen, '1d', { symbol: FX });
    expectEqual('A', 'thursday-1700ET-open-is-named-friday',
        `${thursdayLabel.key}/${thursdayLabel.weekday}`, '2013-01-04/Fri');
});

cellTest('cellA2: DST anchor is not a constant offset', () => {
    const { SC } = makeHarness();
    // The same local anchor maps to DIFFERENT UTC offsets either side of the
    // transition. A fixed millisecond subtraction cannot produce this.
    const winter = SC.openLocalTime(Date.UTC(2013, 0, 3, 22), { symbol: FX });
    const summer = SC.openLocalTime(Date.UTC(2013, 5, 3, 21), { symbol: FX });
    expectEqual('A2', 'winter-anchor-local-minute-of-day', winter.minuteOfDay, SESSION_OPEN_MINUTE_OF_DAY);
    expectEqual('A2', 'summer-anchor-local-minute-of-day', summer.minuteOfDay, SESSION_OPEN_MINUTE_OF_DAY);
    expectEqual('A2', 'winter-utc-offset-minutes', winter.offsetMinutes, 300);
    expectEqual('A2', 'summer-utc-offset-minutes', summer.offsetMinutes, 240);
    expectEqual('A2', 'anchor-offset-is-not-constant', winter.offsetMinutes === summer.offsetMinutes, false);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell B (requirement a) — the PO-confirmed 2013-01-04/05 EURUSD case.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellB: daily — Friday 4 Jan 2013 exists with Friday\'s session; no Saturday bar; no Sunday stub', () => {
    const harness = makeHarness();
    const { SC } = harness;
    const daily = harness.chart._resampleDataFull(PO_BARS, '1d');

    const openMs = H.EXPECTED.friday20130104.openMs;
    const closeMs = H.EXPECTED.friday20130104.closeMs;

    // 4 session weeks x 5 session days.
    expectEqual('B', 'daily-bucket-count', daily.length, 20,
        `todayBaseline=${FROZEN_TODAY.po1d.length}`);

    // B1 — a bucket opens at Friday's session open instant.
    const friday = daily.find((b) => b.t === openMs);
    expectEqual('B', 'friday-session-open-bucket-exists',
        friday ? new Date(friday.t).toISOString() : 'ABSENT',
        new Date(openMs).toISOString());

    // B2 — and it carries Friday's whole session, byte for byte.
    const expectedFriday = aggregateWindow(PO_BARS, openMs, closeMs);
    expectEqual('B', 'friday-bucket-ohlcv-equals-friday-session',
        ohlcvOf(friday), { o: expectedFriday.o, h: expectedFriday.h, l: expectedFriday.l, c: expectedFriday.c, v: expectedFriday.v },
        `rawBars=${expectedFriday.count}`);

    // B3 — it is NAMED Friday, and stamped at the open (17:00 ET on screen).
    if (friday) {
        const label = SC.sessionLabel(friday.t, '1d', { symbol: FX });
        expectEqual('B', 'friday-bucket-label',
            `${label.key}/${label.weekday}`,
            `${H.EXPECTED.friday20130104.labelKey}/${H.EXPECTED.friday20130104.labelWeekday}`);
        expectEqual('B', 'friday-bucket-screen-stamp',
            H.renderedInEasternTime(friday.t).stamp, "Thu 03 01 '13 17:00");
    } else {
        expectEqual('B', 'friday-bucket-label', 'ABSENT', '2013-01-04/Fri');
        expectEqual('B', 'friday-bucket-screen-stamp', 'ABSENT', "Thu 03 01 '13 17:00");
    }

    // B4 — no bar may be NAMED Saturday or Sunday. The Sunday-evening reopen
    // folds into Monday, so a Sunday stub bar cannot exist.
    const labels = labelKeysOf(SC, daily, '1d');
    const forbidden = labels.filter((l) => H.EXPECTED.forbiddenDailyLabels.includes(l.key));
    expectEqual('B', 'no-weekend-named-daily-bars',
        forbidden.map((l) => `${l.key}(${l.weekday})@${new Date(l.t).toISOString()}`).join('|') || 'none',
        'none');
    const nonSessionWeekdays = labels.filter((l) => !SESSION_WEEKDAYS.has(l.weekday));
    expectEqual('B', 'every-daily-bar-named-a-weekday',
        nonSessionWeekdays.map((l) => `${l.key}/${l.weekday}`).join('|') || 'none', 'none');

    // B5 — every daily bucket is stamped at 17:00 ET (stamp-at-open).
    const offAnchor = daily
        .map((b) => ({ t: b.t, local: H.renderedInEasternTime(b.t).hhmm }))
        .filter((x) => x.local !== '17:00');
    expectEqual('B', 'every-daily-open-is-1700-eastern',
        offAnchor.length === 0 ? 'none' : `${offAnchor.length} off-anchor, first=${new Date(offAnchor[0].t).toISOString()}@${offAnchor[0].local}`,
        'none');

    // B6 — the Sunday reopen bar is the OPEN of the Monday-named bucket.
    const mondayOpenMs = H.EXPECTED.weeks[0].openMs;
    const mondayBucket = daily.find((b) => b.t === mondayOpenMs);
    const sundayReopenBar = PO_BARS.find((b) => b.t === mondayOpenMs);
    expectEqual('B', 'sunday-reopen-folds-into-monday-open',
        mondayBucket ? mondayBucket.o : 'ABSENT', sundayReopenBar.o,
        `mondayLabel=${mondayBucket ? SC.sessionLabel(mondayBucket.t, '1d', { symbol: FX }).key : 'n/a'}`);

    // B7 — the exact PO screen observation must be gone: today a bar renders as
    // "Sat 05 01 '13 19:00" and no bar renders on Friday 4 Jan.
    const screen = daily.map((b) => H.renderedInEasternTime(b.t));
    expectEqual('B', 'phantom-saturday-5-jan-1900-bar-absent',
        screen.some((s) => s.stamp === "Sat 05 01 '13 19:00"), false);
    expectEqual('B', 'friday-session-bar-is-stamped-thu-1700-et',
        screen.some((s) => s.weekday === 'Thu' && s.key === '2013-01-03' && s.hhmm === '17:00'), true,
        'stamp-at-open: Friday\'s session bar opens Thu 17:00 ET and is NAMED Fri 4 Jan');
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell C (requirement b) — weekly opens Sunday 17:00 ET, named Monday, x4.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellC: weekly — opens Sunday 17:00 ET and is named Monday, four consecutive weeks', () => {
    const harness = makeHarness();
    const { SC } = harness;
    const weekly = harness.chart._resampleDataFull(PO_BARS, '1w');

    expectEqual('C', 'weekly-bucket-count', weekly.length, H.EXPECTED.weeks.length,
        `todayBaseline=${FROZEN_TODAY.po1w.length}`);

    expectEqual('C', 'weekly-open-instants',
        weekly.map((b) => new Date(b.t).toISOString()),
        H.EXPECTED.weeks.map((w) => new Date(w.openMs).toISOString()));

    expectEqual('C', 'weekly-labels-are-mondays',
        weekly.map((b) => {
            const l = SC.sessionLabel(b.t, '1w', { symbol: FX });
            return `${l.key}/${l.weekday}`;
        }),
        H.EXPECTED.weeks.map((w) => `${w.labelKey}/${w.labelWeekday}`));

    expectEqual('C', 'weekly-opens-render-sunday-1700-eastern',
        weekly.map((b) => {
            const s = H.renderedInEasternTime(b.t);
            return `${s.weekday} ${s.hhmm}`;
        }),
        H.EXPECTED.weeks.map(() => 'Sun 17:00'));

    // The epoch-week open the PO read off the screen as "Wed 2 Jan '13 19:00"
    // must no longer be produced.
    expectEqual('C', 'legacy-epoch-week-open-absent',
        weekly.some((b) => b.t === H.EXPECTED.legacyEpochWeekOpenForJan4), false,
        `legacyOpen=${new Date(H.EXPECTED.legacyEpochWeekOpenForJan4).toISOString()} rendersAs=${H.renderedInEasternTime(H.EXPECTED.legacyEpochWeekOpenForJan4).stamp}`);
    expectEqual('C', 'no-weekly-open-renders-wednesday-1900',
        weekly.some((b) => {
            const s = H.renderedInEasternTime(b.t);
            return s.weekday === 'Wed' && s.hhmm === '19:00';
        }), false);

    // Each weekly bucket must aggregate exactly its session week.
    for (let i = 0; i < H.EXPECTED.weeks.length; i++) {
        const from = H.EXPECTED.weeks[i].openMs;
        const to = i + 1 < H.EXPECTED.weeks.length ? H.EXPECTED.weeks[i + 1].openMs : H.PO_WINDOW.endMs;
        const want = aggregateWindow(PO_BARS, from, to);
        const got = weekly.find((b) => b.t === from);
        expectEqual('C', `week-${H.EXPECTED.weeks[i].labelKey}-ohlcv`,
            ohlcvOf(got), { o: want.o, h: want.h, l: want.l, c: want.c, v: want.v },
            `rawBars=${want.count}`);
    }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell D (requirement c) — DST transition matrices, both US boundaries.
 * ───────────────────────────────────────────────────────────────────────── */

function dstMatrix(bars) {
    const harness = makeHarness();
    const daily = harness.chart._resampleDataFull(bars, '1d');
    const matrix = daily.map((b) => {
        const local = harness.SC.openLocalTime(b.t, { symbol: FX });
        return {
            openIso: new Date(b.t).toISOString(),
            localDate: local.date,
            localWeekday: local.weekday,
            localMinuteOfDay: local.minuteOfDay,
            offsetMinutes: local.offsetMinutes,
        };
    });
    const spans = [];
    for (let i = 1; i < daily.length; i++) spans.push(daily[i].t - daily[i - 1].t);
    return { daily, matrix, spans };
}

function assertDstCell(cell, bars, spec, oddSpanMs, oddLabel) {
    const { daily, matrix, spans } = dstMatrix(bars);

    // 1. The local anchor holds at 17:00 across the transition — the whole point.
    const distinctAnchors = [...new Set(matrix.map((r) => r.localMinuteOfDay))].sort((a, b) => a - b);
    expectEqual(cell, 'local-anchor-minute-of-day-is-constant-1020',
        distinctAnchors, [SESSION_OPEN_MINUTE_OF_DAY]);

    // 2. Both UTC offsets are represented, so the window really spans the boundary.
    expectEqual(cell, 'both-utc-offsets-observed',
        [...new Set(matrix.map((r) => r.offsetMinutes))].sort((a, b) => a - b), [240, 300]);

    // 3. Exactly one session is 23h (spring) or 25h (fall); the rest are 24h.
    //    A fixed-millisecond anchor produces 24h everywhere — this is the
    //    structural falsifier for "implemented as a constant subtraction".
    const spanCounts = {};
    for (const s of spans) spanCounts[s / 3600000] = (spanCounts[s / 3600000] || 0) + 1;
    expectEqual(cell, `exactly-one-${oddLabel}-session`, spanCounts[oddSpanMs / 3600000] || 0, 1,
        `spanHistogramHours=${JSON.stringify(spanCounts)}`);
    expectEqual(cell, 'all-other-sessions-24h',
        Object.keys(spanCounts).filter((k) => Number(k) !== oddSpanMs / 3600000), ['24']);

    // 4. The transition lands on the Director-named instants.
    const idx = daily.findIndex((b) => b.t === spec.nextOpenMs);
    expectEqual(cell, 'transition-open-instant-present',
        idx >= 0 ? new Date(daily[idx].t).toISOString() : 'ABSENT',
        new Date(spec.nextOpenMs).toISOString());
    if (idx > 0) {
        expectEqual(cell, 'session-before-transition-open',
            new Date(daily[idx - 1].t).toISOString(),
            new Date(spec.shortSessionOpenMs ?? spec.longSessionOpenMs).toISOString());
        expectEqual(cell, `transition-session-span-is-${oddLabel}`,
            daily[idx].t - daily[idx - 1].t, spec.expectedSpanMs);
    } else {
        expectEqual(cell, 'session-before-transition-open', 'ABSENT',
            new Date(spec.shortSessionOpenMs ?? spec.longSessionOpenMs).toISOString());
        expectEqual(cell, `transition-session-span-is-${oddLabel}`, 'ABSENT', spec.expectedSpanMs);
    }

    note(cell, 'matrix', true, JSON.stringify(matrix));
}

cellTest('cellD1: DST spring-forward 2013-03-10 — local 17:00 holds, one 23h session', () => {
    assertDstCell('D1', SPRING_BARS, H.EXPECTED.dst.spring2013, 23 * 3600000, '23h');
});

cellTest('cellD2: DST fall-back 2013-11-03 — local 17:00 holds, one 25h session', () => {
    assertDstCell('D2', FALL_BARS, H.EXPECTED.dst.fall2013, 25 * 3600000, '25h');
});

cellTest('cellD3: weekly anchor survives both DST boundaries at Sunday 17:00 local', () => {
    const harness = makeHarness();
    for (const [name, bars] of [['spring', SPRING_BARS], ['fall', FALL_BARS]]) {
        const weekly = harness.chart._resampleDataFull(bars, '1w');
        const local = weekly.map((b) => {
            const l = harness.SC.openLocalTime(b.t, { symbol: FX });
            return `${l.weekday} ${l.minuteOfDay}`;
        });
        expectEqual('D3', `${name}-weekly-opens-sunday-1020`,
            [...new Set(local)], ['Sun 1020']);
    }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell E (requirement d) — monthly output must be byte-identical to today.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellE: monthly is byte-identical to today (calendar-month branch untouched)', () => {
    const harness = makeHarness();
    for (const [name, tf] of [['cont1mo', '1mo'], ['cont3mo', '3mo']]) {
        const series = harness.chart._resampleDataFull(CONT_BARS, tf);
        expectEqual('E', `${name}-length`, series.length, FROZEN_TODAY[name].length);
        expectEqual('E', `${name}-sha256`, H.seriesSha256(series), FROZEN_TODAY[name].sha256);
    }
    // And the monthly branch must not consult the session calendar at all.
    const probe = makeHarness();
    probe.SC.resetCaches();
    probe.chart._resampleDataFull(CONT_BARS, '1mo');
    expectEqual('E', 'monthly-never-enters-session-branch',
        probe.SC.stats().boundaryRecomputes, 0,
        `stats=${JSON.stringify(probe.SC.stats())}`);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell F (requirement e) — intraday output must be byte-identical to today.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellF: 5m/15m/1h/4h are byte-identical to today', () => {
    const harness = makeHarness();
    const cases = [
        ['min5m', '5m', MIN_BARS],
        ['min15m', '15m', MIN_BARS],
        ['min1h', '1h', MIN_BARS],
        ['min4h', '4h', MIN_BARS],
        ['cont1h', '1h', CONT_BARS],
        ['cont4h', '4h', CONT_BARS],
        ['po1h', '1h', PO_BARS],
    ];
    for (const [name, tf, bars] of cases) {
        const series = harness.chart._resampleDataFull(bars, tf);
        expectEqual('F', `${name}-length`, series.length, FROZEN_TODAY[name].length);
        expectEqual('F', `${name}-sha256`, H.seriesSha256(series), FROZEN_TODAY[name].sha256);
    }
    const probe = makeHarness();
    probe.SC.resetCaches();
    for (const tf of ['5m', '15m', '1h', '4h']) probe.chart._resampleDataFull(MIN_BARS, tf);
    expectEqual('F', 'intraday-never-enters-session-branch',
        probe.SC.stats().boundaryRecomputes, 0,
        `stats=${JSON.stringify(probe.SC.stats())}`);
});

cellTest('cellF2: crypto daily stays 00:00 UTC; crypto weekly moves to Monday 00:00 UTC', () => {
    const harness = makeHarness({ symbol: 'BTCUSD' });

    // Daily: unchanged. The epoch floor already lands on 00:00 UTC.
    const daily = harness.chart._resampleDataFull(CONT_BARS, '1d');
    expectEqual('F2', 'crypto1d-length', daily.length, FROZEN_TODAY.crypto1d.length);
    expectEqual('F2', 'crypto1d-sha256', H.seriesSha256(daily), FROZEN_TODAY.crypto1d.sha256);

    // Weekly: this is the ONE output changed on the worker's own judgement, so
    // it is pinned on both sides. Today the epoch week floor opens THURSDAY
    // 00:00 UTC (the Unix epoch was a Thursday). The crypto class anchors
    // weekOpenWeekday = 1, i.e. MONDAY 00:00 UTC, which is the industry
    // convention. RATIFICATION STILL OWED — see PACKET.md; the digests below
    // make the change impossible to alter silently in the meantime.
    const weekly = harness.chart._resampleDataFull(CONT_BARS, '1w');
    const opens = weekly.map((b) => new Date(b.t).getUTCDay());
    const openWeekdays = [...new Set(opens)].map((d) => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]);

    expectEqual('F2', 'crypto1w-open-weekday-today-is-thursday-epoch-floor',
        openWeekdays.join(','), WIRED ? 'Mon' : 'Thu',
        `wired=${WIRED} opens=${openWeekdays.join(',')}`);
    expectEqual('F2', 'crypto1w-opens-at-midnight-utc',
        weekly.every((b) => b.t % 86400000 === 0), true);

    // Pre-fix digest, pinned. In the broken state this must match exactly; once
    // wired it must NOT, or the crypto weekly change did not happen.
    expectEqual('F2', 'crypto1w-differs-from-frozen-pre-fix-iff-wired',
        H.seriesSha256(weekly) === FROZEN_TODAY.crypto1w.sha256, !WIRED,
        `actualSha=${H.seriesSha256(weekly)} frozenPreFix=${FROZEN_TODAY.crypto1w.sha256} `
        + `len=${weekly.length} frozenLen=${FROZEN_TODAY.crypto1w.length}`);

    // And the post-fix digest is pinned too, so "moved" cannot mean "moved
    // anywhere". Only meaningful in the wired states.
    if (WIRED) {
        expectEqual('F2', 'crypto1w-post-fix-sha256',
            H.seriesSha256(weekly), FROZEN_WIRED.crypto1w.sha256);
        expectEqual('F2', 'crypto1w-post-fix-length', weekly.length, FROZEN_WIRED.crypto1w.length);
    }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell N — the wiring must resolve a real instrument class from a property the
 * PRODUCT actually sets, and must actually change the product's output.
 *
 * This cell exists because its absence let a no-op patch certify green. The
 * first version of the wiring read `this.sessionCalendarSymbol || this.currentPair
 * || this.symbol || this.pair` — four properties with ZERO assignments in
 * chart.js — and the harness set the first of them itself. Every value cell
 * passed while the real product resolved an empty symbol, fell through to epoch
 * alignment and produced byte-identical pre-fix output.
 *
 * So this cell asserts three separate things:
 *   1. STRUCTURAL: every property the patch reads is assigned in chart.js.
 *   2. RESOLUTION: the class is non-empty for the symbol shapes chart.js really
 *      stores — not just for a clean ticker.
 *   3. EFFECT: with only product-set properties populated, the output MOVES.
 *      An unchanged digest here means the patch does nothing, whatever else
 *      passes.
 * ───────────────────────────────────────────────────────────────────────── */

/** Every shape chart.js can assign to `currentSymbol`, with its 13 sites. */
const CURRENT_SYMBOL_SHAPES = [
    { symbol: 'EURUSD', origin: 'resolveSessionTickerForFileId / detected CSV symbol', expect: 'fx' },
    { symbol: 'EUR/USD', origin: 'finalize() -> _formatPairTicker slash form', expect: 'fx' },
    { symbol: 'EURUSD_2013_1M', origin: 'session.fileName stem (chart.js:2548)', expect: 'fx' },
    { symbol: 'EURUSD_FULL_1MIN_1MIN', origin: 'FirstRate FX bundle name', expect: 'fx' },
    { symbol: '20251028_194229_GBPUSD', origin: 'Dukascopy upload name', expect: 'fx' },
    { symbol: 'BTCUSD', origin: 'crypto dataset', expect: 'crypto' },
    { symbol: 'BTC_full_1min', origin: 'FirstRate crypto base-only bundle', expect: 'crypto' },
    { symbol: 'NQ', origin: '_displaySessionFuturesSymbol root', expect: 'cme-index-futures' },
    { symbol: 'ES_week_1min_1min', origin: 'FirstRate futures bundle', expect: 'cme-index-futures' },
    { symbol: 'AAPL_full_1min_adj_split', origin: 'FirstRate stock bundle', expect: 'us-equities' },
];

/** Shapes that carry no instrument identity — must NOT be guessed at. */
const UNIDENTIFIABLE_SHAPES = [
    { symbol: 'FILE_123', origin: 'pair switch with no resolvable name (chart.js:2558/5505/10123)' },
    { symbol: 'CHART', origin: 'extractSymbolFromFilename untitled branch (chart.js:19807)' },
    { symbol: 'EURUSD1', origin: 'extractSymbolFromFilename short-name branch (chart.js:19812)' },
    { symbol: '', origin: 'currentSymbol still null (chart.js:1133)' },
];

cellTest('cellN: wired product resolves an instrument class from a product-set property', () => {
    // ── 1. STRUCTURAL ────────────────────────────────────────────────────
    // Whatever the patch reads must exist in chart.js. This is the assertion
    // whose absence caused the block, so it is derived from the patch TEXT
    // rather than restated by hand — it cannot drift away from the wiring.
    // Scanned over the WHOLE addition text, excluding only the exact internal
    // names the wiring defines on itself. r2 sliced from a marker and filtered
    // by `_session` prefix; both were walkable. The exclusion list is itself
    // asserted below, so it cannot quietly grow to hide a real read.
    const readProps = H.symbolPropertiesInPatch();
    expectEqual('N', 'patch-reads-only-declared-symbol-properties',
        readProps.join(','), H.SYMBOL_PROPERTIES_READ.join(','));
    for (const prop of readProps) {
        expectEqual('N', `chart.js-assigns-this.${prop}`,
            H.chartAssignmentCount(prop) > 0, true,
            `assignments=${H.chartAssignmentCount(prop)}`);
    }
    // Method calls are held to the same standard by a different test: a method
    // lives on the prototype and is never `this.x = `, so it is checked for a
    // DEFINITION. Splitting the two is what lets the data-property check above
    // stay strict instead of being loosened to accommodate `parseTimeframe`.
    const calls = H.methodCallsInPatch();
    expectEqual('N', 'patch-calls-only-methods-that-exist', calls.join(','), 'parseTimeframe');
    for (const name of calls) {
        expectEqual('N', `chart.js-defines-method:${name}`, H.chartDefinesMethod(name), true);
    }
    // Every excluded name must be one the wiring actually defines, and every
    // internal name the wiring uses must be on the list. An attacker adding
    // `this._sessionSneakySymbol` now fails here rather than slipping the filter.
    expectEqual('N', 'internal-exclusions-are-all-used-by-the-patch',
        H.internalPropertiesInPatch(), [...H.WIRING_INTERNAL_PROPERTIES].sort());
    for (const prop of H.WIRING_INTERNAL_PROPERTIES) {
        expectEqual('N', `internal-property-is-not-a-product-read:${prop}`,
            H.chartAssignmentCount(prop), 0);
    }
    // And the four properties of the rejected patch are confirmed non-existent,
    // so this cell also documents why they cannot be used.
    for (const prop of ['sessionCalendarSymbol', 'currentPair', 'symbol', 'pair']) {
        expectEqual('N', `chart.js-does-not-assign-this.${prop}`,
            H.chartAssignmentCount(prop), 0);
    }

    // ── 2. RESOLUTION ────────────────────────────────────────────────────
    // The harness sets ONLY `currentSymbol`, exactly like the product.
    for (const shape of CURRENT_SYMBOL_SHAPES) {
        const h = makeHarness({ symbol: shape.symbol });
        const cls = typeof h.chart._sessionInstrumentClass === 'function'
            ? h.chart._sessionInstrumentClass() : null;
        expectEqual('N', `class-for:${shape.symbol}`, String(cls), shape.expect, `origin=${shape.origin}`);
        expectEqual('N', `class-is-non-empty:${shape.symbol}`, !!cls && cls !== 'unknown', true);
    }

    // Unidentifiable labels must resolve to nothing — never to a guessed FX
    // session. MarketCalculationEngine.detectMarketType defaults to 'forex' for
    // these, which is right for P&L and wrong here, so the wiring gates on
    // isRegistered() instead. This is the assertion that keeps that gate.
    for (const shape of UNIDENTIFIABLE_SHAPES) {
        const h = makeHarness({ symbol: shape.symbol });
        const cls = typeof h.chart._sessionInstrumentClass === 'function'
            ? h.chart._sessionInstrumentClass() : null;
        expectEqual('N', `unidentifiable-is-not-guessed:${shape.symbol || '(empty)'}`,
            cls === null, true, `class=${cls} origin=${shape.origin}`);

        // And the loss is announced rather than silently absorbed (§A4c).
        h.chart._resampleDataFull(PO_BARS, '1d');
        expectEqual('N', `unidentifiable-announces-degradation:${shape.symbol || '(empty)'}`,
            [...new Set(h.missingModules)].join(','), 'SessionCalendar.unresolved-instrument');
    }

    // Intraday must NOT announce degradation: nothing is lost there.
    const intraday = makeHarness({ symbol: 'FILE_123' });
    intraday.chart._resampleDataFull(MIN_BARS, '5m');
    expectEqual('N', 'unidentifiable-does-not-cry-wolf-on-intraday',
        [...new Set(intraday.missingModules)].join(',') || 'none', 'none');

    // ── 3. EFFECT ────────────────────────────────────────────────────────
    // The whole point. With only product-set properties populated, daily and
    // weekly output must MOVE off the frozen pre-fix digest.
    for (const shape of CURRENT_SYMBOL_SHAPES.filter((s) => s.expect === 'fx')) {
        const h = makeHarness({ symbol: shape.symbol });
        const daily = h.chart._resampleDataFull(PO_BARS, '1d');
        expectEqual('N', `product-shape-changes-daily-output:${shape.symbol}`,
            H.seriesSha256(daily) === FROZEN_TODAY.po1d.sha256, false,
            `len=${daily.length} todayLen=${FROZEN_TODAY.po1d.length}`);
        expectEqual('N', `product-shape-has-friday-session:${shape.symbol}`,
            daily.some((b) => b.t === H.EXPECTED.friday20130104.openMs), true);
        expectEqual('N', `product-shape-has-no-phantom-saturday:${shape.symbol}`,
            daily.map((b) => H.renderedInEasternTime(b.t).stamp).includes("Sat 05 01 '13 19:00"), false);
    }

    // Conversely, an unidentifiable label must reproduce today EXACTLY — the
    // degradation is announced, not approximated.
    const unknown = makeHarness({ symbol: 'FILE_123' });
    expectEqual('N', 'unidentifiable-keeps-todays-output-exactly',
        H.seriesSha256(unknown.chart._resampleDataFull(PO_BARS, '1d')), FROZEN_TODAY.po1d.sha256);

    // ── registry dependency ──────────────────────────────────────────────
    // If MarketCalculationEngine is absent the wiring must degrade, not throw.
    const noEngine = makeHarness({ symbol: 'EURUSD', omitMarketCalc: true });
    expectEqual('N', 'absent-registry-does-not-throw',
        typeof noEngine.chart._sessionInstrumentClass === 'function'
            ? String(noEngine.chart._sessionInstrumentClass()) : 'null',
        'null');
    expectEqual('N', 'absent-registry-keeps-todays-output',
        H.seriesSha256(noEngine.chart._resampleDataFull(PO_BARS, '1d')), FROZEN_TODAY.po1d.sha256);
    expectEqual('N', 'absent-registry-announces-degradation',
        [...new Set(noEngine.missingModules)].join(','), 'SessionCalendar.unresolved-instrument');
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell N2 — the memo must not poison itself when the registry arrives late.
 *
 * r2 memoised `_sessionInstrumentClass` per symbol and cached a `null` result
 * unconditionally. If the registry was absent at the first call — a deferred
 * script, a slow network, or a shell that declares market-calculations.js AFTER
 * chart.js, which `legacy-index.html` actually does — the symbol stayed
 * unresolved for the life of the chart. The chart was permanently epoch-aligned
 * while every health signal read green: §A4c capability loss without failure.
 *
 * Cell N could not catch it. `omitMarketCalc` tests PERMANENT absence, and a
 * permanently-absent registry gives the same answer as a poisoned cache. Only a
 * RECOVERY sequence separates them.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellN2: a registry that arrives late must still resolve — the memo must not poison', () => {
    const h = makeHarness({ symbol: FX, omitMarketCalc: true });
    const wiredHere = typeof h.chart._sessionInstrumentClass === 'function';

    // ── before: registry absent ──
    const before = wiredHere ? h.chart._sessionInstrumentClass() : null;
    expectEqual('N2', 'class-before-registry-is-null', before === null, true);
    const dailyBefore = h.chart._resampleDataFull(PO_BARS, '1d');
    expectEqual('N2', 'output-before-registry-is-todays',
        H.seriesSha256(dailyBefore), FROZEN_TODAY.po1d.sha256,
        `buckets=${dailyBefore.length}`);

    // ── the registry loads ──
    const engine = h.installMarketCalc();
    expectEqual('N2', 'registry-is-now-present', !!engine, true);

    // ── after: the chart MUST recover ──
    const after = wiredHere ? h.chart._sessionInstrumentClass() : null;
    expectEqual('N2', 'class-recovers-after-registry-loads', String(after), 'fx',
        `before=${before} after=${after}`);

    const dailyAfter = h.chart._resampleDataFull(PO_BARS, '1d');
    expectEqual('N2', 'output-recovers-after-registry-loads',
        H.seriesSha256(dailyAfter) === FROZEN_TODAY.po1d.sha256, false,
        `bucketsAfter=${dailyAfter.length} (20 = recovered, 24 = still poisoned)`);
    expectEqual('N2', 'recovered-bucket-count', dailyAfter.length, 20);
    expectEqual('N2', 'recovered-friday-session-present',
        dailyAfter.some((b) => b.t === H.EXPECTED.friday20130104.openMs), true);

    // The same must hold on the incremental path, which memoises independently
    // of the full path only insofar as both go through the one chart object.
    const inc = makeHarness({ symbol: FX, omitMarketCalc: true });
    inc.chart._resampleDataFull(PO_BARS.slice(0, 50), '1d');
    inc.installMarketCalc();
    const incAfter = incrementalSeries(inc, PO_BARS, '1d');
    expectEqual('N2', 'incremental-path-recovers-too',
        H.seriesSha256(incAfter.series) === FROZEN_TODAY.po1d.sha256, false,
        `len=${incAfter.series.length}`);

    // ── the distinction that makes the fix correct ──
    // A settled negative from a PRESENT registry is legitimately cacheable; a
    // negative because the registry was absent is not. Asserted on the helper
    // directly so the contract is pinned, not just its consequence.
    const { SC } = makeHarness();
    const cases = [
        ['registry-absent', SC.resolveIdentity(null, 'EURUSD'), 'registry-unavailable', false],
        ['registry-present-unknown-symbol', SC.resolveIdentity(makeHarness().engine, 'FILE_123'),
            'symbol-not-registered', true],
        ['registry-present-known-symbol', SC.resolveIdentity(makeHarness().engine, 'EURUSD'),
            'resolved', true],
        ['empty-symbol', SC.resolveIdentity(makeHarness().engine, ''), 'no-symbol', true],
    ];
    for (const [name, got, reason, cacheable] of cases) {
        expectEqual('N2', `identity-reason:${name}`, got.reason, reason);
        expectEqual('N2', `identity-cacheable:${name}`, got.cacheable, cacheable);
    }

    // A registry that throws did not answer, so its negative is not cacheable.
    const thrower = { isRegistered() { throw new Error('boom'); }, getSpecs() { return {}; } };
    const threw = SC.resolveIdentity(thrower, 'EURUSD');
    expectEqual('N2', 'identity-reason:registry-throws', threw.reason, 'registry-threw');
    expectEqual('N2', 'identity-cacheable:registry-throws', threw.cacheable, false);

    // ── the unstated premise under `symbol-not-registered -> cacheable: true` ──
    //
    // Caching a settled negative FOREVER is only safe because the registry is
    // immutable at runtime: if a row could be added after load, the memo would
    // poison in the other direction — the same bug, mirrored. That premise was
    // load-bearing and unstated, so it is pinned here.
    const mc = H.readRepo(H.REL.marketCalc);
    expectEqual('N2', 'registry-is-a-module-level-const-literal',
        /^const INSTRUMENT_REGISTRY = \{/m.test(mc), true);
    expectEqual('N2', 'registry-is-assigned-once',
        (mc.match(/this\._registry\s*=/g) || []).length, 1);
    for (const mutator of ['registerInstrument', 'addInstrument', 'INSTRUMENT_REGISTRY[']) {
        expectEqual('N2', `registry-has-no-mutation-path:${mutator}`, mc.includes(mutator), false);
    }
    expectEqual('N2', 'registry-rows-do-not-change-across-two-loads',
        Object.keys(makeHarness().engine._registry).length,
        Object.keys(makeHarness().engine._registry).length);
    // Honest limit: it is a `const` binding, not a frozen object, and it is
    // published on `window`. Nothing in the codebase mutates it — that is the
    // whole basis for caching a negative — but the guarantee is convention.
    expectEqual('N2', 'registry-is-published-globally-and-NOT-frozen',
        mc.includes('window.INSTRUMENT_REGISTRY') && !mc.includes('Object.freeze(INSTRUMENT_REGISTRY'),
        true);
    note('N2', 'cacheable-true-rests-on-registry-immutability', true,
        'INSTRUMENT_REGISTRY is a const literal with no mutation path in-repo, but it is exposed on '
        + 'window and unfrozen. If a row ever becomes addable at runtime, symbol-not-registered must '
        + 'stop being cacheable.');

    // Structural: the wiring must consult `cacheable` before storing anything.
    const patchText = H.WIRING_PATCH.chartAdditions.map((a) => a.source).join('\n');
    expectEqual('N2', 'wiring-honours-the-cacheable-contract',
        /if\s*\(\s*identity\.cacheable\s*\)/.test(patchText), true);
    expectEqual('N2', 'wiring-keys-cache-on-engine-reference',
        patchText.includes('_sessionClassCacheEngine'), true);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell G (requirement f) — full path == incremental path.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellG: _resampleDataFull and _tryIncrementalResample agree for daily and weekly', () => {
    for (const tf of ['1d', '1w']) {
        const incHarness = makeHarness();
        const { series, incrementalCalls } = incrementalSeries(incHarness, PO_BARS, tf);

        // Guard against a silently-not-exercised incremental path (a lying gate).
        expectEqual('G', `${tf}-incremental-path-actually-ran`, incrementalCalls, PO_BARS.length - 1);

        const full = makeHarness().chart._resampleDataFull(PO_BARS, tf);
        const incText = H.serializeSeries(series);
        const fullText = H.serializeSeries(full);
        let firstDiff = 'none';
        if (incText !== fullText) {
            const a = incText.split('\n');
            const b = fullText.split('\n');
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                if (a[i] !== b[i]) { firstDiff = `row${i} inc=${a[i]} full=${b[i]}`; break; }
            }
        }
        expectEqual('G', `${tf}-incremental-equals-full`, firstDiff, 'none',
            `incLen=${series.length} fullLen=${full.length}`);
        expectEqual('G', `${tf}-incremental-sha256-equals-full`,
            H.seriesSha256(series), H.seriesSha256(full));
    }
});

/** First differing serialized row between two series, or 'none'. */
function firstRowDiff(incremental, full) {
    const a = H.serializeSeries(incremental).split('\n');
    const b = H.serializeSeries(full).split('\n');
    if (a.join('\n') === b.join('\n')) return 'none';
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (a[i] !== b[i]) return `row${i} inc=${a[i]} full=${b[i]}`;
    }
    return 'none';
}

cellTest('cellG2: unsorted / out-of-order appended bars must not split the two paths', () => {
    // NOTE FOR MANAGER A: this divergence exists TODAY as well as under the
    // simulated wiring — `_tryIncrementalResample` assumes the appended bar is
    // the newest and never bails when it is not. It is a SEPARATE pre-existing
    // mechanism from the session calendar. It is asserted here because
    // requirement (f) names the case and because a values gate that tolerates
    // path divergence is the lying-gate shape §A5 bans.
    //
    // TWO arrival patterns, because the obvious guard only handles the first:
    //
    //   SIMPLE     ... 197, 198, 199, 169        (older than its predecessor)
    //   STAIRCASE  ... 197, 198, 199, 169, 170   (170 is NEWER than 169, its
    //                                             immediate predecessor, but
    //                                             still OLDER than 199, the
    //                                             running maximum)
    //
    // A guard comparing `lastRaw.t` with `source[source.length - 2]` passes the
    // staircase and the paths diverge anyway. Only a running maximum holds.
    for (const tf of ['1d', '1w']) {
        const head = PO_BARS.slice(0, 200);
        const newest = head[head.length - 1];

        // ── SIMPLE ──
        const simple = makeHarness();
        const { live: simpleLive } = incrementalSeries(simple, head, tf);
        simpleLive.push(H.synthBar(9999, newest.t - 30 * 3600000));
        const simpleInc = simple.pipeline.getResampledSeries(simpleLive, tf, 0);
        const simpleFull = makeHarness().chart._resampleDataFull(simpleLive, tf);
        expectEqual('G2', `${tf}-unsorted-append-incremental-equals-full`,
            firstRowDiff(simpleInc, simpleFull), 'none',
            `incLen=${simpleInc.length} fullLen=${simpleFull.length}`);

        // ── STAIRCASE ──
        const stair = makeHarness();
        const { live: stairLive } = incrementalSeries(stair, head, tf);
        stairLive.push(H.synthBar(9999, newest.t - 30 * 3600000));
        stair.pipeline.getResampledSeries(stairLive, tf, 0);
        // Newer than the bar just appended, still behind the running maximum.
        stairLive.push(H.synthBar(9998, newest.t - 29 * 3600000));
        const stairInc = stair.pipeline.getResampledSeries(stairLive, tf, 0);
        const stairFull = makeHarness().chart._resampleDataFull(stairLive, tf);
        expectEqual('G2', `${tf}-staircase-append-incremental-equals-full`,
            firstRowDiff(stairInc, stairFull), 'none',
            `incLen=${stairInc.length} fullLen=${stairFull.length}`);

        // ── DEEP STAIRCASE ──
        // A whole ascending run behind the maximum, so a guard that merely
        // remembers "the last bar was out of order" cannot pass either.
        const deep = makeHarness();
        const { live: deepLive } = incrementalSeries(deep, head, tf);
        for (let k = 40; k >= 1; k -= 1) {
            deepLive.push(H.synthBar(9000 + k, newest.t - k * 3600000));
            deep.pipeline.getResampledSeries(deepLive, tf, 0);
        }
        const deepInc = deep.pipeline.getResampledSeries(deepLive, tf, 0);
        const deepFull = makeHarness().chart._resampleDataFull(deepLive, tf);
        expectEqual('G2', `${tf}-deep-staircase-incremental-equals-full`,
            firstRowDiff(deepInc, deepFull), 'none',
            `incLen=${deepInc.length} fullLen=${deepFull.length}`);
    }

    // Ordered appends must still take the incremental path — a guard that always
    // bails would pass every assertion above while destroying the optimisation.
    const ordered = makeHarness();
    const { incrementalCalls } = incrementalSeries(ordered, PO_BARS.slice(0, 200), '1d');
    expectEqual('G2', 'ordered-appends-still-use-incremental-path',
        incrementalCalls, 199, 'guard must not disable the fast path');
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell H (requirement g) — the §A5.1 negative control.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellH: kill-switch OFF reproduces today\'s epoch-aligned behaviour exactly', () => {
    const off = H.makeHarness({ mode: MODE, corruptCalendar: CORRUPT, symbol: FX, kill: true });
    expectEqual('H', 'kill-switch-engaged', off.SC.isEnabled(), false);

    for (const [name, tf, bars] of [['po1d', '1d', PO_BARS], ['po1w', '1w', PO_BARS]]) {
        const series = off.chart._resampleDataFull(bars, tf);
        expectEqual('H', `${name}-length-returns-to-today`, series.length, FROZEN_TODAY[name].length);
        expectEqual('H', `${name}-sha256-returns-to-today`, H.seriesSha256(series), FROZEN_TODAY[name].sha256);
    }

    // The defect itself must be back: no Friday session bucket, epoch week open present.
    const daily = off.chart._resampleDataFull(PO_BARS, '1d');
    const weekly = off.chart._resampleDataFull(PO_BARS, '1w');
    expectEqual('H', 'switch-off-friday-session-bucket-absent-again',
        daily.some((b) => b.t === H.EXPECTED.friday20130104.openMs), false);
    expectEqual('H', 'switch-off-phantom-saturday-present-again',
        daily.map((b) => H.renderedInEasternTime(b.t).stamp).includes("Sat 05 01 '13 19:00"), true);
    expectEqual('H', 'switch-off-epoch-week-open-present-again',
        weekly.some((b) => b.t === H.EXPECTED.legacyEpochWeekOpenForJan4), true);

    // Intraday and monthly are unaffected by the switch in either position.
    for (const [name, tf, bars] of [['min5m', '5m', MIN_BARS], ['cont1mo', '1mo', CONT_BARS]]) {
        expectEqual('H', `${name}-switch-off-sha256`,
            H.seriesSha256(off.chart._resampleDataFull(bars, tf)), FROZEN_TODAY[name].sha256);
    }

    // Both paths must agree under the switch too.
    const incOff = incrementalSeries(
        H.makeHarness({ mode: MODE, corruptCalendar: CORRUPT, symbol: FX, kill: true }), PO_BARS, '1d');
    expectEqual('H', 'switch-off-incremental-equals-full',
        H.seriesSha256(incOff.series), FROZEN_TODAY.po1d.sha256,
        `incrementalCalls=${incOff.incrementalCalls}`);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell I (§A4b) — multichart is a mandatory cell.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellI: multichart — host and panel realms agree, mixed-symbol panels stay isolated', () => {
    // Panels are iframes: separate realms, separate module instances. Each
    // realm is a full independent harness, so this is the mixed-2 cell.
    const host = makeHarness({ symbol: 'EURUSD' });
    const panelSameSymbol = makeHarness({ symbol: 'EURUSD' });
    const panelCrypto = makeHarness({ symbol: 'BTCUSD' });

    expectEqual('I', 'host-and-panel-are-distinct-realms',
        host.SC === panelSameSymbol.SC, false);

    // Host takes the full path; panel takes the incremental path. Same answer.
    for (const tf of ['1d', '1w']) {
        const hostSeries = host.chart._resampleDataFull(PO_BARS, tf);
        const panel = incrementalSeries(makeHarness({ symbol: 'EURUSD' }), PO_BARS, tf);
        expectEqual('I', `${tf}-host-full-equals-panel-incremental`,
            H.seriesSha256(panel.series), H.seriesSha256(hostSeries),
            `incrementalCalls=${panel.incrementalCalls}`);
    }

    // A DST-spanning window agrees across realms too.
    expectEqual('I', 'dst-window-host-equals-panel',
        H.seriesSha256(panelSameSymbol.chart._resampleDataFull(SPRING_BARS, '1d')),
        H.seriesSha256(host.chart._resampleDataFull(SPRING_BARS, '1d')));

    // Mixed-symbol layout: the crypto panel must keep 00:00 UTC days while the
    // FX host moves to 17:00 ET. Per-instrument-class state must not leak.
    const cryptoDaily = panelCrypto.chart._resampleDataFull(CONT_BARS, '1d');
    const fxDaily = host.chart._resampleDataFull(CONT_BARS, '1d');
    expectEqual('I', 'crypto-panel-keeps-utc-days',
        H.seriesSha256(cryptoDaily), FROZEN_TODAY.crypto1d.sha256);
    expectEqual('I', 'fx-host-differs-from-crypto-panel',
        H.seriesSha256(fxDaily) === H.seriesSha256(cryptoDaily), false);

    // Re-running the FX host after the crypto panel must not be contaminated.
    expectEqual('I', 'fx-host-stable-after-mixed-symbol-traffic',
        H.seriesSha256(host.chart._resampleDataFull(CONT_BARS, '1d')), H.seriesSha256(fxDaily));
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell J (§A4c) — degraded-mode behaviour when the module is absent.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellJ: correctness-class absence degrades to legacy and announces itself', () => {
    // Simulates the §A4c "capability loss without failure" case: the shell is
    // served without session-calendar.js at all. Buckets must fall back to
    // legacy AND the loss must be announced, never silently absorbed.
    const harness = makeHarness({ omitCalendar: true });
    expectEqual('J', 'module-absent-from-realm', harness.SC === null, true);

    const daily = harness.chart._resampleDataFull(PO_BARS, '1d');
    expectEqual('J', 'absent-module-falls-back-to-legacy-output',
        H.seriesSha256(daily), FROZEN_TODAY.po1d.sha256);
    expectEqual('J', 'absent-module-is-reported-not-silent',
        [...new Set(harness.missingModules)], ['SessionCalendar']);

    // Both paths must degrade the same way — a half-degraded chart is worse.
    const incremental = incrementalSeries(makeHarness({ omitCalendar: true }), PO_BARS, '1d');
    expectEqual('J', 'absent-module-degrades-both-paths-identically',
        H.seriesSha256(incremental.series), FROZEN_TODAY.po1d.sha256,
        `incrementalCalls=${incremental.incrementalCalls}`);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell K — cost bound: no per-bar zone lookup on the hot resample path (§A9).
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellK: session bucketing does not add per-bar Intl work', () => {
    const harness = makeHarness();
    harness.SC.resetCaches();
    const bars = H.continuousBars(Date.UTC(2013, 0, 1), Date.UTC(2013, 1, 1), 60000);
    harness.chart._resampleDataFull(bars, '1d');
    const stats = harness.SC.stats();

    // Bound derived from the algorithm, not fitted to the observation. Each
    // boundary recompute resolves two session opens (`open` and `next`), and each
    // open costs at most 4 zone reads: 1 to read the local date, 2 for the
    // two-pass wall->UTC inversion, 1 to verify it. So <= 8 per session day, plus
    // slack for the two partial sessions at the window edges.
    const sessionDays = 31;
    const bound = 8 * (sessionDays + 2);
    note('K', 'stats', true, `${JSON.stringify(stats)} bars=${bars.length}`);
    expectEqual('K', 'zone-formatter-calls-bounded-by-session-count',
        stats.formatterCalls <= bound, true,
        `formatterCalls=${stats.formatterCalls} bound=${bound} bars=${bars.length}`);
    expectEqual('K', 'zone-work-is-per-session-not-per-bar',
        stats.formatterCalls * 100 < bars.length, true,
        `formatterCalls=${stats.formatterCalls} bars=${bars.length}`);
    expectEqual('K', 'boundary-cache-absorbs-the-rest',
        stats.boundaryCacheHits > bars.length - 2 * sessionDays, true,
        `hits=${stats.boundaryCacheHits} recomputes=${stats.boundaryRecomputes}`);

    // Instrument resolution is per SYMBOL, not per bar. Registry lookup splits
    // and sorts the label on every call, so an unmemoised resolver would put
    // that on the hot path once per candle.
    note('K', 'registry-calls', true, JSON.stringify(harness.registryCalls));
    expectEqual('K', 'registry-lookups-are-not-per-bar',
        harness.registryCalls.isRegistered <= 2, true,
        `isRegistered=${harness.registryCalls.isRegistered} bars=${bars.length}`);
    expectEqual('K', 'registry-specs-lookups-are-not-per-bar',
        harness.registryCalls.getSpecs <= 2, true,
        `getSpecs=${harness.registryCalls.getSpecs} bars=${bars.length}`);

    // The GAP branch must stay unreached for the implemented classes. A non-zero
    // count means an added class anchors inside a spring-forward gap and the
    // constant-anchor invariant that cells D1-D3 assert needs re-proving for it.
    // This counter detects its condition exactly: it fires on a failed
    // round-trip, which is precisely what a non-existent wall time is.
    expectEqual('K', 'dst-gap-branch-unreached-for-implemented-classes',
        stats.wallClockGapAdjustments, 0);
    // The ambiguity side is NOT asserted — see cell K2. The counter fires when
    // the two offset probes disagree, which is a near-transition tripwire and
    // not the ambiguity condition, so asserting zero on it would be vacuous.
    note('K', 'dst-near-transition-tripwire', true,
        `wallClockTransitionCrossings=${stats.wallClockTransitionCrossings} `
        + '(near-transition tripwire, NOT an ambiguity gate)');
});

cellTest('cellK2: DST gap is guarded and counted; ambiguity is UNGUARDED and said so', () => {
    // Both branches are dead for FX (17:00 America/New_York) and crypto (00:00
    // UTC), because US transitions happen at 02:00 local and UTC has none. They
    // are therefore UNTESTED by any fixture, and no instrument class was
    // synthesised to manufacture coverage.
    //
    // THE TWO COUNTERS ARE NOT EQUALLY GOOD, AND r2 CLAIMED THEY WERE.
    //
    //   GAP: `wallClockGapAdjustments` detects its condition EXACTLY. It fires
    //   on a failed round-trip, which is precisely what a non-existent wall time
    //   is. Asserting zero on it is meaningful, and it is asserted below.
    //
    //   AMBIGUITY: `wallClockTransitionCrossings` DOES NOT DETECT AMBIGUITY. It
    //   fires when the two offset probes disagree, which is a near-transition
    //   signal. A genuinely ambiguous wall time can converge on the first pass
    //   and return the correct earlier occurrence with the counter reading zero
    //   — the independent reviewer demonstrated exactly that. r2 asserted zero
    //   on it and called the branch "unreached"; that assertion was PARTLY
    //   VACUOUS and has been removed rather than dressed up.
    //
    // Detecting ambiguity properly needs a third probe on the far side of the
    // transition, i.e. an extra Intl call on every boundary, which cell K's cost
    // bound does not allow for a branch no implemented class can reach. So:
    // **the ambiguity branch is unguarded, by decision, and this cell says so.**
    const { SC } = makeHarness();
    for (const counter of ['wallClockGapAdjustments', 'wallClockTransitionCrossings']) {
        expectEqual('K2', `diagnostic-exists:${counter}`,
            typeof SC.stats()[counter], 'number');
    }

    const probe = makeHarness();
    probe.SC.resetCaches();
    for (const [tf, bars] of [['1d', SPRING_BARS], ['1d', FALL_BARS], ['1w', SPRING_BARS],
        ['1w', FALL_BARS], ['1d', PO_BARS], ['1w', PO_BARS]]) {
        probe.chart._resampleDataFull(bars, tf);
    }
    const s = probe.SC.stats();
    note('K2', 'stats-across-all-dst-fixtures', true, JSON.stringify(s));

    // Asserted: the gap branch is genuinely never taken across both transitions.
    expectEqual('K2', 'gap-branch-never-taken-across-both-transitions', s.wallClockGapAdjustments, 0);

    // NOT asserted as an ambiguity gate — reported only.
    note('K2', 'ambiguity-branch-is-UNGUARDED', true,
        `wallClockTransitionCrossings=${s.wallClockTransitionCrossings} — near-transition tripwire only; `
        + 'a genuinely ambiguous wall time can read zero here. The branch has no detector.');

    // The source must carry the honest statement, so packet and code agree and
    // a future reader cannot mistake the tripwire for a gate.
    const source = H.readRepo(H.REL.calendar);
    expectEqual('K2', 'gap-policy-documented',
        source.includes('first instant AFTER the gap'), true);
    expectEqual('K2', 'ambiguity-policy-documented',
        source.includes('EARLIER occurrence'), true);
    expectEqual('K2', 'source-states-ambiguity-branch-is-unguarded',
        source.includes('THE AMBIGUITY BRANCH IS UNGUARDED'), true);
    expectEqual('K2', 'source-warns-tripwire-is-not-a-detector',
        source.includes('DOES NOT DETECT IT'), true);

    // And no cell may re-acquire the vacuous assertion. Checked by finding the
    // call that lexically ENCLOSES each mention of the counter, which is robust
    // to intervening parentheses — r3's first attempt used a regex that could
    // not cross a `)` and was evaded by one token
    // (`expectEqual(a, b, probe.SC.stats().wallClockTransitionCrossings, 0)`).
    const self = H.readRepo('chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs');
    // The whole enclosing chain is checked, not just the innermost call, so
    // wrapping the read (`expectEqual(a, b, Number(x.COUNTER), 0)`) does not
    // hide it either.
    const mentions = H.enclosingCallsMentioning(self, 'wallClockTransitionCrossings');
    const asserted = mentions.filter((m) => m.chain.includes('expectEqual')).length;
    expectEqual('K2', 'no-cell-asserts-on-the-ambiguity-counter', asserted, 0);
    expectEqual('K2', 'ambiguity-counter-is-only-ever-reported',
        [...new Set(mentions.map((m) => m.call))].sort(), ['note']);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell L (§A5.6) — structural ban on nondeterministic assertion inputs.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellL: no nondeterministic inputs in this oracle or its harness', () => {
    // Needles are assembled at runtime so this cell does not match itself.
    // `new Date(x)` with an explicit argument is deterministic and allowed;
    // the zero-argument form, Date.now, RNG, UUIDs and clocks are not.
    const banned = [
        ['Date', '.now('],
        ['new ', 'Date()'],
        ['Math', '.random'],
        ['random', 'UUID'],
        ['performance', '.now'],
        ['process', '.hrtime'],
        ['requestAnimation', 'Frame'],
    ].map((parts) => parts.join(''));

    for (const rel of [
        'chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs',
        'chart v 1.4/chart/modules/m22-session-calendar-harness.mjs',
        'chart v 1.4/chart/modules/session-calendar.js',
        // The §A5 driver was outside this lint until r4. It was clean, so this
        // closed a coverage gap rather than a defect — but an unlinted file in
        // the evidence chain is exactly where a clock read would survive.
        'chart v 1.4/chart/modules/m22-session-calendar-fourstate.mjs',
    ]) {
        const source = H.readRepo(rel);
        const hits = banned.filter((needle) => source.includes(needle));
        expectEqual('L', `no-nondeterministic-inputs:${rel.split('/').pop()}`,
            hits.join('|') || 'none', 'none');
    }

    // No float-equality tolerance anywhere: the oracle declares epsilon 0.
    const self = H.readRepo('chart v 1.4/chart/modules/m22-session-calendar-bucketing.red.test.mjs');
    expectEqual('L', 'no-epsilon-tolerance-in-assertions',
        /epsilon\s*[:=]\s*[0-9.eE-]+[1-9]/.test(self), false);
    expectEqual('L', 'no-closeTo-style-comparison', /Math\.abs\([^)]*\)\s*<\s*[0-9]/.test(self), false);
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell M — module contract sidecar and dual-tree mirror.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellM: contract sidecar is consistent with the helper and not yet in the build manifest', () => {
    const contract = JSON.parse(H.readRepo(H.REL.contract));
    const { SC } = makeHarness();

    expectEqual('M', 'contract-schema', contract.schema, 'talaria.module-contracts.v1');
    expectEqual('M', 'contract-module-id', contract.module.id, 'SessionCalendar');
    expectEqual('M', 'contract-class-is-correctness', contract.module.class, 'correctness');
    expectEqual('M', 'contract-required-surfaces', contract.module.requiredSurfaces, ['host', 'panel']);
    expectEqual('M', 'contract-version-matches-helper', contract.module.version, SC.VERSION);
    expectEqual('M', 'contract-kill-switch-matches-helper', contract.killSwitch.name, SC.KILL_SWITCH);
    expectEqual('M', 'contract-label-convention-matches-helper',
        contract.labelConvention.id, SC.LABEL_CONVENTION);

    // Everything the contract claims the module provides must actually exist.
    const missing = contract.module.provides.filter((fn) => typeof SC[fn] !== 'function');
    expectEqual('M', 'contract-provides-all-resolve', missing.join('|') || 'none', 'none');

    // Territory boundary: merging this into scripts/module-contracts.json before
    // the shells carry the script tag would fail the build preflight by design.
    const manifest = JSON.parse(H.readRepo('scripts/module-contracts.json'));
    expectEqual('M', 'not-yet-in-build-manifest-pre-wiring',
        manifest.modules.some((m) => m.id === 'SessionCalendar'), false);

    // Dual-tree: source and homepage mirror must be byte-identical.
    expectEqual('M', 'dual-tree-mirror-byte-identical',
        H.sha256(H.readRepo(H.REL.calendarMirror)), H.sha256(H.readRepo(H.REL.calendar)));

    // Both bucketing call sites must be recorded, and their wiring state must
    // match reality — so this cell cannot go stale after Manager A wires it.
    const wired = H.productIsWired();
    expectEqual('M', 'contract-records-both-call-sites',
        [...new Set(contract.sharedCallSites.map((s) => s.function))].sort(),
        ['_resampleDataFull', '_tryIncrementalResample']);
    // All FOUR files, not just the authoring tree — see cell M3.
    expectEqual('M', 'contract-records-all-four-wiring-files',
        contract.sharedCallSites.map((s) => s.file).sort(),
        H.WIRING_FILE_PAIRS.flatMap((p) => [p.source, p.mirror]).sort());
    expectEqual('M', 'contract-wiring-state-matches-product',
        contract.sharedCallSites.every((s) => s.wired === wired), true,
        `productIsWired=${wired}`);

    // The registry dependency must be declared, since the fix silently does
    // nothing without it.
    expectEqual('M', 'contract-declares-registry-dependency',
        (contract.module.dependsOn || []).map((d) => d.module), ['MarketCalculationEngine']);
    expectEqual('M', 'contract-records-product-symbol-property',
        contract.instrumentIdentity.productProperty, 'chart.currentSymbol');
    expectEqual('M', 'contract-symbol-property-assignment-count-matches-source',
        contract.instrumentIdentity.productPropertyAssignments,
        H.chartAssignmentCount('currentSymbol'));
    for (const prop of contract.instrumentIdentity.rejectedProperties) {
        expectEqual('M', `contract-rejected-property-really-absent:${prop}`,
            H.chartAssignmentCount(prop), 0);
    }
});

cellTest('cellM3: the wiring is a FOUR-file change and every target accepts it', () => {
    // `chart v 1.4/chart/**` is the authoring tree; `homepage/public/chart/**`
    // is what is actually SERVED. Both copies of both bucketing files must take
    // the patch, or the fix ships to one tree and the PO keeps seeing the
    // phantom Saturday on whichever shell loads the other. Nothing in the
    // earlier oracle would have caught a divergent mirror of these two files.
    const targets = [];
    for (const pair of H.WIRING_FILE_PAIRS) {
        targets.push({ id: `${pair.id} (source)`, rel: pair.source });
        targets.push({ id: `${pair.id} (mirror)`, rel: pair.mirror });
    }
    expectEqual('M3', 'wiring-target-count', targets.length, 4);

    for (const target of targets) {
        expectEqual('M3', `target-exists:${target.rel}`,
            (() => { try { return H.readRepo(target.rel).length > 0; } catch { return false; } })(), true);
    }

    // Every target accepts every patch pair at exactly one site. `patchFileText`
    // throws on 0 or 2+ matches, so this is a machine-checked wiring instruction
    // for all four files rather than a comment claiming they are the same.
    for (const target of targets) {
        let outcome = 'threw';
        let changed = false;
        try {
            const before = H.readRepo(target.rel);
            const after = H.patchFileText(target.rel, before);
            changed = after !== before;
            outcome = 'applied';
        } catch (error) {
            outcome = `threw: ${error.message}`;
        }
        expectEqual('M3', `patch-applies-cleanly:${target.rel}`, outcome, 'applied');
        expectEqual('M3', `patch-actually-changes-file:${target.rel}`, changed, true);
    }

    // Source and mirror must be byte-identical BEFORE the wiring, so a
    // four-file change stays a four-file change and cannot silently become a
    // two-file change plus a pre-existing drift.
    for (const pair of H.WIRING_FILE_PAIRS) {
        expectEqual('M3', `source-and-mirror-identical-pre-wiring:${pair.id}`,
            H.sha256(H.readRepo(pair.mirror)), H.sha256(H.readRepo(pair.source)));
    }

    // …and identical AFTER it, which is the property that actually matters.
    for (const pair of H.WIRING_FILE_PAIRS) {
        const patchedSource = H.patchFileText(pair.source, H.readRepo(pair.source));
        const patchedMirror = H.patchFileText(pair.mirror, H.readRepo(pair.mirror));
        expectEqual('M3', `source-and-mirror-identical-post-wiring:${pair.id}`,
            H.sha256(patchedMirror), H.sha256(patchedSource));
    }

    // The helper itself is a fifth and sixth file (module + mirror) and is not
    // patched but copied; cell M pins that pair. Recorded here so the full
    // deployment set is visible in one place.
    note('M3', 'full-deployment-file-set', true, [
        ...H.WIRING_FILE_PAIRS.flatMap((p) => [p.source, p.mirror]),
        H.REL.calendar, H.REL.calendarMirror,
    ].join(' | '));
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell M4 — every shell that loads chart.js, and its DECLARED load order.
 *
 * r2 asserted that market-calculations.js is present on "all four shells". That
 * was true as scoped and false as a claim about the servable surface: SIX shells
 * declare chart.js as a script tag and two more load it from a JS path array.
 * Two of the six are broken for this wiring, and presence alone would not have
 * shown it — the assertion has to be on ORDER, not existence.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellM4: all six chart.js shells, asserted on declared load order not presence', () => {
    const shells = H.allChartShells();
    expectEqual('M4', 'shell-count-loading-chart-js', shells.length, 8,
        '6 script-tag shells + 2 JS-loader shells');

    const orders = shells.map((rel) => H.shellScriptOrder(rel));

    // Every shell must actually declare chart.js, or the inventory is wrong.
    for (const o of orders) {
        expectEqual('M4', `declares-chart-js:${o.rel}`, !!o.chart, true);
    }

    // ── the two findings, pinned as values so they cannot be quietly fixed
    //    or quietly worsened without this cell noticing ──
    const registryAbsent = orders.filter((o) => !o.registryDeclared).map((o) => o.rel);
    const inverted = orders.filter((o) => o.registryDeclared && o.registryBeforeChart === false)
        .map((o) => o.rel);
    const ok = orders.filter((o) => o.registryBeforeChart === true).map((o) => o.rel);

    expectEqual('M4', 'shells-with-registry-declared-before-chart', ok.sort(), [
        'chart v 1.4/chart/dist-v9/index.html',
        'chart v 1.4/chart/multichart-prod/chart-embed.html',
        'homepage/public/chart/dist-v9/index.html',
        'homepage/public/chart/multichart-prod/chart-embed.html',
    ]);

    // legacy-index.html declares the registry AFTER chart.js. Both are `defer`,
    // so document order is preserved and it happens to work — but it works by
    // timing, not by declaration, and it is exactly the configuration that
    // triggers the cell N2 poisoning if anything ever resamples during load.
    expectEqual('M4', 'shells-with-INVERTED-order', inverted.sort(), [
        'chart v 1.4/chart/legacy-index.html',
        'homepage/public/chart/legacy-index.html',
    ]);

    // chart-host.html is the multichart PANEL iframe. It loads ../chart.js with
    // no modules at all ("engine (no modules — minimum surface)"), so the
    // registry is permanently absent and every panel keeps the phantom Saturday.
    expectEqual('M4', 'shells-with-registry-ABSENT', registryAbsent.sort(), [
        'chart v 1.4/chart/multichart/chart-host.html',
        'homepage/public/chart/multichart/chart-host.html',
    ]);

    for (const o of orders) {
        note('M4', `order:${o.rel}`, true,
            `mechanism=${o.mechanism} scripts=${o.scriptCount} `
            + `chart.js@${o.chart ? `${o.chart.line}[${o.chart.attrs}]` : '--'} `
            + `market-calculations@${o.registry ? `${o.registry.line}[${o.registry.attrs}]` : 'ABSENT'} `
            + `=> ${o.registryDeclared ? (o.registryBeforeChart ? 'ordered' : 'INVERTED') : 'ABSENT'}`);
    }

    // Source and mirror shells must agree ON LOAD ORDER, so a fix to one tree
    // cannot be mistaken for a fix to the served surface. Asserted on the script
    // sequence rather than on bytes, because byte-identity is a stronger claim
    // than this packet needs and one of these pairs does not satisfy it — see
    // the drift note below, which is someone else's row, not mine to close.
    for (const rel of shells.filter((r) => r.startsWith('chart v 1.4/'))) {
        const mirror = rel.replace('chart v 1.4/chart/', 'homepage/public/chart/');
        const seq = (r) => H.shellScriptOrder(r);
        const a = seq(rel);
        const b = seq(mirror);
        expectEqual('M4', `shell-mirror-same-load-order:${rel.split('/').pop()}`,
            `${a.scriptCount}|${a.chart && a.chart.src}|${a.registry && a.registry.src}|${a.registryBeforeChart}`,
            `${b.scriptCount}|${b.chart && b.chart.src}|${b.registry && b.registry.src}|${b.registryBeforeChart}`);
        if (H.sha256(H.readRepo(mirror)) !== H.sha256(H.readRepo(rel))) {
            note('M4', `UNMIRRORED-DRIFT:${rel.split('/').pop()}`, true,
                'source and served trees differ in body (not in script order) — reported, not touched');
        }
    }

    // The wiring is inert but ANNOUNCED wherever the registry is missing, which
    // is what makes the two broken shells a reportable state rather than a
    // silent one. Proven behaviourally, not by reading the HTML.
    const noEngine = makeHarness({ symbol: FX, omitMarketCalc: true });
    noEngine.chart._resampleDataFull(PO_BARS, '1d');
    expectEqual('M4', 'registry-absent-shell-announces-degradation',
        [...new Set(noEngine.missingModules)].join(','), 'SessionCalendar.unresolved-instrument');
});

cellTest('cellM2: both resample paths route through ONE boundary implementation', () => {
    // The single-implementation requirement, asserted behaviourally: with the
    // shared entry point stubbed out in the realm, BOTH paths must change.
    // A path that keeps producing session buckets is computing its own boundary.
    const harness = makeHarness();
    const before = {
        full: H.seriesSha256(harness.chart._resampleDataFull(PO_BARS, '1d')),
        incremental: H.seriesSha256(incrementalSeries(makeHarness(), PO_BARS, '1d').series),
    };

    const stubbed = makeHarness();
    const stubbedInc = makeHarness();
    for (const h of [stubbed, stubbedInc]) {
        h.sandbox.SessionCalendar = Object.assign({}, h.SC, {
            bucketStart: (t, tf, opts) => h.SC.epochAlignedBucketStart(t, Number(opts.timeframeMs)),
        });
    }
    const after = {
        full: H.seriesSha256(stubbed.chart._resampleDataFull(PO_BARS, '1d')),
        incremental: H.seriesSha256(incrementalSeries(stubbedInc, PO_BARS, '1d').series),
    };

    expectEqual('M2', 'full-path-consumes-the-shared-helper', after.full === before.full, false,
        `before=${before.full.slice(0, 16)} after=${after.full.slice(0, 16)}`);
    expectEqual('M2', 'incremental-path-consumes-the-shared-helper',
        after.incremental === before.incremental, false,
        `before=${before.incremental.slice(0, 16)} after=${after.incremental.slice(0, 16)}`);
    expectEqual('M2', 'stubbing-one-helper-moves-both-paths-together',
        after.full, after.incremental);

    // ── census of epoch-flooring bucket sites — A REAL SCAN ──────────────
    //
    // r3's first attempt asserted `sites.length === 3` against a hardcoded
    // three-element literal declared eleven lines above it. That is `3 === 3`
    // by construction: it could not fail when a fourth site appeared, which is
    // the only thing a census is for. It also certified three when there are
    // twenty-one, six of them in the defect class proper.
    //
    // Now: scan the servable chart surface, strip comments so documentation is
    // not miscounted as code, and require the found multiset to EQUAL the
    // declared inventory. A new site anywhere in scope fails this cell until
    // somebody classifies it.
    const scanned = H.scanEpochFlooringSites();
    expectEqual('M2', 'scan-matches-declared-inventory-exactly',
        H.floorSiteKeys(scanned), H.floorSiteKeys(H.EPOCH_FLOORING_INVENTORY));

    // The scan must actually be finding things — a broken regex would make the
    // assertion above pass against an empty inventory in a later edit.
    expectEqual('M2', 'scan-is-not-vacuous', scanned.length >= 20, true,
        `scanned=${scanned.length}`);
    expectEqual('M2', 'scan-covers-both-known-resample-paths',
        [H.REL.chart, H.REL.pipeline].every((f) => scanned.some((s) => s.file === f)), true);

    const inCategory = H.EPOCH_FLOORING_INVENTORY.filter((s) => s.category === 'bar-bucketing');
    const gridCoupled = H.EPOCH_FLOORING_INVENTORY.filter((s) => s.category === 'grid-coupled');
    const wired = inCategory.filter((s) => s.wiredByThisPacket);

    // Counts derived from the classified scan, not from a literal. §8.4 leans on
    // these numbers, so they must move when the code moves.
    expectEqual('M2', 'bar-bucketing-sites-found', inCategory.length, 6);
    expectEqual('M2', 'bar-bucketing-sites-this-packet-wires', wired.length, 3,
        wired.map((s) => s.patch).join(','));
    expectEqual('M2', 'bar-bucketing-sites-left-UNWIRED',
        inCategory.filter((s) => !s.wiredByThisPacket).map((s) => s.fn).sort(),
        ['_replayBucketStart', 'periodStart', 'resampleCandles']);
    expectEqual('M2', 'grid-coupled-boundary-computations', gridCoupled.length, 5);

    // ── the LIVE replay site, which is an integration risk and not a nicety ──
    //
    // `_replayBucketStart` has three callers and its own comment claims it
    // "matches chart resampleData". Landing this packet's wiring FALSIFIES that
    // comment: replay stepping would compute epoch buckets over session-bucketed
    // bars. Pinned by value — the comment, the callers, and the reachability
    // condition — so the wiring change cannot land without confronting it.
    const replay = H.readRepo('chart v 1.4/chart/modules/replay-system.js');
    expectEqual('M2', 'replay-site-claims-to-match-resampleData',
        replay.includes('Bucket start for replay step/resample (matches chart resampleData)'), true);
    expectEqual('M2', 'replay-site-caller-count',
        (replay.match(/this\._replayBucketStart\(/g) || []).length, 3);
    expectEqual('M2', 'replay-site-is-reached-for-coarse-timeframes',
        replay.includes('tfMs > this._getRawBarPeriodMs()'), true);
    note('M2', 'WIRING-RISK-replay-invariant-breaks', true,
        'replay-system.js _replayBucketStart claims to match resampleData; wiring falsifies that. '
        + 'Must be wired in the same change or replay stepping diverges from the bars it steps over.');

    // ── the latent worker resampler ──────────────────────────────────────
    // A complete SECOND resampler with its own '1d'/'1w' table, reachable via a
    // 'resample' message no caller posts today. Same status as the FVG site,
    // larger surface. Pinned so "latent" is a checked claim, not an assumption.
    const worker = H.readRepo('chart v 1.4/chart/workers/candle-decode.worker.js');
    expectEqual('M2', 'worker-resampler-has-its-own-day-week-table',
        worker.includes("'1d': 86400000, '1w': 604800000"), true);
    expectEqual('M2', 'worker-resampler-is-reachable-by-message',
        worker.includes("case 'resample':"), true);
    expectEqual('M2', 'worker-resample-message-has-no-caller-today',
        H.postsWorkerResampleMessage(), false);

    // The FVG site is only a day/week defect because its parser accepts those
    // units. Pinned, because if that stops being true the row changes shape.
    const fvg = H.readRepo('chart v 1.4/chart/modules/talaria-fvg-indicator.js');
    expectEqual('M2', 'fvg-timeframe-parser-accepts-day-and-week',
        fvg.includes("if (m[2] === 'd') return n * 86400000;")
        && fvg.includes("if (m[2] === 'w') return n * 604800000;"), true);

    for (const s of inCategory.filter((x) => !x.wiredByThisPacket)) {
        note('M2', `unwired-bar-bucketing-site:${s.fn}`, true,
            `${s.file} — ${s.status || 'unknown'}, SEPARATE ROW`);
    }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell P (§A7) — differential against the EXISTING authority.
 *
 * The anchoring audit found seven mutually inconsistent day/week definitions
 * already in this codebase. The server is not one of the seven guesses: it is
 * the one place that already decided this question correctly, in
 * `api_server.py:8465-8499` `_is_weekend_timestamp_ms`, whose docstring
 * explicitly rejects the naive UTC weekday check for the same reason this
 * packet exists. So this module must MATCH it rather than re-derive it —
 * otherwise the codebase acquires an eighth calendar, authored by me.
 *
 * This is a genuine differential oracle: the Python predicate is transcribed
 * faithfully below (weekday and hour only, no reuse of my own boundary code),
 * its open/close transitions are found by scanning EVERY MINUTE of a
 * multi-year span, and those instants are compared against the boundaries my
 * helper produces. It is the strongest external check available to this packet
 * because it cannot be satisfied by an internally consistent wrong answer.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellP: FX anchor agrees with the server\'s weekend filter, to the minute', () => {
    const { SC } = makeHarness();

    // Faithful transcription of api_server.py:8483-8493. Weekday and hour in
    // America/New_York, nothing else. Deliberately NOT expressed via
    // SessionCalendar internals — a differential against my own arithmetic
    // would prove nothing.
    const FMT = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', hourCycle: 'h23',
        weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
    const MON0 = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    const etParts = (ms) => {
        const p = Object.fromEntries(FMT.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
        return { wd: MON0[p.weekday], hour: Number(p.hour), minute: Number(p.minute) };
    };
    const serverIsWeekend = (ms) => {
        const { wd, hour } = etParts(ms);
        if (wd === 5) return true;                  // Saturday — fully closed
        if (wd === 6 && hour < 17) return true;     // Sunday before 17:00 NY open
        if (wd === 4 && hour >= 17) return true;    // Friday after 17:00 NY close
        return false;
    };

    // Confirm the transcription still matches the file, so this cell fails if
    // the server's rule is ever edited out from under it.
    const py = H.readRepo('chart v 1.4/chart/api_server.py');
    for (const needle of [
        'def _is_weekend_timestamp_ms(ts)',
        'ZoneInfo("America/New_York")',
        'if wd == 5:',
        'if wd == 6 and local.hour < 17:',
        'if wd == 4 and local.hour >= 17:',
    ]) {
        expectEqual('P', `server-rule-unchanged:${needle.slice(0, 34)}`, py.includes(needle), true);
    }

    const bucket = (t, tf) => SC.bucketStart(t, tf, {
        timeframeMs: tf === '1d' ? 86400000 : 604800000,
        instrumentClass: 'fx',
    });

    // Locate every server open/close over 2013-2015 — three years, six DST
    // transitions in each direction — at MINUTE resolution. Scanned hourly then
    // refined to the minute inside the bracketing hour, which is exact rather
    // than approximate: `serverIsWeekend` is monotone within any single hour
    // because it only ever compares `hour` against 17, so an hour containing a
    // flip contains exactly one, and the refinement finds it.
    const START = Date.UTC(2013, 0, 1);
    const END = Date.UTC(2016, 0, 1);
    const HOUR = 3600000;
    const MIN = 60000;
    const closes = [];
    const reopens = [];
    let prev = serverIsWeekend(START);
    for (let t = START + HOUR; t < END; t += HOUR) {
        const cur = serverIsWeekend(t);
        if (cur !== prev) {
            let edge = t;
            for (let m = t - HOUR + MIN; m <= t; m += MIN) {
                if (serverIsWeekend(m) === cur) { edge = m; break; }
            }
            (cur ? closes : reopens).push(edge);
        }
        prev = cur;
    }
    expectEqual('P', 'server-transitions-are-one-close-and-one-reopen-per-week',
        `${closes.length}/${reopens.length}`, '156/156');

    // 1. Every instant the server CLOSES is exactly a daily session open in this
    //    module (the Friday 17:00 session, which simply carries no bars).
    const closeMisses = closes.filter((t) => bucket(t, '1d') !== t);
    expectEqual('P', 'every-server-close-is-exactly-a-daily-session-open',
        closeMisses.length, 0, closeMisses.slice(0, 3).map((t) => new Date(t).toISOString()).join(' '));

    // 2. Every instant the server REOPENS is exactly a daily open AND exactly a
    //    weekly open. This is the load-bearing one: it pins both the 17:00
    //    anchor and the Sunday week start against an authority I did not write.
    const reopenDailyMisses = reopens.filter((t) => bucket(t, '1d') !== t);
    const reopenWeeklyMisses = reopens.filter((t) => bucket(t, '1w') !== t);
    expectEqual('P', 'every-server-reopen-is-exactly-a-daily-session-open',
        reopenDailyMisses.length, 0,
        reopenDailyMisses.slice(0, 3).map((t) => new Date(t).toISOString()).join(' '));
    expectEqual('P', 'every-server-reopen-is-exactly-a-WEEKLY-session-open',
        reopenWeeklyMisses.length, 0,
        reopenWeeklyMisses.slice(0, 3).map((t) => new Date(t).toISOString()).join(' '));

    // 3. And the converse, so agreement cannot be one-directional: every weekly
    //    open this module produces must be a server reopen instant. Without
    //    this, a helper that opened weeks twice as often would still pass (2).
    const reopenSet = new Set(reopens);
    const weekOpens = new Set();
    for (let t = START; t < END; t += 3600000) weekOpens.add(bucket(t, '1w'));
    const mine = [...weekOpens].filter((t) => t > START && t < END);
    expectEqual('P', 'helper-produces-exactly-as-many-week-opens-as-the-server',
        mine.length, reopens.length);
    const spurious = mine.filter((t) => !reopenSet.has(t));
    expectEqual('P', 'no-week-open-that-the-server-does-not-also-reopen-at',
        spurious.length, 0, spurious.slice(0, 3).map((t) => new Date(t).toISOString()).join(' '));

    // 4. Stated as a local wall-clock fact for the packet: one anchor, always.
    const anchors = [...new Set(mine.map((t) => {
        const p = etParts(t);
        return `wd${p.wd}@${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    }))];
    expectEqual('P', 'single-local-anchor-for-every-week-open-over-three-years',
        anchors, ['wd6@17:00']);
    note('P', 'agreement-with-api_server.py', true,
        `${closes.length} closes + ${reopens.length} reopens over 2013-2015, `
        + 'zero disagreement at minute resolution');
});

/* ─────────────────────────────────────────────────────────────────────────
 * Cell Q — the indicator-facing surface, shaped but not wired.
 *
 * Manager A's design note: the audit expects SessionCalendar to serve
 * indicators, at which point the FVG's 18:00 ET and the Weekly Map's Monday-ET
 * want to be entries in it rather than private constants. Nothing migrates in
 * this packet. What this cell proves is that the surface CAN absorb them —
 * asserted by value, so "shaped for it" is a demonstrated claim and not an
 * intention. Without this the next worker would find the extension point
 * untested and be entitled to distrust it.
 * ───────────────────────────────────────────────────────────────────────── */

cellTest('cellQ: explicit anchors — the extension point absorbs both indicator calendars', () => {
    const { SC } = makeHarness();
    const daily = (t, anchor) => SC.bucketStart(t, '1d', { timeframeMs: 86400000, anchor });
    const weekly = (t, anchor) => SC.bucketStart(t, '1w', { timeframeMs: 604800000, anchor });

    // 1. An explicit anchor equal to the fx class must reproduce fx bucketing
    //    EXACTLY. If it did not, the extension point would be a second
    //    implementation — the precise thing this packet exists to prevent.
    const fxDef = SC.describeClass('fx');
    const asAnchor = {
        zone: fxDef.zone,
        dailyOpenMinute: fxDef.dailyOpenMinute,
        weekOpenWeekday: fxDef.weekOpenWeekday,
        labelOffsetDays: fxDef.labelOffsetDays,
    };
    let dailyMatches = 0;
    let weeklyMatches = 0;
    for (const bar of PO_BARS) {
        if (daily(bar.t, asAnchor) === SC.bucketStart(bar.t, '1d',
            { timeframeMs: 86400000, instrumentClass: 'fx' })) dailyMatches++;
        if (weekly(bar.t, asAnchor) === SC.bucketStart(bar.t, '1w',
            { timeframeMs: 604800000, instrumentClass: 'fx' })) weeklyMatches++;
    }
    expectEqual('Q', 'explicit-anchor-reproduces-class-bucketing-daily', dailyMatches, PO_BARS.length);
    expectEqual('Q', 'explicit-anchor-reproduces-class-bucketing-weekly', weeklyMatches, PO_BARS.length);

    // 2. Both named anchors are declared, with the values read off the
    //    indicators rather than invented, and each is expressible.
    const named = Object.fromEntries(SC.namedAnchors().map((a) => [a.id, a]));
    expectEqual('Q', 'named-anchors-declared', Object.keys(named).sort(), ['fvg-18-et', 'weekly-map-mon']);
    expectEqual('Q', 'fvg-anchor-is-18:00-america-new-york',
        `${named['fvg-18-et'].zone}@${named['fvg-18-et'].dailyOpenMinute}`, 'America/New_York@1080');
    expectEqual('Q', 'weekly-map-anchor-is-monday-00:00-america-new-york',
        `${named['weekly-map-mon'].zone}@${named['weekly-map-mon'].dailyOpenMinute}`
        + `/wd${named['weekly-map-mon'].weekOpenWeekday}`, 'America/New_York@0/wd1');
    for (const id of ['fvg-18-et', 'weekly-map-mon']) {
        expectEqual('Q', `named-anchor-is-declared-not-wired:${id}`, named[id].status, 'declared');
    }

    // 3. And they compute. The FVG anchor must open at 18:00 local, the Weekly
    //    Map anchor on a Monday at 00:00 local — checked in wall-clock terms so
    //    a DST error cannot hide behind a UTC offset that happens to match.
    const fvg = SC.namedAnchor('fvg-18-et');
    const wmap = SC.namedAnchor('weekly-map-mon');
    for (const [label, t] of [['winter', Date.UTC(2013, 0, 15, 12)], ['summer', Date.UTC(2013, 6, 15, 12)]]) {
        const open = SC.openLocalTime(daily(t, fvg), { anchor: fvg });
        expectEqual('Q', `fvg-anchor-opens-at-local-18:00:${label}`,
            `${String(open.hour).padStart(2, '0')}:${String(open.minute).padStart(2, '0')}`, '18:00');
        const wOpen = SC.openLocalTime(weekly(t, wmap), { anchor: wmap });
        expectEqual('Q', `weekly-map-anchor-opens-monday-local-00:00:${label}`,
            `${wOpen.weekday} ${String(wOpen.hour).padStart(2, '0')}:${String(wOpen.minute).padStart(2, '0')}`,
            'Mon 00:00');
    }

    // 4. The FVG's 18:00 genuinely disagrees with the FX session open by one
    //    hour. Pinned as a VALUE so nobody later assumes the two were unified
    //    here: they were not, and unifying them is a different row.
    const fxOpen = SC.bucketStart(Date.UTC(2013, 0, 15, 12), '1d',
        { timeframeMs: 86400000, instrumentClass: 'fx' });
    expectEqual('Q', 'fvg-anchor-differs-from-fx-session-open-by-exactly-one-hour',
        daily(Date.UTC(2013, 0, 15, 12), fvg) - fxOpen, 3600000);

    // 5. Fails closed. A malformed anchor must degrade to epoch-aligned rather
    //    than silently defaulting to some class's calendar.
    const t0 = Date.UTC(2013, 0, 15, 12);
    const epoch = SC.epochAlignedBucketStart(t0, 86400000);
    for (const [name, bad] of [
        ['missing-zone', { dailyOpenMinute: 1020, weekOpenWeekday: 0 }],
        ['minute-out-of-range', { zone: 'America/New_York', dailyOpenMinute: 1440, weekOpenWeekday: 0 }],
        ['weekday-out-of-range', { zone: 'America/New_York', dailyOpenMinute: 1020, weekOpenWeekday: 7 }],
        ['not-an-object', 'America/New_York'],
    ]) {
        expectEqual('Q', `malformed-anchor-fails-closed:${name}`, daily(t0, bad), epoch);
    }
});

/* ─────────────────────────────────────────────────────────────────────────
 * Evidence
 * ───────────────────────────────────────────────────────────────────────── */

test.after(() => {
    const failed = rows.filter((r) => !r.pass);
    let head = 'unknown';
    try {
        head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: H.REPO_ROOT }).toString().trim();
    } catch { /* provenance is best-effort; never fail the gate on it */ }

    const meta = H.makeHarness({ mode: MODE, corruptCalendar: CORRUPT, symbol: FX }).meta;
    const body = {
        packet: 'session-calendar-red',
        manager: 'A',
        row: 'Session-calendar bucketing (canary blocker)',
        tier: 3,
        state: STATE,
        mode: MODE,
        verdict: failed.length ? 'RED' : 'GREEN',
        expectedVerdict: STATE === 'fixed' ? 'GREEN' : 'RED',
        buildSha: head,
        authoredAgainstBuild: '634448817',
        lastProvenRedOnBuild: '634448817',
        epsilon: 0,
        epsilonJustification:
            'Fixture prices are dyadic rationals (1.25 + k/4096); resampling performs only '
            + 'selection (first/last/max/min) and integer volume sums, so no rounding can occur. '
            + 'Exact equality, not a fitted tolerance.',
        labelConvention: H.LABEL_CONVENTION,
        killSwitch: H.KILL_SWITCH,
        productWired: meta.alreadyWired,
        harnessPatched: meta.patched,
        digests: {
            liftedMethods: meta.liftedSha256,
            chartJs: meta.chartSha256,
            chartDataPipelineJs: meta.pipelineSha256,
            sessionCalendarJs: meta.calendarSha256,
        },
        frozenTodayBaseline: FROZEN_TODAY,
        failedAssertions: failed.map((r) => ({ cell: r.cell, name: r.name, detail: r.detail })),
        rows,
    };
    const out = H.writeEvidence(`m22-session-calendar-${STATE}`, body);
    process.stdout.write(
        `\n[m22-session-calendar] state=${STATE} verdict=${body.verdict} `
        + `(expected ${body.expectedVerdict}) failed=${failed.length}/${rows.length}\n`
        + `EVIDENCE -> ${out}\n`,
    );
});
