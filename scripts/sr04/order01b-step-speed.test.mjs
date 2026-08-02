/**
 * ORDER-01B — the step knob, and what a speed means once it exists.
 *
 * SPEED-01 made a speed honest: `10` delivers ten bars a second and the
 * governor proves it. What it could not fix is that the ladder answers only
 * "how often" — ten steps a second across one-minute bars and ten steps a
 * second across one-second bars are the same speed and sixty times apart in
 * market time. Users asking for "slower" were asking for a shorter step, and
 * the only control on the toolbar made the chart tick less often instead.
 *
 * So the reinterpretation: the ladder is steps per wall-second, a second knob
 * says how much market time a step covers, and the rate anyone can check
 * against a clock is the product of the two.
 *
 * Oracles, one per clause:
 *   S1 offer      - only divisors of the chart timeframe, and always the timeframe
 *   S2 refusal    - an off-divisor step is refused, never rounded
 *   S3 rate       - market seconds per wall second is speed x step
 *   S4 identity   - at step = timeframe the product is the pre-ORDER-01B run
 *   S5 cadence    - one step per tick at 1000/speed ms, whatever else wants steps
 *   S6 killswitch - the switch restores one-bar steps and refuses the knob
 *   S7 routing    - a step under the data floor routes to the drawn path
 *   S8 mirrors    - both copies of the engine carry it
 *
 * Every oracle carries a mutant cell that neuters the shipped logic in memory
 * and asserts the oracle goes red (PROC-3), because a cell that cannot fail is
 * not evidence that the behaviour is there.
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

const METHODS = [
    '\n    getChartTimeframeSeconds() {',
    '\n    getDataFloorSeconds() {',
    '\n    getOfferedStepSeconds() {',
    '\n    isStepBelowDataFloor(seconds = this.getStepSeconds()) {',
    '\n    getStepRouting() {',
    '\n    getStepLabel(seconds = this.getStepSeconds()) {',
    '\n    getStepMenu() {',
    '\n    canServeStep(seconds) {',
    '\n    getStepSeconds() {',
    '\n    setStepSeconds(seconds) {',
    '\n    _order01bHasExplicitStep() {',
    '\n    getTargetStepsPerWallSecond() {',
    '\n    getMarketSecondsPerWallSecond() {',
    '\n    getCandlePlaybackCadence() {',
    '\n    normalizeSpeed(speed) {',
    '\n    migrateStoredSpeed(stored) {',
    '\n    timeframeToMs(tf) {',
    '\n    _hasExplicitReplayStepInterval() {',
    '\n    getSpeedLadderBarsPerSecond() {',
    '\n    getTickSpeedLadder() {',
    '\n    applyRealisticPreset() {',
    '\n    isRealisticPresetActive() {',
    '\n    getTargetBarsPerSecond() {',
    '\n    getTickBarDurationMs(speed = this.speed, tfMsOverride = null) {',
    '\n    _speedGovState() {',
    '\n    _speedGovRecordBars(bars, now = _speedGovNow()) {',
    '\n    _speedGovTrimWindow(now = _speedGovNow()) {',
    '\n    getEffectiveBarsPerSecond(now = _speedGovNow()) {',
    '\n    getEffectiveMarketSecondsPerWallSecond(now = _speedGovNow()) {',
    '\n    _speedGovPublishEffectiveRate(now = _speedGovNow()) {',
    '\n    _speedGovTargetRate() {',
];

/**
 * Build an engine carrying the shipped step logic over a scene we control.
 * `mutate` rewrites the lifted source before it is compiled; that is how each
 * oracle proves it would notice the shipped code being inert.
 */
