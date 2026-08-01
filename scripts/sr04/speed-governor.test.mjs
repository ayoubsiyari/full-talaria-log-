/**
 * SPEED-01 / ORDER-01 — the speed governor.
 *
 * The defect this row closes is not "the labels are wrong". The PO hand-measured 60x at
 * 62.4 bars/s and 10x at 10.4, so the labels are honest at the start of a session. The
 * defect is that nothing ever looked again: the cadence derived a timer interval from the
 * label and assumed the result, so when the handler began running long (PO: 55-95 ms) the
 * delivered rate collapsed to 1.74 bars/s and the chart still called it 60x.
 *
 * Five oracles, one per clause of the contract:
 *   O1 rate           - a speed is bars per second, and the meter reports what was delivered
 *   O2 tick-duration  - tick bar duration is (timeframe_seconds / 4) / N, REALISTIC is 1:1
 *   O3 drift          - correction fires on >5% sustained >5 s, and not before
 *   O4 no-stacking    - one owned clock, replaced and never duplicated
 *   O5 cross-mode     - one ladder across both modes, each honouring its own contract
 *
 * Each oracle carries a mutant cell that neuters the shipped logic in memory and asserts
 * the oracle goes red, so a green run cannot be green for the wrong reason (PROC-3).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const RS_A = 'chart v 1.4/chart/modules/replay-system.js';
const RS_B = 'homepage/public/chart/modules/replay-system.js';

const src = readFileSync(RS_A, 'utf8');

/** Anchor on definitions, never bare names. */
function balanced(text, anchor) {
    const at = text.indexOf(anchor);
    assert.notEqual(at, -1, `anchor not found: ${anchor}`);
    const open = text.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
        if (text[i] === '{') depth += 1;
        else if (text[i] === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(at, i + 1);
        }
    }
    throw new Error(`unbalanced: ${anchor}`);
}

function soleIndexOf(text, needle) {
    const first = text.indexOf(needle);
    assert.notEqual(first, -1, `not found: ${needle}`);
    assert.equal(text.indexOf(needle, first + 1), -1, `ambiguous anchor: ${needle}`);
    return first;
}

/** Constants are read from the shipped source, so a retune cannot silently pass. */
const constant = (name) => {
    const m = src.match(new RegExp(`const ${name} = ([0-9.]+);`));
    assert.ok(m, `constant not found: ${name}`);
    return Number(m[1]);
};

const TOLERANCE = constant('SPEED_GOV_DRIFT_TOLERANCE');
const GRACE_MS = constant('SPEED_GOV_DRIFT_GRACE_MS');
const WINDOW_MS = constant('SPEED_GOV_RATE_WINDOW_MS');
const MIN_INTERVAL = constant('SPEED_GOV_MIN_INTERVAL_MS');
const MAX_GAIN = constant('SPEED_GOV_MAX_GAIN');
const MIN_GAIN = constant('SPEED_GOV_MIN_GAIN');
const MAX_CATCHUP = constant('SPEED_GOV_MAX_CATCHUP_BARS');
const TF_DIVISOR = constant('SPEED_GOV_TICK_TF_DIVISOR');

const METHODS = [
    '\n    _speedGovState() {',
    '\n    getSpeedLadderBarsPerSecond() {',
    '\n    getTickSpeedLadder() {',
    '\n    getTargetBarsPerSecond() {',
    '\n    getTickBarDurationMs(speed = this.speed, tfMsOverride = null) {',
    '\n    _speedGovRecordBars(bars, now = _speedGovNow()) {',
    '\n    _speedGovTrimWindow(now = _speedGovNow()) {',
    '\n    getEffectiveBarsPerSecond(now = _speedGovNow()) {',
    '\n    _speedGovPublishEffectiveRate(now = _speedGovNow()) {',
    '\n    _speedGovEvaluateDrift(now = _speedGovNow()) {',
    '\n    _speedGovDemandBarsPerSecond() {',
    '\n    _speedGovResetMeter() {',
    '\n    _speedGovOwedSteps(now, intervalMs, stepsPerTick) {',
    '\n    _speedGovInstallClock(kind, fn, ms) {',
    '\n    _speedGovClearClock() {',
    '\n    _speedGovClockCount() {',
    '\n    getCandlePlaybackCadence() {',
];

