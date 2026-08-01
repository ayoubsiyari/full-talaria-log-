/**
 * MEM-1c — pre-session residency bound.
 *
 * The host pulls ~4.0 MB of bar data at boot before a single bar is replayed, and most of
 * it sits before the session floor where replay never steps. This row trims that prefix at
 * replay entry.
 *
 * The load-bearing cells are R3/R4 (an open position's entry bar is never dropped) and R5
 * (both masters are trimmed, so this is residency rather than array slots).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const RS_A = 'chart v 1.4/chart/modules/replay-system.js';
const RS_B = 'homepage/public/chart/modules/replay-system.js';

/** Commit immediately before MEM-1c landed. */
const PRE_FIX_SHA = '0c458b1a1';

const src = readFileSync(RS_A, 'utf8');

/**
 * Anchor on definitions, never bare names: the call site `this._boundPreSessionResidency();`
 * appears elsewhere and brace-matching from there would lift nonsense.
 */
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

const BOUND = '\n    _boundPreSessionResidency() {';
const SEARCH = '\n    _lastIndexAtOrBefore(series, ts) {';
const OLDEST = '\n    _oldestOpenPositionTimestamp() {';
const WHOLE = '\n    _hasWholeHistoryIndicator() {';

const CAP = Number(src.match(/const PRESESSION_RESIDENCY_BARS = (\d+);/)[1]);

const STEP = 60_000;
const bars = (n) => Array.from({ length: n }, (_, i) => ({ t: 1_000_000 + i * STEP, c: i }));

/**
 * Build a replay engine carrying the shipped methods, over a scene we control.
 * `win` is the realm the switch is read from.
 */
function build({ total = 20_000, sessionStart = 15_000, openPositions = null, win, chart } = {}) {
    const w = win || (() => { const x = {}; x.parent = x; x.top = x; return x; })();
    const factory = new Function('window', `
        const PRESESSION_RESIDENCY_BARS = ${CAP};
        ${src.match(/const WHOLE_HISTORY_INDICATOR_TYPES = \[[^\]]*\];/)[0]}
        ${balanced(src, 'function _talariaDisableFlagTruthy(')}
        ${balanced(src, 'function _preSessionResidencyDisabled(')}
        return {
            ${balanced(src, BOUND)},
            ${balanced(src, SEARCH)},
            ${balanced(src, WHOLE)},
            ${balanced(src, OLDEST)}
        };
    `)(w);

    const master = bars(total);
    const engine = Object.create(factory);
    engine.fullRawData = master;
    engine.sessionStartIndex = sessionStart;
    engine.currentIndex = sessionStart;
    engine.chart = chart === undefined
        ? { rawData: master.slice(), dataVersion: 1, orderManager: { openPositions } }
        : chart;
    engine.__win = w;
    return engine;
}

/**
 * The whole-history indicator guard is wired into BOTH trims. EVICT-03's gate covers it on
 * the eviction path; without these cells the wiring on this path would ship untested, which
 * is exactly the shape PROC-3 exists to catch.
 */
test('R0 CORRECTNESS: the bound stands down while a whole-history indicator is active', () => {
    for (const type of ['obv', 'vwap', 'psar', 'seasonality', 'VWAP']) {
        const e = build();
        e.chart.indicators = { active: [{ type: 'ema' }, { type }] };
        const before = e.fullRawData;
        const beforeStart = e.sessionStartIndex;

        e._boundPreSessionResidency();

        assert.equal(e.fullRawData, before,
            `${type} accumulates from the start of the series — trimming changes its value`);
        assert.equal(e.sessionStartIndex, beforeStart, 'no rebase when no trim happened');
    }
});

test('R0b rolling indicators, and no registry at all, still allow the bound', () => {
    for (const active of [[], [{ type: 'ema' }], [{ type: 'rsi' }, { type: 'bb' }], [null], [{}]]) {
        const e = build();
        e.chart.indicators = { active };
        e._boundPreSessionResidency();
        assert.equal(e.sessionStartIndex, CAP,
            `${JSON.stringify(active)} needs only its period, so it must not suppress the saving`);
    }

    const bare = build();
    bare.chart.indicators = undefined;
    bare._boundPreSessionResidency();
    assert.equal(bare.sessionStartIndex, CAP, 'an absent registry must not suppress the saving');
});