function build({ mutate = (s) => s, tfSeconds = 60, rawSeconds = 60, flags = {} } = {}) {
    const w = {};
    w.parent = w;
    w.top = w;
    Object.assign(w, flags);

    const body = mutate(`
        ${src.match(/const SPEED_GOV_LADDER_BPS = Object\.freeze\(\[[^\]]*\]\);/)[0]}
        ${src.match(/const SPEED_GOV_REALISTIC = '[^']*';/)[0]}
        ${src.match(/const SPEED_GOV_MIN_INTERVAL_MS = \d+;/)[0]}
        ${src.match(/const SPEED_GOV_TICK_TF_DIVISOR = \d+;/)[0]}
        ${src.match(/const SPEED_GOV_RATE_WINDOW_MS = \d+;/)[0]}
        ${src.match(/const ORDER01B_STEP_CANDIDATE_SECONDS = Object\.freeze\(\[[^\]]*\]\);/)[0]}
        ${balanced(src, 'function _speedGovFlagState(')}
        ${balanced(src, 'function _speedGovV1Enabled(')}
        ${balanced(src, 'function _speedGovNearestRung(')}
        ${balanced(src, 'function _speedGovNow(')}
        ${balanced(src, 'function _order01bStepV1Enabled(')}
        ${balanced(src, 'function _order01bStepLabel(')}
        return {
            ${METHODS.map((m) => balanced(src, m)).join(',\n            ')}
        };
    `);

    const proto = new Function('window', body)(w);

    const engine = Object.create(proto);
    engine.speed = 10;
    engine.isPlaying = true;
    engine.isActive = true;
    engine.stepTimeframeOverride = null;
    engine.chart = { currentTimeframe: labelFor(tfSeconds) };
    engine._rawMs = rawSeconds * 1000;
    engine._getRawBarPeriodMs = function () { return this._rawMs; };
    engine._speedGovResetMeter = function () { this._meterResets = (this._meterResets || 0) + 1; };
    engine._restartPlaybackAfterControlChange = function () { this._restarts = (this._restarts || 0) + 1; };
    engine._resolveReplayStepTimeframeMs = function () {
        const ms = this.timeframeToMs(this.stepTimeframeOverride);
        if (Number.isFinite(ms) && ms > 0) return ms;
        return this.timeframeToMs(this.chart.currentTimeframe);
    };
    engine._getOrderExecutionCadenceMs = () => null;
    engine._isOrderMoneyPathBatchEnabled = () => true;
    engine._isFinestTfCandleCadenceFixEnabled = () => true;
    engine._isFinestTfCadenceSubStepActive = () => false;
    engine._finestTfCadenceSubdivisions = () => 1;
    engine._speedGovDemandBarsPerSecond = function () { return Number(this.speed) || 1; };
    engine._mode = 'candle';
    engine.getPlaybackMode = function () { return this._mode; };
    engine.setPlaybackMode = function (mode) {
        this._mode = mode === 'candle' ? 'candle' : 'tick';
        this._modeSwitches = (this._modeSwitches || 0) + 1;
    };
    // The shipped setSpeed re-arms timers and touches the toolbar. The preset's
    // contract is which values the two knobs end up holding, so the scene keeps
    // the normalising assignment and drops the DOM.
    engine.setSpeed = function (speed) { this.speed = this.normalizeSpeed(speed); };
    return { engine, win: w };
}

function labelFor(seconds) {
    if (seconds % 86400 === 0) return `${seconds / 86400}d`;
    if (seconds % 3600 === 0) return `${seconds / 3600}h`;
    if (seconds % 60 === 0) return `${seconds / 60}m`;
    return `${seconds}s`;
}

// ---------------------------------------------------------------------------
// S1 — the offer. Only divisors, and always the timeframe itself.
// ---------------------------------------------------------------------------

test('S1 every offered step divides the chart timeframe exactly', () => {
    for (const tf of [60, 300, 900, 3600, 14400, 86400]) {
        const { engine } = build({ tfSeconds: tf });
        const offered = engine.getOfferedStepSeconds();
        assert.ok(offered.length > 0, `${tf}s offered nothing`);
        for (const step of offered) {
            assert.equal(tf % step, 0,
                `${step}s does not divide a ${tf}s timeframe, so every bar would end ragged`);
            assert.ok(step <= tf, `${step}s is coarser than the ${tf}s bar it steps through`);
        }
    }
});

test('S1 one bar per step is always reachable', () => {
    // The setting the entire pre-ORDER-01B product ran at. If a timeframe can
    // offer everything except its own length, the knob has taken away the only
    // behaviour users already had.
    for (const tf of [60, 300, 900, 3600, 86400, 7 * 86400]) {
        const { engine } = build({ tfSeconds: tf });
        assert.ok(engine.getOfferedStepSeconds().includes(tf),
            `a ${tf}s timeframe must still offer a one-bar step`);
    }
});

test('S1 a one-minute chart offers the sub-minute steps and nothing coarser', () => {
    const { engine } = build({ tfSeconds: 60 });
    assert.deepEqual(engine.getOfferedStepSeconds(), [1, 2, 5, 10, 15, 30, 60]);
});