/**
 * Build an engine carrying the shipped governor over a scene we control.
 * Every time-taking method accepts an explicit `now`, so the meter is driven by
 * the test's clock rather than by how long the test itself takes to run.
 *
 * `mutate` rewrites the lifted source before it is compiled; that is how each
 * oracle proves it would notice the fix being inert.
 */
function build({ win, timers, mutate = (s) => s, source = src } = {}) {
    const w = win || (() => { const x = {}; x.parent = x; x.top = x; return x; })();
    const t = timers || makeTimers();

    const body = mutate(`
        ${source.match(/const SPEED_GOV_LADDER_BPS = Object\.freeze\(\[[^\]]*\]\);/)[0]}
        ${source.match(/const SPEED_GOV_REALISTIC = '[^']*';/)[0]}
        const SPEED_GOV_TICK_TF_DIVISOR = ${TF_DIVISOR};
        const SPEED_GOV_DRIFT_TOLERANCE = ${TOLERANCE};
        const SPEED_GOV_DRIFT_GRACE_MS = ${GRACE_MS};
        const SPEED_GOV_RATE_WINDOW_MS = ${WINDOW_MS};
        const SPEED_GOV_MIN_INTERVAL_MS = ${MIN_INTERVAL};
        const SPEED_GOV_MIN_GAIN = ${MIN_GAIN};
        const SPEED_GOV_MAX_GAIN = ${MAX_GAIN};
        const SPEED_GOV_MAX_CATCHUP_BARS = ${MAX_CATCHUP};
        ${balanced(source, 'function _speedGovV1Enabled(')}
        ${balanced(source, 'function _speedGovNow(')}
        return {
            ${METHODS.map((m) => balanced(source, m)).join(',\n            ')}
        };
    `);

    const factory = new Function(
        'window', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', body,
    );
    const proto = factory(w, t.setInterval, t.clearInterval, t.setTimeout, t.clearTimeout);

    const engine = Object.create(proto);
    engine.speed = 10;
    engine.isPlaying = true;
    engine.isActive = true;
    engine.currentIndex = 0;
    engine._mode = 'candle';
    engine.getPlaybackMode = function () { return this._mode; };
    engine._resolveReplayStepTimeframeMs = function () { return this._tfMs ?? 60_000; };
    engine._getOrderExecutionCadenceMs = () => null;
    engine._isOrderMoneyPathBatchEnabled = () => true;
    engine._isFinestTfCandleCadenceFixEnabled = () => false;
    engine._isFinestTfCadenceSubStepActive = () => false;
    engine._finestTfCadenceSubdivisions = () => 1;
    return { engine, win: w, timers: t };
}

/** A countable timer table: installs, clears, and what is still live. */
function makeTimers() {
    const live = new Map();
    let next = 1;
    let installs = 0;
    const install = (fn) => { const id = next++; installs++; live.set(id, fn); return id; };
    return {
        setInterval: install,
        setTimeout: install,
        clearInterval: (id) => { live.delete(id); },
        clearTimeout: (id) => { live.delete(id); },
        get liveCount() { return live.size; },
        get installs() { return installs; },
        fire(id) { const fn = live.get(id); if (fn) fn(); },
        fireAll() { [...live.values()].forEach((fn) => fn()); },
    };
}

/** Feed the meter a run of bars at a chosen real rate. */
function feed(engine, { bars, overMs, startAt = 1000 }) {
    const per = overMs / bars;
    for (let i = 1; i <= bars; i += 1) engine._speedGovRecordBars(1, startAt + i * per);
    return startAt + bars * per;
}

// ---------------------------------------------------------------------------
// O1 — rate. A speed is bars per second, and the meter reports what was delivered.
// ---------------------------------------------------------------------------