test('R1 the pre-session prefix is bounded', () => {
    const e = build();
    const before = e.fullRawData.length;
    const sessionBarT = e.fullRawData[e.sessionStartIndex].t;

    e._boundPreSessionResidency();

    assert.ok(e.fullRawData.length < before, 'the master must shrink');
    assert.equal(e.sessionStartIndex, CAP,
        `exactly ${CAP} bars of warm-up must remain before the session floor`);
    assert.equal(e.fullRawData[e.sessionStartIndex].t, sessionBarT,
        'the session floor must still address the same bar');
});

test('R2 the playhead and floor are rebased, so indices still address their own bars', () => {
    const e = build({ sessionStart: 15_000 });
    e.currentIndex = 15_400;                       // playhead already past the floor
    const playheadT = e.fullRawData[e.currentIndex].t;
    const floorT = e.fullRawData[e.sessionStartIndex].t;

    e._boundPreSessionResidency();

    assert.equal(e.fullRawData[e.currentIndex].t, playheadT, 'playhead drifted onto another bar');
    assert.equal(e.fullRawData[e.sessionStartIndex].t, floorT, 'session floor drifted onto another bar');
});

test('R3 MONEY PATH: an open position entered before the bound is never dropped', () => {
    const master = bars(20_000);
    const entryIdx = 300;                          // far below sessionStart - CAP
    const e = build({
        total: 20_000,
        sessionStart: 15_000,
        openPositions: [{ openTime: master[entryIdx].t }],
    });
    const entryT = master[entryIdx].t;

    e._boundPreSessionResidency();

    assert.equal(e.fullRawData[0].t, entryT,
        'the trim floor must pin to the oldest open entry bar, not the warm-up window');
    assert.ok(e.fullRawData.some((b) => b.t === entryT), 'the entry bar must survive');
    assert.equal(e.chart.rawData[0].t, entryT, 'the chart master must be pinned identically');
});

test('R4 MONEY PATH: an unreadable open position refuses the trim outright', () => {
    for (const bad of [{ openTime: undefined }, { openTime: 'x' }, { openTime: NaN }, null]) {
        const e = build({ sessionStart: 15_000, openPositions: [bad] });
        const before = e.fullRawData.length;
        e._boundPreSessionResidency();
        assert.equal(e.fullRawData.length, before,
            `an unreadable entry (${JSON.stringify(bad)}) must abstain, never guess`);
    }
});

test('R5 both masters are trimmed, so this frees bars and not merely array slots', () => {
    const e = build();
    const beforeChart = e.chart.rawData.length;

    e._boundPreSessionResidency();

    assert.ok(e.chart.rawData.length < beforeChart,
        'chart.rawData must shrink too — otherwise the bar objects stay reachable and nothing is freed');
    assert.equal(e.chart.rawData.length, e.fullRawData.length, 'the two masters must stay in step');
    assert.equal(e.chart.rawData[0].t, e.fullRawData[0].t, 'and at the same offset');
    assert.equal(e.chart.dataVersion, 2, 'dataVersion must be bumped so derived caches rebuild');
});

test('R6 the trim abstains when the two masters are not the same content', () => {
    const e = build();
    e.chart.rawData = bars(9);                     // some other array entirely
    const before = e.fullRawData.length;

    e._boundPreSessionResidency();

    assert.equal(e.fullRawData.length, before,
        'trimming one master while the other disagrees would desynchronise indices');

    const noChart = build({ chart: null });
    const n = noChart.fullRawData.length;
    noChart._boundPreSessionResidency();
    assert.equal(noChart.fullRawData.length, n, 'no chart means no trim');
});