test('S1 MUTANT: dropping the divisor test offers ragged steps', () => {
    // On a 15-minute chart: 120s is below the timeframe and does not divide it.
    // A one-minute chart cannot carry this mutant at all — every candidate at
    // or under 60 happens to divide 60 — which is exactly why the cell above
    // sweeps several timeframes rather than trusting the default one.
    const { engine } = build({
        tfSeconds: 900,
        mutate: (s) => s.replace('if (tfSeconds % candidate === 0) out.push(candidate);',
            'out.push(candidate);'),
    });
    const offered = engine.getOfferedStepSeconds();
    assert.ok(offered.some((step) => 900 % step !== 0),
        'the mutant must offer a non-divisor; if it does not, S1 proves nothing');
});

// ---------------------------------------------------------------------------
// S2 — refusal. An off-divisor step is refused, never rounded.
// ---------------------------------------------------------------------------

test('S2 an off-divisor step is refused and changes nothing', () => {
    const { engine } = build({ tfSeconds: 60 });
    const before = engine.getStepSeconds();
    assert.equal(engine.setStepSeconds(7), false, '7s does not divide a 60s bar');
    assert.equal(engine.getStepSeconds(), before, 'a refused step must not move the state');
    assert.equal(engine.stepTimeframeOverride, null);
});

test('S2 a refused step is not silently rounded to a neighbour', () => {
    // The engine snaps *speeds* to the nearest rung, which is right for a user
    // dragging a slider. Doing the same to a step would have every harness
    // record the step it asked for and run at a different one.
    const { engine } = build({ tfSeconds: 60 });
    engine.setStepSeconds(7);
    assert.notEqual(engine.getStepSeconds(), 5);
    assert.notEqual(engine.getStepSeconds(), 10);
});

test('S2 an offered step is accepted and takes effect', () => {
    const { engine } = build({ tfSeconds: 300 });
    assert.equal(engine.setStepSeconds(15), true);
    assert.equal(engine.getStepSeconds(), 15);
    assert.equal(engine.stepTimeframeOverride, '15s',
        'the step must write the same override the INTERVAL popup writes');
});

test('S2 choosing a step resets the rate meter and re-arms playback', () => {
    const { engine } = build({ tfSeconds: 300 });
    engine.setStepSeconds(60);
    assert.equal(engine._meterResets, 1,
        'the old window measured a regime that is no longer running');
    assert.equal(engine._restarts, 1, 'a live clock must be re-armed at the new cadence');
});

test('S2 MUTANT: accepting anything positive lets a ragged step through', () => {
    const { engine } = build({
        tfSeconds: 60,
        mutate: (s) => s.replace(
            "if (this.getOfferedStepSeconds().indexOf(n) === -1) return false;", ''),
    });
    assert.equal(engine.setStepSeconds(7), true,
        'the mutant must accept 7s; if it does not, S2 is vacuous');
});

// ---------------------------------------------------------------------------
// S3 — the rate. Market seconds per wall second is speed x step.
// ---------------------------------------------------------------------------

test('S3 the market rate is the product of both knobs', () => {
    const { engine } = build({ tfSeconds: 300 });
    for (const [speed, step, expected] of [
        [1, 1, 1],
        [10, 1, 10],
        [1, 60, 60],
        [10, 60, 600],
        [5, 300, 1500],
    ]) {
        engine.speed = speed;
        assert.equal(engine.setStepSeconds(step), true, `${step}s must be on offer`);
        assert.equal(engine.getMarketSecondsPerWallSecond(), expected,
            `speed ${speed} at a ${step}s step is ${expected} market seconds a second`);
    }
});

test('S3 the same speed at two steps is two different market rates', () => {
    // The whole reason the knob exists: without it these two runs are both
    // called "10x" and one covers sixty times the market time of the other.
    const { engine } = build({ tfSeconds: 60 });
    engine.speed = 10;
    engine.setStepSeconds(1);
    const fine = engine.getMarketSecondsPerWallSecond();
    engine.setStepSeconds(60);
    const coarse = engine.getMarketSecondsPerWallSecond();
    assert.equal(coarse / fine, 60);
});