test('O1 the ladder is ten speeds, stated in bars per second', () => {
    const { engine } = build();
    const ladder = engine.getSpeedLadderBarsPerSecond();
    assert.equal(ladder.length, 10, 'ORDER-01 specifies ten candle speeds');
    assert.deepEqual(ladder, [...ladder].sort((a, b) => a - b), 'ladder must ascend');
    assert.ok(ladder.every((n) => Number.isFinite(n) && n > 0), 'every rung is a rate');
    // The two rungs the PO hand-measured must exist, or the measurement is unanchored.
    assert.ok(ladder.includes(10), 'PO measured the 10x rung at 10.4 bars/s');
    assert.ok(ladder.includes(60), 'PO measured the 60x rung at 62.4 bars/s');
});

test('O1 a speed of N means N bars per second, measured off the playhead', () => {
    const { engine } = build();
    engine.speed = 10;
    // Deliver exactly 10 bars in exactly one second.
    const now = feed(engine, { bars: 10, overMs: 1000 });
    const effective = engine.getEffectiveBarsPerSecond(now);
    assert.ok(Math.abs(effective - 10) < 0.6, `expected ~10 bars/s, got ${effective}`);
    assert.equal(engine.getTargetBarsPerSecond(), 10);
});

test('O1 the meter reports the delivered rate, not the requested one', () => {
    const { engine } = build();
    engine.speed = 60;
    // The 60x session that actually delivered 1.74 bars/s. The label is 60;
    // the instrument must say 1.74, which is the entire point of the row.
    const now = feed(engine, { bars: 3, overMs: 1724 });
    const effective = engine.getEffectiveBarsPerSecond(now);
    assert.ok(effective < 5, `a collapsed session must read low, got ${effective}`);
    assert.equal(engine.getTargetBarsPerSecond(), 60, 'the label is unchanged');
});

test('O1 the effective rate is published continuously for read-back', () => {
    const { engine, win } = build();
    engine.speed = 10;
    const now = feed(engine, { bars: 10, overMs: 1000 });
    engine._speedGovPublishEffectiveRate(now);
    assert.equal(typeof win.__talariaEffectiveRate, 'number',
        'the soak reads __talariaEffectiveRate as a plain number');
    assert.ok(Math.abs(win.__talariaEffectiveRate - 10) < 0.6);
    assert.equal(win.__talariaSpeedGov.target, 10);
    assert.equal(win.__talariaSpeedGov.mode, 'candle');
});

test('O1 the rate window slides, so an old burst cannot hold the number up', () => {
    const { engine } = build();
    feed(engine, { bars: 50, overMs: 500, startAt: 1000 });
    // Ask again well past the window with nothing delivered since.
    const later = 1000 + WINDOW_MS * 4;
    assert.equal(engine.getEffectiveBarsPerSecond(later), 0,
        'a stalled session must read 0, not the rate it used to have');
});

test('O1 the meter divides bars by the gaps between them, not by one gap too few', () => {
    const { engine } = build();
    engine.speed = 10;
    // Ten bars at a clean 10/s. Measuring the span from the oldest retained
    // sample would count ten bars across nine gaps and read 11.1 bars/s: an
    // 11% over-read, which is past the 5% threshold, so the governor would
    // invent drift and correct against a session that was exactly on rate.
    const now = feed(engine, { bars: 10, overMs: 1000 });
    const effective = engine.getEffectiveBarsPerSecond(now);
    assert.ok(Math.abs(effective - 10) < 0.05,
        `an exactly-on-rate scene must read exactly on rate, got ${effective}`);
    assert.ok(Math.abs(effective - 10) / 10 < TOLERANCE,
        'meter bias must not by itself exceed the correction threshold');
});

test('O1 MUTANT: a meter that reports the request instead of the delivery goes red', () => {
    const { engine } = build({
        mutate: (s) => s.replace(
            'return (bars * 1000) / spanMs;',
            'return this.getTargetBarsPerSecond();',
        ),
    });
    engine.speed = 60;
    const now = feed(engine, { bars: 3, overMs: 1724 });
    const effective = engine.getEffectiveBarsPerSecond(now);
    assert.ok(effective >= 5,
        'the mutant must report the label; if it still reads low the oracle is vacuous');
});

// ---------------------------------------------------------------------------
// O2 — tick-duration. (timeframe_seconds / 4) / N, and REALISTIC at 1:1.
// ---------------------------------------------------------------------------