test('R7 the bound does nothing when there is little pre-session history', () => {
    for (const sessionStart of [0, 1, CAP - 1, CAP]) {
        const e = build({ total: CAP + 200, sessionStart });
        const before = e.fullRawData.length;
        e._boundPreSessionResidency();
        assert.equal(e.fullRawData.length, before,
            `sessionStart=${sessionStart} is within the warm-up window and must be left alone`);
    }

    // One bar past the window is the first case that trims, and it trims exactly one bar.
    const edge = build({ total: CAP + 200, sessionStart: CAP + 1 });
    const before = edge.fullRawData.length;
    edge._boundPreSessionResidency();
    assert.equal(edge.fullRawData.length, before - 1, 'the bound must retain exactly the window');
    assert.equal(edge.sessionStartIndex, CAP);
});

test('R8 FLAG: truthy disables the bound; falsy keeps it', () => {
    for (const truthy of [true, 1, 'yes', {}]) {
        const w = { __TALARIA_PRESESSION_RESIDENCY_V1: truthy };
        w.parent = w; w.top = w;
        const e = build({ win: w });
        const before = e.fullRawData.length;
        e._boundPreSessionResidency();
        assert.equal(e.fullRawData.length, before, `truthy ${JSON.stringify(truthy)} must restore the full prefix`);
    }
    for (const falsy of [false, 0, undefined, null, '']) {
        const w = { __TALARIA_PRESESSION_RESIDENCY_V1: falsy };
        w.parent = w; w.top = w;
        const e = build({ win: w });
        const before = e.fullRawData.length;
        e._boundPreSessionResidency();
        assert.ok(e.fullRawData.length < before, `falsy ${JSON.stringify(falsy)} must keep the bound on`);
    }
});

test('R9 FLAG: read per decision, never sampled once', () => {
    const w = { __TALARIA_PRESESSION_RESIDENCY_V1: true };
    w.parent = w; w.top = w;
    const e = build({ win: w });
    const before = e.fullRawData.length;
    e._boundPreSessionResidency();
    assert.equal(e.fullRawData.length, before, 'disabled on the first call');

    w.__TALARIA_PRESESSION_RESIDENCY_V1 = false;
    e._boundPreSessionResidency();
    assert.ok(e.fullRawData.length < before, 'a mid-session flip must take effect');
});

test('R10 FLAG: a switch set on the HOST reaches a panel realm', () => {
    const top = { __TALARIA_PRESESSION_RESIDENCY_V1: true };
    top.parent = top; top.top = top;
    const panel = { parent: top, top };            // the panel's own window carries no flag
    const e = build({ win: panel });
    const before = e.fullRawData.length;
    e._boundPreSessionResidency();
    assert.equal(e.fullRawData.length, before, 'a host-set switch must disable the bound inside the panel');
});

test('R11 the switch is not read with strict equality', () => {
    const pred = balanced(src, 'function _preSessionResidencyDisabled(');
    assert.ok(!pred.includes('=== true'), 'strict === true would let 1 / "yes" silently fail to disable');
});

/**
 * Locate by unique occurrence in the whole file rather than by brace-matching the
 * enclosing method: enterReplayMode is long enough to contain braces inside string
 * literals, and a naive matcher closes early there and reports a wired call as missing.
 */
function soleIndexOf(text, needle, label) {
    const first = text.indexOf(needle);
    assert.notEqual(first, -1, `anchor not found (${label}): ${needle}`);
    assert.equal(text.indexOf(needle, first + 1), -1,
        `anchor is ambiguous (${label}), ordering would prove nothing: ${needle}`);
    return first;
}

test('R12 BOUND: the entry path calls it, after the master is taken and before the stamps', () => {
    const enterAt = soleIndexOf(src, '\n    enterReplayMode(options = {}) {', 'entry point');
    const callAt = soleIndexOf(src, 'this._boundPreSessionResidency();', 'the call');

    // The copy line appears at two sites, so measure from the entry point forward.
    const copyAt = src.indexOf('this.fullRawData = [...this.chart.rawData];', enterAt);
    const stampAt = src.indexOf('this.replayStartTimestamp = this.fullRawData[0].t;', enterAt);
    assert.notEqual(copyAt, -1, 'master copy not found inside the entry point');
    assert.notEqual(stampAt, -1, 'timestamp derivation not found inside the entry point');

    assert.ok(enterAt < callAt, 'present is not bound: the call must sit inside enterReplayMode');
    assert.ok(copyAt < callAt, 'the trim must run after the master is populated');
    assert.ok(callAt < stampAt,
        'the trim must run before replayStartTimestamp is read, or the stamp names a trimmed bar');
});