test('S3 MUTANT: ignoring the step collapses the two rates into one', () => {
    const { engine } = build({
        tfSeconds: 60,
        mutate: (s) => s.replace(
            'return this.getTargetStepsPerWallSecond() * this.getStepSeconds();',
            'return this.getTargetStepsPerWallSecond();'),
    });
    engine.speed = 10;
    engine.setStepSeconds(1);
    const fine = engine.getMarketSecondsPerWallSecond();
    engine.setStepSeconds(60);
    assert.equal(engine.getMarketSecondsPerWallSecond(), fine,
        'the mutant must make the step irrelevant; if not, S3 proves nothing');
});

// ---------------------------------------------------------------------------
// S4 — identity. At step = timeframe this is the pre-ORDER-01B product.
// ---------------------------------------------------------------------------

test('S4 with no step chosen, a step is one bar', () => {
    for (const tf of [60, 300, 3600]) {
        const { engine } = build({ tfSeconds: tf });
        assert.equal(engine.getStepSeconds(), tf,
            'the default must be the chart timeframe, or every existing gate moves');
        assert.equal(engine._order01bHasExplicitStep(), false);
    }
});

test('S4 speed 10 at step = timeframe is ten bars a second, as before', () => {
    const { engine } = build({ tfSeconds: 60 });
    engine.speed = 10;
    const marketPerWall = engine.getMarketSecondsPerWallSecond();
    assert.equal(marketPerWall / 60, 10,
        'the A8 soak point must be arithmetically the old ten-bars-a-second run');
});

test('S4 the untouched cadence is exactly what it was', () => {
    // Nothing about the pre-ORDER-01B path may move, because A8 was measured
    // on it and the comparison is only valid if the run is the same run.
    const { engine } = build({ tfSeconds: 60 });
    engine.speed = 10;
    const cadence = engine.getCandlePlaybackCadence();
    assert.equal(cadence.intervalMs, 100);
    assert.equal(cadence.stepsPerTick, 1);
});

// ---------------------------------------------------------------------------
// S5 — cadence. One step per tick, whatever else would like to add steps.
// ---------------------------------------------------------------------------

test('S5 the tick interval is 1000/speed and one step is taken per tick', () => {
    const { engine } = build({ tfSeconds: 60 });
    for (const speed of [1, 2, 5, 10]) {
        engine.speed = speed;
        engine.setStepSeconds(1);
        const cadence = engine.getCandlePlaybackCadence();
        assert.equal(cadence.intervalMs, Math.floor(1000 / speed));
        assert.equal(cadence.stepsPerTick, 1,
            'a second step in one tick would run at twice the promised rate');
    }
});

/** Steps a second the cadence actually delivers, however it is spelled. */
const stepsPerSecond = (cadence) => (cadence.stepsPerTick * 1000) / cadence.intervalMs;

test('S5 finest-TF subdivision cannot inflate the rate once a step is chosen', () => {
    // This branch keeps a coarse host in step with a finer peer by shortening
    // the tick and batching steps. That is right when a step is one bar of
    // whatever the panel shows, and a silent multiple of the promised market
    // rate once the user has said how far a step goes. Asserted on delivered
    // steps per second, because the inflation can arrive through either term.
    const { engine } = build({ tfSeconds: 3600 });
    engine.speed = 10;
    engine._isFinestTfCadenceSubStepActive = () => true;
    engine._finestTfCadenceSubdivisions = () => 60;
    engine.setStepSeconds(60);
    const cadence = engine.getCandlePlaybackCadence();
    assert.equal(cadence.stepsPerTick, 1);
    assert.equal(cadence.intervalMs, 100);
    assert.equal(stepsPerSecond(cadence), 10, 'the ladder said ten steps a second');
});

test('S5 MUTANT: removing the guard lets subdivision inflate the rate', () => {
    const { engine } = build({
        tfSeconds: 3600,
        mutate: (s) => s.replace(
            'if (this._order01bHasExplicitStep()) {\n            return { intervalMs, stepsPerTick: 1, orderMoneyPath };\n        }',
            ''),
    });
    engine.speed = 10;
    engine._isFinestTfCadenceSubStepActive = () => true;
    engine._finestTfCadenceSubdivisions = () => 60;
    engine.setStepSeconds(60);
    assert.ok(stepsPerSecond(engine.getCandlePlaybackCadence()) > 10,
        'the mutant must run faster than the ladder promised; if not, S5 proves nothing');
});