test('O2 tick bar duration is (timeframe_seconds / 4) / N', () => {
    const { engine } = build();
    for (const tfSeconds of [60, 300, 900]) {
        for (const n of engine.getSpeedLadderBarsPerSecond()) {
            const expected = ((tfSeconds / TF_DIVISOR) / n) * 1000;
            const actual = engine.getTickBarDurationMs(n, tfSeconds * 1000);
            assert.ok(Math.abs(actual - expected) < 1e-6,
                `tf=${tfSeconds}s N=${n}: expected ${expected} ms, got ${actual} ms`);
        }
    }
});

test('O2 REALISTIC runs one bar per timeframe, 1:1 with the market clock', () => {
    const { engine } = build();
    assert.equal(engine.getTickBarDurationMs('REALISTIC', 60_000), 60_000);
    assert.equal(engine.getTickBarDurationMs('REALISTIC', 900_000), 900_000);
});

test('O2 the shipped tick path uses the contracted duration, not the legacy divisor', () => {
    // The legacy line divided by N alone, making every rung four times too slow.
    const at = soleIndexOf(src, 'let realTimeCandleDuration = _speedGovV1Enabled()');
    const region = src.slice(at, at + 500);
    assert.ok(region.includes('this.getTickBarDurationMs('),
        'the tick path must take its duration from the contracted formula');
    assert.ok(region.includes('rawCandleTimeframeMs / effectivePlaybackSpeed'),
        'the kill-switch must still restore the legacy divisor');
});

test('O2 MUTANT: dropping the /4 divisor goes red', () => {
    const { engine } = build({
        mutate: (s) => s.replace(
            'const SPEED_GOV_TICK_TF_DIVISOR = 4;',
            'const SPEED_GOV_TICK_TF_DIVISOR = 1;',
        ),
    });
    const expected = ((60 / TF_DIVISOR) / 10) * 1000;
    assert.notEqual(engine.getTickBarDurationMs(10, 60_000), expected,
        'the mutant must diverge; if it matches, the oracle is not reading the divisor');
});

// ---------------------------------------------------------------------------
// O3 — drift. Correct on >5% sustained >5 s, and not before.
// ---------------------------------------------------------------------------

test('O3 drift inside tolerance never corrects', () => {
    const { engine } = build();
    engine.speed = 10;
    let now = feed(engine, { bars: 10, overMs: 1010 }); // ~1% slow
    engine._speedGovPublishEffectiveRate(now);
    for (let i = 0; i < 10; i += 1) {
        now += GRACE_MS;
        assert.equal(engine._speedGovEvaluateDrift(now), false,
            'a rate within 5% is the contract being met, not a fault');
    }
    assert.equal(engine._speedGovState().gain, 1);
});

test('O3 large drift does not correct until it has been sustained past the grace window', () => {
    const { engine } = build();
    engine.speed = 10;
    const now = feed(engine, { bars: 2, overMs: 1000 }); // ~2 bars/s against a target of 10
    engine._speedGovPublishEffectiveRate(now);

    assert.equal(engine._speedGovEvaluateDrift(now), false, 'first sight only opens the run');
    assert.equal(engine._speedGovEvaluateDrift(now + GRACE_MS - 1), false,
        'one millisecond short of the grace window must not correct');
    assert.equal(engine._speedGovState().gain, 1, 'gain untouched before the window closes');

    assert.equal(engine._speedGovEvaluateDrift(now + GRACE_MS + 1), true,
        'sustained past the grace window must correct');
    assert.ok(engine._speedGovState().gain > 1, 'a slow session must raise demand');
});

test('O3 a drift run that recovers inside the window is forgotten, not banked', () => {
    const { engine } = build();
    engine.speed = 10;
    let now = feed(engine, { bars: 2, overMs: 1000 });
    engine._speedGovPublishEffectiveRate(now);
    engine._speedGovEvaluateDrift(now); // opens the run

    // Recover to nominal, then run well past the grace window.
    engine._speedGovResetMeter();
    now = feed(engine, { bars: 10, overMs: 1000, startAt: now });
    engine._speedGovPublishEffectiveRate(now);
    assert.equal(engine._speedGovEvaluateDrift(now), false, 'recovery closes the run');
    assert.equal(engine._speedGovEvaluateDrift(now + GRACE_MS * 3), false,
        'the earlier run must not still be counting');
    assert.equal(engine._speedGovState().gain, 1);
});

