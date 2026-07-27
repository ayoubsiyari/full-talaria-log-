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

    // The lifted text must be the real thing: the defect formula is present in
    // the unpatched lift, and absent from the patched lift.
    const lifted = H.liftChartMethods();
    const defectFormula = 'Math.floor(candle.t / timeframeMs) * timeframeMs';
    assert.equal(lifted._resampleDataFull.includes(defectFormula), true,
        'harness lifted a _resampleDataFull that does not contain the defect formula — extraction is wrong');
    assert.equal(lifted.parseTimeframe.includes("'d': 24 * 60 * 60 * 1000"), true);
    note('0', 'defect-formula-present-in-lifted-product-text', true, defectFormula);

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

    // Per-instrument-class extensibility: two implemented, CME declared.
    const classes = SC.instrumentClasses();
    expectEqual('A', 'class-ids', classes.map((c) => c.id).join(','), 'fx,crypto,cme-index-futures,unknown');
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

cellTest('cellF2: crypto daily stays 00:00 UTC (already correct today)', () => {
    const harness = makeHarness({ symbol: 'BTCUSD' });
    const daily = harness.chart._resampleDataFull(CONT_BARS, '1d');
    expectEqual('F2', 'crypto1d-length', daily.length, FROZEN_TODAY.crypto1d.length);
    expectEqual('F2', 'crypto1d-sha256', H.seriesSha256(daily), FROZEN_TODAY.crypto1d.sha256);
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

cellTest('cellG2: unsorted / out-of-order appended bar must not split the two paths', () => {
    // NOTE FOR MANAGER A: this divergence exists TODAY as well as under the
    // simulated wiring — `_tryIncrementalResample` assumes the appended bar is
    // the newest and never bails when it is not. It is a SEPARATE pre-existing
    // mechanism from the session calendar. It is asserted here because
    // requirement (f) names the case and because a values gate that tolerates
    // path divergence is the lying-gate shape §A5 bans. Fix shape: bail to the
    // full resample when `lastRaw.t` is older than the previous last raw bar.
    for (const tf of ['1d', '1w']) {
        const harness = makeHarness();
        const head = PO_BARS.slice(0, 200);
        const { live } = incrementalSeries(harness, head, tf);

        // Append a bar 30h behind the newest — an out-of-order arrival.
        const newest = head[head.length - 1];
        live.push(H.synthBar(9999, newest.t - 30 * 3600000));
        const incremental = harness.pipeline.getResampledSeries(live, tf, 0);
        const full = makeHarness().chart._resampleDataFull(live, tf);

        const incText = H.serializeSeries(incremental);
        const fullText = H.serializeSeries(full);
        let firstDiff = 'none';
        if (incText !== fullText) {
            const a = incText.split('\n');
            const b = fullText.split('\n');
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                if (a[i] !== b[i]) { firstDiff = `row${i} inc=${a[i]} full=${b[i]}`; break; }
            }
        }
        expectEqual('G2', `${tf}-unsorted-append-incremental-equals-full`, firstDiff, 'none',
            `incLen=${incremental.length} fullLen=${full.length}`);
    }
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
        contract.sharedCallSites.map((s) => s.function).sort(),
        ['_resampleDataFull', '_tryIncrementalResample']);
    expectEqual('M', 'contract-wiring-state-matches-product',
        contract.sharedCallSites.every((s) => s.wired === wired), true,
        `productIsWired=${wired}`);
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