// ---------------------------------------------------------------------------
// S6 — the kill-switch. Absent means on; truthy restores one-bar steps.
// ---------------------------------------------------------------------------

test('S6 absent means the step knob is live', () => {
    const { engine } = build({ tfSeconds: 60 });
    assert.equal(engine.setStepSeconds(5), true);
    assert.equal(engine.getStepSeconds(), 5);
});

test('S6 the switch restores one-bar steps and refuses the knob', () => {
    const { engine } = build({
        tfSeconds: 60,
        flags: { __TALARIA_DISABLE_ORDER01B_STEP_V1: true },
    });
    assert.equal(engine.setStepSeconds(5), false, 'the knob must refuse while switched off');
    assert.equal(engine.getStepSeconds(), 60, 'a step is one bar again');
    assert.equal(engine._order01bHasExplicitStep(), false);
});

test('S6 the switch is read from a host realm, not only this one', () => {
    // A multichart panel runs in its own realm. A switch thrown on the host
    // that a panel cannot see is a kill-switch that kills nothing (FLAG-02).
    const host = { __TALARIA_DISABLE_ORDER01B_STEP_V1: true };
    const { engine } = build({ tfSeconds: 60 });
    // Rebuild with a panel realm whose parent carries the flag.
    const panel = {};
    panel.parent = host;
    panel.top = host;
    const scoped = Object.create(Object.getPrototypeOf(engine));
    Object.assign(scoped, engine);
    // The lifted flag reader closes over the build's `window`, so assert the
    // reader itself climbs rather than re-lifting the whole engine.
    const climb = new Function('window',
        `${balanced(src, 'function _speedGovFlagState(')}
         return _speedGovFlagState('__TALARIA_DISABLE_ORDER01B_STEP_V1', false);`);
    assert.equal(climb(panel), true, 'a panel must see a switch thrown on its host');
});

test('S6 MUTANT: defaulting the switch to on disables the shipped behaviour', () => {
    const { engine } = build({
        tfSeconds: 60,
        mutate: (s) => s.replace(
            "return !_speedGovFlagState('__TALARIA_DISABLE_ORDER01B_STEP_V1', false);",
            'return false;'),
    });
    assert.equal(engine.setStepSeconds(5), false,
        'the mutant must refuse every step; if it does not, S6 is vacuous');
});

// ---------------------------------------------------------------------------
// S7 — routing. A step under the data floor has no bar to land on.
// ---------------------------------------------------------------------------

test('S7 a step at or above the data floor is served out of data', () => {
    const { engine } = build({ tfSeconds: 3600, rawSeconds: 60 });
    engine.setStepSeconds(300);
    assert.deepEqual(engine.getStepRouting(),
        { stepSeconds: 300, dataFloorSeconds: 60, route: 'native' });
    engine.setStepSeconds(60);
    assert.equal(engine.getStepRouting().route, 'native', 'exactly at the floor is still data');
});

test('S7 a step under the data floor routes to the drawn path', () => {
    const { engine } = build({ tfSeconds: 3600, rawSeconds: 60 });
    engine.setStepSeconds(15);
    const routing = engine.getStepRouting();
    assert.equal(routing.route, 'puppet',
        'there is no 15s bar in a 1m inventory, so the step has to be drawn');
    assert.equal(routing.dataFloorSeconds, 60);
});

test('S7 MUTANT: comparing against the timeframe instead of the floor misroutes', () => {
    const { engine } = build({
        tfSeconds: 3600,
        rawSeconds: 60,
        mutate: (s) => s.replace(
            'return Number(seconds) < this.getDataFloorSeconds();',
            'return Number(seconds) < this.getChartTimeframeSeconds();'),
    });
    engine.setStepSeconds(300);
    assert.equal(engine.getStepRouting().route, 'puppet',
        'the mutant must misroute a 5m step on 1m data; if not, S7 proves nothing');
});

// ---------------------------------------------------------------------------
// S8 — mirrors. A change that reaches one copy of the engine is not shipped.
// ---------------------------------------------------------------------------

test('S8 both mirrors carry the step knob', () => {
    const mirror = readFileSync(RS_B, 'utf8');
    for (const anchor of [
        'const ORDER01B_STEP_CANDIDATE_SECONDS',
        'function _order01bStepV1Enabled(',
        'function _order01bStepLabel(',
        '\n    getOfferedStepSeconds() {',
        '\n    setStepSeconds(seconds) {',
        '\n    getMarketSecondsPerWallSecond() {',
        '\n    _order01bHasExplicitStep() {',
    ]) {
        assert.ok(mirror.includes(anchor), `mirror is missing ${anchor.trim()}`);
        assert.ok(src.includes(anchor), `canonical is missing ${anchor.trim()}`);
    }
});