test('O3 correction moves demand toward the label and is bounded', () => {
    const { engine } = build();
    engine.speed = 60;
    // The observed collapse: 1.74 bars/s at a nominal 60.
    const now = feed(engine, { bars: 3, overMs: 1724 });
    engine._speedGovPublishEffectiveRate(now);
    engine._speedGovEvaluateDrift(now);
    assert.equal(engine._speedGovEvaluateDrift(now + GRACE_MS + 1), true);

    const gain = engine._speedGovState().gain;
    assert.ok(gain > 1, 'demand must rise to chase the label');
    assert.ok(gain <= MAX_GAIN,
        `a near-stalled session must not demand an unbounded burst (gain ${gain})`);
    assert.ok(engine._speedGovDemandBarsPerSecond() > engine.getTargetBarsPerSecond());
});

test('O3 a session running fast is corrected downward, and the clamp holds', () => {
    const { engine } = build();
    engine.speed = 1;
    const now = feed(engine, { bars: 40, overMs: 1000 }); // 40 bars/s against a target of 1
    engine._speedGovPublishEffectiveRate(now);
    engine._speedGovEvaluateDrift(now);
    engine._speedGovEvaluateDrift(now + GRACE_MS + 1);
    const gain = engine._speedGovState().gain;
    assert.ok(gain < 1, 'an over-fast session must lower demand');
    assert.ok(gain >= MIN_GAIN, `gain must not fall below the clamp (got ${gain})`);
});

test('O3 correction clears the window it was computed from', () => {
    const { engine } = build();
    engine.speed = 10;
    const now = feed(engine, { bars: 2, overMs: 1000 });
    engine._speedGovPublishEffectiveRate(now);
    engine._speedGovEvaluateDrift(now);
    engine._speedGovEvaluateDrift(now + GRACE_MS + 1);
    assert.equal(engine._speedGovState().samples.length, 0,
        'judging the correction on pre-correction evidence would correct twice for one fault');
});

test('O3 a paused engine is never judged for drift', () => {
    const { engine } = build();
    engine.speed = 10;
    // A rate that would certainly correct if the engine were still playing.
    const now = feed(engine, { bars: 2, overMs: 1000 });
    engine._speedGovPublishEffectiveRate(now);
    assert.ok(engine._speedGovState().lastEffective > 0, 'the scene must be a real fault');
    engine.isPlaying = false;
    engine._speedGovEvaluateDrift(now);
    assert.equal(engine._speedGovEvaluateDrift(now + GRACE_MS * 3), false,
        'paused time is not slow time');
    assert.equal(engine._speedGovState().gain, 1);
});

test('O3 MUTANT: correcting on the first sight of drift goes red', () => {
    const { engine } = build({
        mutate: (s) => s.replace(
            'if (now - gov.driftSince < SPEED_GOV_DRIFT_GRACE_MS) return false;',
            '',
        ).replace(
            `if (gov.driftSince === null) {
            gov.driftSince = now;
            return false;
        }`,
            '',
        ),
    });
    engine.speed = 10;
    const now = feed(engine, { bars: 2, overMs: 1000 });
    engine._speedGovPublishEffectiveRate(now);
    assert.equal(engine._speedGovEvaluateDrift(now), true,
        'the mutant must correct immediately; if it waits, the grace cell proves nothing');
});

test('O3 MUTANT: an unclamped corrector goes red', () => {
    const { engine } = build({
        mutate: (s) => s.replace(
            'const SPEED_GOV_MAX_GAIN = 8;',
            'const SPEED_GOV_MAX_GAIN = 1e9;',
        ),
    });
    engine.speed = 60;
    const now = feed(engine, { bars: 3, overMs: 3000 }); // ~1 bar/s at nominal 60
    engine._speedGovPublishEffectiveRate(now);
    engine._speedGovEvaluateDrift(now);
    engine._speedGovEvaluateDrift(now + GRACE_MS + 1);
    assert.ok(engine._speedGovState().gain > MAX_GAIN,
        'the mutant must exceed the shipped clamp, or the clamp cell is vacuous');
});

