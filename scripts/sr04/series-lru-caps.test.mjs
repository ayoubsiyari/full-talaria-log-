/**
 * MEM-1b — LRU caps on the tick-path cache, retained masters, and per-symbol series.
 *
 * Two of the three targets were already bounded before this row. Rather than
 * re-implement them, this suite pins their bounds so the row is verifiable and a later
 * change that removes one fails here. The third — the per-timeframe execution series
 * map — was capped only on its instrument dimension, and that is what this row adds.
 *
 * The eviction policy is the load-bearing part: the reader prefers the FINEST cadence,
 * so evicting by recency could coarsen fill and SL/TP timing. R2 is the money-path cell.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const OM_A = 'chart v 1.4/chart/modules/order-manager.js';
const OM_B = 'homepage/public/chart/modules/order-manager.js';
const RS_A = 'chart v 1.4/chart/modules/replay-system.js';
const CHART_A = 'chart v 1.4/chart/chart.js';

/** Commit immediately before MEM-1b landed. */
const PRE_FIX_SHA = '13cc48890';

const om = readFileSync(OM_A, 'utf8');

/**
 * Anchor on the DEFINITION, not the call. The call site `this._cap...(perFile);` appears
 * earlier in the file, and anchoring on the bare name would brace-match from there and
 * lift nonsense — which fails as a syntax error rather than as a useful signal.
 */
const CAP_ANCHOR = '\n    _capOrderExecutionSeriesPerFile(perFile) {';

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

/** Compile the shipped cap over a fake manager, with the switch under our control. */
function build(flagValue) {
    const capConst = om.match(/const ORDER_EXECUTION_TF_CAP = \d+;/)[0];
    const reader = balanced(om, 'function _talariaDisableFlagTruthy(');
    const pred = balanced(om, 'function _seriesLruDisabled(');
    const method = balanced(om, CAP_ANCHOR);

    const win = {};
    win.parent = win;
    win.top = win;
    if (flagValue !== undefined) win.__TALARIA_SERIES_LRU_V1 = flagValue;

    const factory = new Function('window', `
        ${capConst}
        ${reader}
        ${pred}
        return { ${method}, __cap: ORDER_EXECUTION_TF_CAP };
    `);
    return factory(win);
}

/** cadence in ms for a timeframe label, matching the reader's candidate ladder. */
const TF = {
    '1m': 60_000, '2m': 120_000, '3m': 180_000, '5m': 300_000,
    '10m': 600_000, '15m': 900_000, '30m': 1_800_000, '45m': 2_700_000,
    '1h': 3_600_000, '2h': 7_200_000, '4h': 14_400_000,
};

function perFileWith(labels) {
    const m = new Map();
    for (const label of labels) m.set(label, { cadenceMs: TF[label], series: [{ t: 1 }, { t: 2 }] });
    return m;
}

const ALL = Object.keys(TF);

test('R1 the per-timeframe map is bounded', () => {
    const host = build();
    const perFile = perFileWith(ALL);
    assert.equal(perFile.size, 11, 'precondition: every candidate cadence retained');

    host._capOrderExecutionSeriesPerFile(perFile);

    assert.ok(perFile.size <= host.__cap,
        `map must be bounded at ${host.__cap}, got ${perFile.size}`);
});

test('R2 MONEY PATH: the finest cadences survive; only coarser ones are evicted', () => {
    const host = build();
    const perFile = perFileWith(ALL);

    host._capOrderExecutionSeriesPerFile(perFile);

    const kept = [...perFile.keys()];
    const expected = ALL.slice().sort((a, b) => TF[a] - TF[b]).slice(0, host.__cap);
    assert.deepEqual(kept.slice().sort((a, b) => TF[a] - TF[b]), expected,
        'the finest cadences must be the survivors — the reader takes the finest that covers the playhead');
    assert.ok(kept.includes('1m'), '1m must never be evicted; it is the finest execution feed');

    // Insertion order must not decide survival: recency-ordered input, same outcome.
    const recency = perFileWith(['4h', '2h', '1h', '30m', '15m', '5m', '1m']);
    host._capOrderExecutionSeriesPerFile(recency);
    assert.ok(recency.has('1m'), 'a least-recently-written 1m must still survive — this is not an LRU');
    assert.ok(!recency.has('4h'), 'the coarsest must go first even though it was written first');
});

test('R3 the instrument dimension keeps its existing bound', () => {
    const retain = balanced(om, '_retainCurrentOrderExecutionSeries()');
    assert.match(retain, /while \(this\._orderExecutionSeriesByFileId\.size > 8\)/,
        'the 8-instrument cap must remain');
    assert.ok(retain.includes('this._capOrderExecutionSeriesPerFile(perFile)'),
        'the new cap must actually be called on the write path — present is not bound');
});

test('R4 FLAG: truthy disables the cap; falsy keeps it', () => {
    for (const truthy of [true, 1, 'yes', {}]) {
        const host = build(truthy);
        const perFile = perFileWith(ALL);
        host._capOrderExecutionSeriesPerFile(perFile);
        assert.equal(perFile.size, 11, `truthy ${JSON.stringify(truthy)} must restore the unbounded map`);
    }
    for (const falsy of [false, 0, undefined, null, '']) {
        const host = build(falsy);
        const perFile = perFileWith(ALL);
        host._capOrderExecutionSeriesPerFile(perFile);
        assert.ok(perFile.size <= host.__cap, `falsy ${JSON.stringify(falsy)} must keep the cap on`);
    }
});