test('S8 the seconds unit reaches both mirrors', () => {
    // Without it there is no way to spell a sub-minute step, and every step
    // under a minute would resolve to null and fall back to the timeframe.
    for (const [name, text] of [['canonical', src], ['mirror', readFileSync(RS_B, 'utf8')]]) {
        const body = balanced(text, '\n    timeframeToMs(tf) {');
        assert.ok(/mo\|w\|d\|h\|m\|s/.test(body), `${name} cannot parse a seconds timeframe`);
        assert.ok(body.includes("case 's': return num * 1000;"), `${name} has no seconds case`);
    }
});

// ---------------------------------------------------------------------------
// S9 — REALISTIC. Off the ladder, onto both knobs.
// ---------------------------------------------------------------------------

test('S9 the tick ladder is the same ten, with no string on it', () => {
    const { engine } = build();
    const tick = engine.getTickSpeedLadder();
    assert.deepEqual(tick, engine.getSpeedLadderBarsPerSecond());
    assert.ok(tick.every((v) => typeof v === 'number'),
        'a rung that is not a speed forces every consumer to branch on a string');
});

test('S9 the preset lands on the path that can draw it', () => {
    // One market second per wall second is a sub-bar step on every inventory
    // the product loads, and only the drawn path renders one. This is why
    // REALISTIC lived in tick mode; it still goes there, but as a consequence
    // of the step rather than as a rung the user gets demoted off.
    const { engine } = build({ tfSeconds: 60, rawSeconds: 60 });
    engine._mode = 'candle';
    assert.equal(engine.applyRealisticPreset(), true);
    assert.equal(engine.getPlaybackMode(), 'tick');
    assert.equal(engine.getMarketSecondsPerWallSecond(), 1);
});

test('S9 the preset leaves a mode that can already serve it alone', () => {
    const { engine } = build({ tfSeconds: 60, rawSeconds: 1 });
    engine._mode = 'candle';
    engine.applyRealisticPreset();
    assert.equal(engine.getPlaybackMode(), 'candle',
        'with one-second inventory the candle path steps a second at a time by itself');
    assert.equal(engine._modeSwitches, undefined, 'and nothing was switched');
});

test('S9 MUTANT: applying the preset blind strands it on the candle path', () => {
    const { engine } = build({
        tfSeconds: 60,
        rawSeconds: 60,
        mutate: (s) => s.replace(
            "if (!this.canServeStep(1) && typeof this.setPlaybackMode === 'function') {",
            'if (false) {'),
    });
    engine._mode = 'candle';
    engine.applyRealisticPreset();
    assert.equal(engine.getPlaybackMode(), 'candle',
        'the mutant must leave the user on the path that cannot draw a sub-bar step; '
        + 'if it does not, the routing cell proves nothing');
});

test('S9 the preset is one market second per wall second', () => {
    const { engine } = build({ tfSeconds: 60 });
    engine.speed = 10;
    assert.equal(engine.applyRealisticPreset(), true);
    assert.equal(engine.getTargetStepsPerWallSecond(), 1);
    assert.equal(engine.getStepSeconds(), 1);
    assert.equal(engine.getMarketSecondsPerWallSecond(), 1,
        'real time is one second of market per second of wall clock, exactly');
    assert.equal(engine.isRealisticPresetActive(), true);
});

test('S9 the preset means the same thing on any timeframe', () => {
    // As a ladder rung it could not: it existed only in tick mode, and leaving
    // tick mode had to demote the user off it.
    for (const tf of [60, 300, 3600]) {
        const { engine } = build({ tfSeconds: tf });
        engine.applyRealisticPreset();
        assert.equal(engine.getMarketSecondsPerWallSecond(), 1, `${tf}s chart`);
    }
});