// ---------------------------------------------------------------------------
// O4 — no-stacking. One owned clock, replaced and never duplicated.
// ---------------------------------------------------------------------------

test('O4 installing repeatedly leaves exactly one live clock', () => {
    const { engine, timers } = build();
    for (let i = 0; i < 25; i += 1) {
        engine._speedGovInstallClock('interval', () => {}, 16);
    }
    assert.equal(timers.installs, 25, 'each call really did install');
    assert.equal(timers.liveCount, 1, 'but only one is live');
    assert.equal(engine._speedGovClockCount(), 1);
});

test('O4 clearing releases the clock and is safe to repeat', () => {
    const { engine, timers } = build();
    engine._speedGovInstallClock('interval', () => {}, 16);
    engine._speedGovClearClock();
    assert.equal(timers.liveCount, 0);
    assert.equal(engine._speedGovClockCount(), 0);
    engine._speedGovClearClock();
    engine._speedGovClearClock();
    assert.equal(engine._speedGovClockCount(), 0, 'clearing an absent clock is a no-op');
});

test('O4 a callback from a replaced clock is inert', () => {
    const { engine, timers } = build();
    let stale = 0;
    let live = 0;
    const first = engine._speedGovInstallClock('interval', () => { stale += 1; }, 16);
    engine._speedGovInstallClock('interval', () => { live += 1; }, 16);
    // The replaced handle is gone from the table, but a callback can already
    // be in flight; the epoch is what makes it harmless.
    timers.fire(first);
    timers.fireAll();
    assert.equal(stale, 0, 'a superseded clock must not touch the playhead');
    assert.equal(live, 1);
});

test('O4 a callback that survives a clear is inert too', () => {
    const { engine, timers } = build();
    let fired = 0;
    const id = engine._speedGovInstallClock('timeout', () => { fired += 1; }, 16);
    engine._speedGovClearClock();
    timers.fire(id);
    assert.equal(fired, 0);
});

test('O4 interval and timeout clocks are released through their own clearer', () => {
    const { engine } = build();
    engine._speedGovInstallClock('interval', () => {}, 16);
    assert.equal(engine._speedGovState().clockKind, 'interval');
    engine._speedGovInstallClock('timeout', () => {}, 16);
    assert.equal(engine._speedGovState().clockKind, 'timeout',
        'clearing an interval handle with clearTimeout is how handles leak');
});

test('O4 MUTANT: an installer that does not clear first goes red', () => {
    const { engine, timers } = build({
        mutate: (s) => s.replace(
            `        const gov = this._speedGovState();
        this._speedGovClearClock();
        gov.clockEpoch++;`,
            `        const gov = this._speedGovState();
        gov.clockEpoch++;`,
        ),
    });
    for (let i = 0; i < 5; i += 1) engine._speedGovInstallClock('interval', () => {}, 16);
    assert.ok(timers.liveCount > 1,
        `the mutant must stack (got ${timers.liveCount}); if it does not, the oracle is vacuous`);
});

// ---------------------------------------------------------------------------
// O5 — cross-mode. One ladder, each mode honouring its own contract.
// ---------------------------------------------------------------------------

test('O5 tick mode offers the same ten speeds plus REALISTIC', () => {
    const { engine } = build();
    const candle = engine.getSpeedLadderBarsPerSecond();
    const tick = engine.getTickSpeedLadder();
    assert.equal(tick.length, candle.length + 1);
    assert.deepEqual(tick.slice(0, candle.length), candle, 'the ten are shared, not re-declared');
    assert.equal(tick[tick.length - 1], 'REALISTIC');
});