test('R12b CENSUS: the second copy site is out of scope, and stated as such', () => {
    const sites = [...src.matchAll(/this\.fullRawData = \[\.\.\.this\.chart\.rawData\];/g)].map((m) => m.index);
    assert.equal(sites.length, 2,
        'a third copy site appeared; decide whether it establishes a session floor before ignoring it');

    const startAt = soleIndexOf(src, '\n    startReplayAtIndex(candleIndex) {', 'other copy site');
    const enterAt = soleIndexOf(src, '\n    enterReplayMode(options = {}) {', 'entry point');
    assert.ok(startAt < sites[0] && sites[0] < enterAt,
        'the unbound copy site must be the one inside startReplayAtIndex');

    // That path re-copies the master but never establishes a session floor, so there is no
    // floor there to bound against. It inherits whatever enterReplayMode already trimmed,
    // which stays consistent because this row trims chart.rawData and not only the copy.
    const floorWrites = [...src.matchAll(/this\.sessionStartIndex = /g)].map((m) => m.index);
    const insideStart = floorWrites.filter((i) => i > startAt && i < sites[0]);
    assert.equal(insideStart.length, 0,
        'startReplayAtIndex now sets a session floor, so it needs the bound too');
});

test('R13 GATE-01: the prefix was unbounded before this row', () => {
    const pre = execFileSync('git', ['show', `${PRE_FIX_SHA}:${RS_A}`],
        { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    assert.ok(!pre.includes('_boundPreSessionResidency'),
        'pre-fix source must have no pre-session bound, or this gate is vacuous');
    assert.ok(pre.includes('this.fullRawData = [...this.chart.rawData];'),
        'pre-fix source must still take the whole master at entry — the defect this row fixes');
    assert.ok(!pre.includes('PRESESSION_RESIDENCY_BARS'),
        'pre-fix source must carry no warm-up window constant');
});

test('R13b GATE-01: the money floor treated a hole in openPositions as epoch zero', () => {
    const pre = execFileSync('git', ['show', `${PRE_FIX_SHA}:${RS_A}`],
        { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    assert.ok(pre.includes('const t = Number(position && position.openTime);'),
        'pre-fix source must carry the coercion that made a null position a finite 0');
    assert.ok(!src.includes('const t = Number(position && position.openTime);'),
        'the shipped source must no longer coerce a hole into a timestamp');
});

test('R14 both shipped copies are byte-identical', () => {
    const h = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(h(RS_A), h(RS_B), 'mirrors diverged');
});

test('R15 SCOPE STAMP', () => {
    const e = build();
    const before = e.fullRawData.length;
    e._boundPreSessionResidency();
    const dropped = before - e.fullRawData.length;

    const stamp = {
        row: 'MEM-1c',
        switch: '__TALARIA_PRESESSION_RESIDENCY_V1 (truthy disables)',
        warmupRetained: CAP,
        scene: `${before} bars, session floor at 15000`,
        barsDropped: dropped,
        trims: ['replaySystem.fullRawData', 'chart.rawData'],
        moneyFloor: 'oldest open position entry bar; unreadable entry abstains',
        reversible: 'panning left refetches, same as EVICT-03',
        NOT_CLAIMED: [
            'no MB figure at boot — this bounds what is RETAINED after entry, it does not shrink the two boot requests C measured (2,344 KB tile + 1,678 KB smart fetch). Reducing the fetch itself is a separate row.',
            'chart.data is not trimmed here; it rebuilds from the shorter master via the dataVersion bump',
        ],
    };
    assert.ok(stamp.barsDropped > 0);
    console.log('MEM-1c scope stamp:', JSON.stringify(stamp, null, 2));
});