test('S9 a stored REALISTIC comes back as real time, not as the number one', () => {
    // Normalising alone would leave a returning user at one bar a second —
    // sixty times faster on a 1m chart than the setting they chose.
    const { engine } = build({ tfSeconds: 60 });
    engine.speed = 10;
    assert.equal(engine.migrateStoredSpeed('REALISTIC'), 1);
    assert.equal(engine.getStepSeconds(), 1, 'the step is half of what REALISTIC meant');
    assert.equal(engine.getMarketSecondsPerWallSecond(), 1);
});

test('S9 a stored numeric speed still migrates onto a rung', () => {
    const { engine } = build({ tfSeconds: 60 });
    for (const [stored, expected] of [[60, 10], [86400, 10], [4.4, 4], [3, 3]]) {
        assert.equal(engine.migrateStoredSpeed(stored), expected);
    }
});

test('S9 MUTANT: migrating REALISTIC as a bare number loses the step', () => {
    const { engine } = build({
        tfSeconds: 60,
        mutate: (s) => s.replace('            this.applyRealisticPreset();\n', ''),
    });
    engine.migrateStoredSpeed('REALISTIC');
    assert.equal(engine.getStepSeconds(), 60,
        'the mutant must leave the step at one bar; if not, S9 proves nothing');
});

// ---------------------------------------------------------------------------
// S11 — the menu. One list, so a toolbar cannot answer differently from the
// engine that has to serve the answer.
// ---------------------------------------------------------------------------

test('S11 the menu is the offer, labelled, with the current step marked', () => {
    const { engine } = build({ tfSeconds: 300, rawSeconds: 60 });
    engine.setStepSeconds(60);
    const menu = engine.getStepMenu();
    assert.deepEqual(menu.map((e) => e.seconds), engine.getOfferedStepSeconds());
    assert.deepEqual(menu.map((e) => e.label), ['1s', '2s', '5s', '10s', '15s', '30s', '1m', '5m']);
    assert.deepEqual(menu.filter((e) => e.selected).map((e) => e.seconds), [60],
        'exactly one entry is the step being run');
});

test('S11 candle mode disables the steps it cannot draw, and says why', () => {
    const { engine } = build({ tfSeconds: 300, rawSeconds: 60 });
    engine._mode = 'candle';
    const menu = engine.getStepMenu();
    const below = menu.filter((e) => e.seconds < 60);
    assert.ok(below.length, 'the scene must contain sub-floor steps to be worth asserting');
    for (const entry of below) {
        assert.equal(entry.enabled, false, `${entry.label} has no bar to land on`);
        assert.equal(entry.route, 'puppet');
        assert.equal(entry.reason, 'below-data-floor',
            'a control that greys an option without a reason is a control that looks broken');
    }
    for (const entry of menu.filter((e) => e.seconds >= 60)) {
        assert.equal(entry.enabled, true);
        assert.equal(entry.route, 'native');
    }
});

test('S11 tick mode serves them, because the path is drawn', () => {
    const { engine } = build({ tfSeconds: 300, rawSeconds: 60 });
    engine._mode = 'tick';
    for (const entry of engine.getStepMenu()) {
        assert.equal(entry.enabled, true, `${entry.label} is drawable in tick mode`);
        assert.equal(entry.route, entry.seconds < 60 ? 'drawn' : 'native');
    }
});

test('S11 the seam flag opens sub-bar steps on the candle path', () => {
    // E owns wiring the drawn path into candle mode. When it lands, the menu
    // opens with a flag rather than a second edit to every toolbar.
    const { engine } = build({
        tfSeconds: 300,
        rawSeconds: 60,
        flags: { __TALARIA_ENABLE_ORDER01B_SUBFLOOR_CANDLE: true },
    });
    engine._mode = 'candle';
    assert.ok(engine.getStepMenu().every((e) => e.enabled));
});

test('S11 MUTANT: a menu that enables everything hides the unrenderable steps', () => {
    const { engine } = build({
        tfSeconds: 300,
        rawSeconds: 60,
        mutate: (s) => s.replace("const enabled = route !== 'puppet' || subFloorInCandle;",
            'const enabled = true;'),
    });
    engine._mode = 'candle';
    assert.ok(engine.getStepMenu().every((e) => e.enabled),
        'the mutant must offer a step candle mode cannot draw; if not, S11 proves nothing');
});

// ---------------------------------------------------------------------------
// S10 — the published rate, and the unit it is in.
// ---------------------------------------------------------------------------