test('O5 each mode reports the target its own contract implies', () => {
    const { engine } = build();
    engine.speed = 10;
    engine._tfMs = 60_000;

    engine._mode = 'candle';
    assert.equal(engine.getTargetBarsPerSecond(), 10,
        'candle mode: the label is the rate');

    engine._mode = 'tick';
    // (60 / 4) / 10 = 1.5 s per bar, so 0.667 bars/s.
    const expected = 1000 / (((60 / TF_DIVISOR) / 10) * 1000);
    assert.ok(Math.abs(engine.getTargetBarsPerSecond() - expected) < 1e-9,
        'tick mode: the rate follows from the contracted bar duration');
});

test('O5 the meter judges each mode against that mode\'s own target', () => {
    const { engine, win } = build();
    engine._tfMs = 60_000;
    engine.speed = 10;

    engine._mode = 'tick';
    const now = feed(engine, { bars: 2, overMs: 3000 }); // 0.667 bars/s: on contract for tick
    engine._speedGovPublishEffectiveRate(now);
    assert.equal(engine._speedGovEvaluateDrift(now), false,
        'a tick session on its own contract must not be judged against the candle rate');
    assert.equal(win.__talariaSpeedGov.mode, 'tick', 'read-back names the mode it measured');
});

test('O5 the same delivered rate is a fault in one mode and correct in the other', () => {
    // This is the cell that would catch a shared-target regression: 0.667 bars/s
    // is exactly right for tick at 10x on a 1m chart, and badly wrong for candle.
    const scene = () => {
        const { engine } = build();
        engine._tfMs = 60_000;
        engine.speed = 10;
        return engine;
    };

    const tick = scene();
    tick._mode = 'tick';
    let now = feed(tick, { bars: 2, overMs: 3000 });
    tick._speedGovPublishEffectiveRate(now);
    tick._speedGovEvaluateDrift(now);
    assert.equal(tick._speedGovEvaluateDrift(now + GRACE_MS + 1), false,
        'tick at 0.667 bars/s is the contract being met');

    const candle = scene();
    candle._mode = 'candle';
    now = feed(candle, { bars: 2, overMs: 3000 });
    candle._speedGovPublishEffectiveRate(now);
    candle._speedGovEvaluateDrift(now);
    assert.equal(candle._speedGovEvaluateDrift(now + GRACE_MS + 1), true,
        'candle at 0.667 bars/s against a label of 10 is a fault');
});

test('O5 MUTANT: a target that ignores the mode goes red', () => {
    const { engine } = build({
        mutate: (s) => s.replace(
            `        if (this.getPlaybackMode() === 'tick') {`,
            '        if (false) {',
        ),
    });
    engine._tfMs = 60_000;
    engine.speed = 10;
    engine._mode = 'tick';
    assert.equal(engine.getTargetBarsPerSecond(), 10,
        'the mutant must read the candle target in tick mode, or O5 proves nothing');
});

// ---------------------------------------------------------------------------
// Cadence, catch-up, and the switch.
// ---------------------------------------------------------------------------

test('cadence is derived from the corrected demand, not the raw label', () => {
    const { engine } = build();
    engine.speed = 10;
    const before = engine.getCandlePlaybackCadence();
    engine._speedGovState().gain = 2;
    const after = engine.getCandlePlaybackCadence();
    assert.ok(after.intervalMs < before.intervalMs || after.stepsPerTick > before.stepsPerTick,
        'raising demand must actually change the cadence');
});

test('latest-state-wins bills the elapsed wall clock, not the hoped-for interval', () => {
    const { engine } = build();
    // First tick has no predecessor: one tick's worth of work.
    assert.equal(engine._speedGovOwedSteps(1000, 100, 1), 1);
    // Ten intervals of wall clock actually passed: ten intervals of work.
    assert.equal(engine._speedGovOwedSteps(2000, 100, 1), 10);
});

test('catch-up is capped, so a long stall is not one unbounded frame', () => {
    const { engine } = build();
    engine._speedGovOwedSteps(1000, 16, 1);
    const owed = engine._speedGovOwedSteps(1000 + 600_000, 16, 1);
    assert.equal(owed, MAX_CATCHUP,
        'an unbounded frame is the very thing that caused the drift being corrected');
});