test('R5 FLAG: read per write, never sampled at construction', () => {
    const capConst = om.match(/const ORDER_EXECUTION_TF_CAP = \d+;/)[0];
    const win = {};
    win.parent = win;
    win.top = win;
    win.__TALARIA_SERIES_LRU_V1 = true;
    const host = new Function('window', `
        ${capConst}
        ${balanced(om, 'function _talariaDisableFlagTruthy(')}
        ${balanced(om, 'function _seriesLruDisabled(')}
        return { ${balanced(om, CAP_ANCHOR)}, __cap: ORDER_EXECUTION_TF_CAP };
    `)(win);

    const first = perFileWith(ALL);
    host._capOrderExecutionSeriesPerFile(first);
    assert.equal(first.size, 11, 'disabled on the first write');

    win.__TALARIA_SERIES_LRU_V1 = false;
    const second = perFileWith(ALL);
    host._capOrderExecutionSeriesPerFile(second);
    assert.ok(second.size <= host.__cap, 'a mid-session flip must take effect — not sampled once');
});

test('R6 FLAG: a switch set on the HOST reaches a panel realm', () => {
    const capConst = om.match(/const ORDER_EXECUTION_TF_CAP = \d+;/)[0];
    const top = { __TALARIA_SERIES_LRU_V1: true };
    top.parent = top;
    top.top = top;
    const panel = { parent: top, top };           // panel's own window carries no flag
    const host = new Function('window', `
        ${capConst}
        ${balanced(om, 'function _talariaDisableFlagTruthy(')}
        ${balanced(om, 'function _seriesLruDisabled(')}
        return { ${balanced(om, CAP_ANCHOR)} };
    `)(panel);

    const perFile = perFileWith(ALL);
    host._capOrderExecutionSeriesPerFile(perFile);
    assert.equal(perFile.size, 11, 'a host-set switch must disable the cap inside the panel too');
});

test('R7 the switch is not read with strict equality', () => {
    const pred = balanced(om, 'function _seriesLruDisabled(');
    assert.ok(!pred.includes('=== true'), 'strict === true would let 1 / "yes" silently fail to disable');
});

test('R8 CENSUS: the row\'s other two targets are bounded, and stay bounded', () => {
    const rs = readFileSync(RS_A, 'utf8');
    const chart = readFileSync(CHART_A, 'utf8');

    // tick-path cache
    assert.match(rs, /_tickPathCacheMaxEntries\(\)/, 'tick-path cache must keep its entry bound');
    assert.match(rs, /const max = this\._tickPathCacheMaxEntries\(\);/,
        'the bound must be consulted, not merely defined');

    // retained masters — both dimensions
    assert.match(chart, /this\._maxCachedFileIds = \d+;/, 'instrument dimension bound');
    assert.match(chart, /this\._tfDataCacheMaxPerFile = \d+;/, 'live TF dimension bound');
    assert.match(chart, /this\._btTfDataCacheMaxPerFile = \d+;/, 'backtest TF dimension bound');
    assert.match(chart, /_trimFileIdCacheLru\(cache\)/, 'the instrument-dimension trimmer must exist');
    const trimCalls = (chart.match(/this\._trimFileIdCacheLru\(/g) || []).length;
    assert.ok(trimCalls >= 4, `the trimmer must be called on the write paths, found ${trimCalls}`);
});

test('R9 GATE-01: the per-timeframe map was unbounded before this row', () => {
    const pre = execFileSync('git', ['show', `${PRE_FIX_SHA}:${OM_A}`],
        { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    assert.ok(!pre.includes('_capOrderExecutionSeriesPerFile'),
        'pre-fix source must have no per-timeframe cap, or this gate is vacuous');

    const preRetain = balanced(pre, '_retainCurrentOrderExecutionSeries()');
    assert.match(preRetain, /perFile\.set\(timeframe, \{ cadenceMs, series \}\);/,
        'pre-fix source must still write into the map');
    assert.ok(!/perFile\.size >/.test(preRetain),
        'pre-fix source must not bound the per-timeframe dimension — the defect this row fixes');
});

test('R10 both shipped copies are byte-identical', () => {
    const h = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(h(OM_A), h(OM_B), 'mirrors diverged');
});

test('R11 SCOPE STAMP', () => {
    const host = build();
    const stamp = {
        row: 'MEM-1b',
        switch: '__TALARIA_SERIES_LRU_V1 (truthy disables)',
        added: 'per-timeframe cap on _orderExecutionSeriesByFileId',
        cap: host.__cap,
        policy: 'finest cadence retained; coarsest evicted first. NOT least-recently-used.',
        alreadyBounded: {
            tickPathCache: '_tickPathCacheMaxEntries (replay-system.js)',
            retainedMasters: '_maxCachedFileIds=6, _tfDataCacheMaxPerFile=5, _btTfDataCacheMaxPerFile=8',
            instrumentDimension: '_orderExecutionSeriesByFileId capped at 8 fileIds',
        },
        moneyPath: 'YES — feeds getOrderExecutionCadenceMs, pending fills and SL/TP evaluation',
        NOT_CLAIMED: [
            'no MB figure — each entry pins a master series by reference, so the saving depends on how many distinct raw timeframes a session visits',
            'two of the three named targets were already bounded; this row pins them rather than re-implementing them',
        ],
    };
    assert.ok(stamp.cap > 0);
    console.log('MEM-1b scope stamp:', JSON.stringify(stamp, null, 2));
});