/** Feed the meter market seconds at a chosen wall rate. */
function feed(engine, { amount, overMs, samples = 10, startAt = 1000 }) {
    const per = overMs / samples;
    for (let i = 1; i <= samples; i += 1) {
        engine._speedGovRecordBars(amount / samples, startAt + i * per);
    }
    return startAt + samples * per;
}

test('S10 the published rate is market seconds per wall second', () => {
    const { engine, win } = build({ tfSeconds: 60 });
    engine.speed = 10;
    // Ten steps a second of one market minute each: 600 market seconds a second.
    const now = feed(engine, { amount: 600, overMs: 1000 });
    engine._speedGovPublishEffectiveRate(now);
    assert.equal(typeof win.__talariaEffectiveRate, 'number');
    assert.ok(Math.abs(win.__talariaEffectiveRate - 600) < 30,
        `expected ~600 market s/s, got ${win.__talariaEffectiveRate}`);
    assert.equal(win.__talariaSpeedGov.unit, 'market-seconds-per-wall-second',
        'a reader that assumes bars per second would call a healthy 600 a sixtyfold overrun');
    assert.equal(win.__talariaSpeedGov.target, 600);
    assert.equal(win.__talariaSpeedGov.stepSeconds, 60);
    assert.equal(win.__talariaSpeedGov.stepsPerWallSecond, 10);
});

test('S10 target and effective are always in the same unit', () => {
    // Drift is a ratio, and a ratio between two different units is a
    // correction against nothing.
    const { engine } = build({ tfSeconds: 60 });
    engine.speed = 10;
    engine.setStepSeconds(1);
    assert.equal(engine._speedGovTargetRate(), 10);
    const now = feed(engine, { amount: 10, overMs: 1000 });
    assert.ok(Math.abs(engine.getEffectiveMarketSecondsPerWallSecond(now) - 10) < 0.6);
});

test('S10 both modes report the same target from the same rung', () => {
    const { engine } = build({ tfSeconds: 60 });
    engine.speed = 10;
    engine._mode = 'candle';
    const candle = engine.getTargetBarsPerSecond();
    engine._mode = 'tick';
    assert.equal(engine.getTargetBarsPerSecond(), candle,
        'one ladder, one meaning: the same rung meant four different things before');
});

test('S10 the switched-off path still publishes bars per second', () => {
    const { engine, win } = build({
        tfSeconds: 60,
        flags: { __TALARIA_DISABLE_ORDER01B_STEP_V1: true },
    });
    engine.speed = 10;
    const now = feed(engine, { amount: 10, overMs: 1000 });
    engine._speedGovPublishEffectiveRate(now);
    assert.equal(win.__talariaSpeedGov.unit, 'bars-per-second');
    assert.equal(win.__talariaSpeedGov.stepSeconds, null);
});

test('S10 MUTANT: publishing without the unit leaves the reader guessing', () => {
    const { engine, win } = build({
        tfSeconds: 60,
        mutate: (s) => s.replace(
            "unit: order01b ? 'market-seconds-per-wall-second' : 'bars-per-second',",
            'unit: undefined,'),
    });
    engine.speed = 10;
    engine._speedGovPublishEffectiveRate(feed(engine, { amount: 600, overMs: 1000 }));
    assert.equal(win.__talariaSpeedGov.unit, undefined,
        'the mutant must drop the unit; if not, S10 proves nothing');
});

test('S10 MUTANT: a bar-counting meter reads zero once a step is sub-bar', () => {
    // The regression this guards: with a step finer than a bar the index stops
    // moving on most steps, so an index-based meter reports a stalled replay
    // and the corrector chases a shortfall that is not there.
    const tick = src.match(/\n    _runCandlePlaybackTick\(\) \{[\s\S]*?\n    \}/);
    assert.ok(tick, 'the candle playback tick must exist');
    assert.ok(tick[0].includes('govStartTs'),
        'the tick must measure market time, not bar indices');
    assert.ok(tick[0].includes('this.getStepSeconds()'),
        'the fallback must convert bars to market time with the step');
});

test('S8 a seconds timeframe really parses', () => {
    const { engine } = build();
    assert.equal(engine.timeframeToMs('1s'), 1000);
    assert.equal(engine.timeframeToMs('30s'), 30_000);
    assert.equal(engine.timeframeToMs('1m'), 60_000);
    assert.equal(engine.timeframeToMs('1mo'), 30 * 24 * 60 * 60 * 1000,
        'adding s must not break the month alias');
});