test('catch-up counts steps, not bars, so sub-bar stepping is not run at a multiple', () => {
    const { engine } = build();
    engine._speedGovOwedSteps(1000, 100, 4);
    assert.equal(engine._speedGovOwedSteps(1300, 100, 4), 12,
        'three intervals at four steps each is twelve steps');
});

test('the switch is ON by default and OFF only when explicitly disabled', () => {
    const realm = (value) => {
        const w = {};
        if (value !== undefined) w.__TALARIA_SPEED_GOV_V1 = value;
        w.parent = w;
        w.top = w;
        return w;
    };
    const on = (v) => build({ win: realm(v) }).engine.getCandlePlaybackCadence();

    // Absent means on: a governor that has to be switched on is a governor nobody runs.
    const { engine: dflt } = build({ win: realm(undefined) });
    dflt.speed = 0.5;
    assert.ok(dflt.getCandlePlaybackCadence().intervalMs > 1000,
        'default-ON must honour the 0.5 rung');

    for (const off of [false, 0, '0', 'off', 'no', 'false', 'OFF']) {
        const { engine } = build({ win: realm(off) });
        engine.speed = 0.5;
        // Ungoverned, 0.5 is clamped up to 1, so the interval is ~1000 ms not ~2000 ms.
        assert.ok(engine.getCandlePlaybackCadence().intervalMs <= 1000,
            `explicitly-off value ${JSON.stringify(off)} must restore legacy clamping`);
    }
    for (const truthy of [true, 1, 'on', 'yes']) {
        assert.ok(on(truthy).intervalMs > 0);
    }
});

test('the switch is read from the host realm when a panel has none of its own', () => {
    const top = { __TALARIA_SPEED_GOV_V1: false };
    top.parent = top;
    top.top = top;
    const panel = { parent: top, top };
    const { engine } = build({ win: panel });
    engine.speed = 0.5;
    assert.ok(engine.getCandlePlaybackCadence().intervalMs <= 1000,
        'a switch thrown on the host must reach a panel in its own realm');
});

test('the meter is cleared across a discontinuity', () => {
    const { engine } = build();
    feed(engine, { bars: 10, overMs: 1000 });
    engine._speedGovState().driftSince = 123;
    engine._speedGovState().lastTickAt = 456;
    engine._speedGovResetMeter();
    const gov = engine._speedGovState();
    assert.equal(gov.samples.length, 0);
    assert.equal(gov.driftSince, null);
    assert.equal(gov.lastTickAt, null, 'a seek must not be billed as elapsed playback time');
});

// ---------------------------------------------------------------------------
// Wiring and mirror parity — a governor nothing calls is not a governor.
// ---------------------------------------------------------------------------

test('the playback tick measures the playhead and publishes on every tick', () => {
    const at = soleIndexOf(src, '    _runCandlePlaybackTick() {');
    const body = balanced(src, '\n    _runCandlePlaybackTick() {');
    assert.ok(body.includes('_speedGovOwedSteps('), 'catch-up must be wired into the tick');
    assert.ok(body.includes('_speedGovRecordBars('), 'the meter must be fed by the tick');
    assert.ok(body.includes('_speedGovPublishEffectiveRate('), 'read-back must be continuous');
    assert.ok(body.includes('_speedGovEvaluateDrift('), 'drift must be judged on the tick');
    assert.ok(body.includes('Number(this.currentIndex) - govStartIndex'),
        'delivery must be measured off the playhead, not off steps attempted');
    assert.ok(at > 0);
});

test('speed changes and pauses reset the meter', () => {
    assert.ok(balanced(src, '\n    setSpeed(speed) {').includes('_speedGovResetMeter()'),
        'a new label describes a new regime');
    const pause = balanced(src, '\n    pause() {');
    assert.ok(pause.includes('_speedGovClearClock()'), 'pause must release the owned clock');
    assert.ok(pause.includes('_speedGovResetMeter()'), 'paused time is not slow time');
});

test('both mirrors carry the identical governor', () => {
    assert.equal(readFileSync(RS_A, 'utf8'), readFileSync(RS_B, 'utf8'),
        'a fix in one mirror only is a fix the panel realm does not get');
});
