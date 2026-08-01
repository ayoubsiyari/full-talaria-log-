/**
 * MEM-1d — remove the redundant entry-time display-series copy.
 *
 * This is a removal, so the suite's first job is to keep the audit honest: R1 re-runs the
 * consumer scan against the live tree rather than trusting the markdown, and fails if a
 * product reader ever appears. R7 pins the copies this row deliberately did NOT remove.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const RS_A = 'chart v 1.4/chart/modules/replay-system.js';
const RS_B = 'homepage/public/chart/modules/replay-system.js';
const AUDIT = 'docs/plan3/MEM-1d-consumer-audit.md';

/** Commit immediately before MEM-1d landed. */
const PRE_FIX_SHA = 'ca5b82b7b';

const src = readFileSync(RS_A, 'utf8');

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

const SEED = '\n    _seedFullDataSnapshot() {';

function build(win) {
    const w = win || (() => { const x = {}; x.parent = x; x.top = x; return x; })();
    const host = new Function('window', `
        ${balanced(src, 'function _talariaDisableFlagTruthy(')}
        ${balanced(src, 'function _seriesDedupeDisabled(')}
        return { ${balanced(src, SEED)} };
    `)(w);
    const engine = Object.create(host);
    engine.chart = { data: [{ t: 1 }, { t: 2 }, { t: 3 }] };
    return engine;
}

/** Walk the product tree, skipping tests, harnesses, probes and vendored code. */
function productFiles() {
    const roots = ['chart v 1.4/chart', 'homepage/public/chart'];
    const out = [];
    const walk = (dir) => {
        let entries;
        try { entries = readdirSync(dir); } catch { return; }
        for (const name of entries) {
            const p = join(dir, name);
            if (/node_modules|\.git|\.ckpt|harness|multichart-prod|tests?$/i.test(p)) continue;
            const st = statSync(p);
            if (st.isDirectory()) walk(p);
            else if (/\.(js|mjs)$/.test(name) && !/\.test\.mjs$/.test(name)) out.push(p);
        }
    };
    roots.forEach(walk);
    return out;
}

test('R1 AUDIT: fullData still has no product reader', () => {
    const files = productFiles();
    assert.ok(files.length >= 2, `product scan found only ${files.length} files; the walk is broken`);

    const readers = [];
    for (const f of files) {
        const text = readFileSync(f, 'utf8');
        const lines = text.split('\n');
        lines.forEach((line, i) => {
            if (!line.includes('fullData')) return;
            // Skip comment-only lines. Narrow on purpose: a line with code before a
            // trailing comment is still scanned, so a real read cannot hide behind one.
            if (/^\s*(\*|\/\/|\/\*)/.test(line)) return;
            // A write is `<something>.fullData =` (but not `==`). Anything else is a read.
            if (/\bfullData\s*=[^=]/.test(line)) return;
            readers.push(`${f}:${i + 1}  ${line.trim()}`);
        });
    }

    assert.deepEqual(readers, [],
        `a product reader of fullData appeared — the removal's premise is void:\n${readers.join('\n')}`);

    // Positive control: a scan that finds nothing because it detects nothing proves nothing.
    const detect = (line) => !/^\s*(\*|\/\/|\/\*)/.test(line) && /fullData/.test(line)
        && !/\bfullData\s*=[^=]/.test(line);
    assert.ok(detect('        const n = replay.fullData.length;'), 'scanner misses a plain read');
    assert.ok(detect('        if (this.fullData) paint(this.fullData);'), 'scanner misses a guarded read');
    assert.ok(detect('        return rs.fullData; // trailing comment'), 'scanner misses a read before a comment');
    assert.ok(!detect('        this.fullData = null;'), 'scanner miscounts a write as a read');
    assert.ok(!detect('     * fullData has no product reader'), 'scanner miscounts prose as a read');

    // And the walk must actually reach the file this row edited.
    assert.ok(files.some((f) => f.replace(/\\/g, '/').endsWith('modules/replay-system.js')),
        'the walk never reached replay-system.js, so a clean result means nothing');
});

test('R2 the entry-time copy is gone from both replay entry points', () => {
    assert.ok(!src.includes('this.fullData = [...this.chart.data];'),
        'the entry-time copy must not survive');
    const seeds = (src.match(/this\._seedFullDataSnapshot\(\);/g) || []).length;
    assert.equal(seeds, 2, `both entry points must seed through the helper, found ${seeds}`);
});

test('R3 BOUND: both call sites sit inside the two replay entry points', () => {
    const startAt = src.indexOf('\n    startReplayAtIndex(candleIndex) {');
    const enterAt = src.indexOf('\n    enterReplayMode(options = {}) {');
    assert.ok(startAt !== -1 && enterAt !== -1, 'entry point anchors moved');

    const calls = [...src.matchAll(/this\._seedFullDataSnapshot\(\);/g)].map((m) => m.index);
    assert.equal(calls.length, 2);
    assert.ok(calls[0] > startAt && calls[0] < enterAt, 'first call must be in startReplayAtIndex');
    assert.ok(calls[1] > enterAt, 'second call must be in enterReplayMode');
});

test('R4 the field is nulled, never left stale from a previous session', () => {
    const e = build();
    e.fullData = [{ t: 999 }];                      // a snapshot from a previous session
    e._seedFullDataSnapshot();
    assert.equal(e.fullData, null,
        'a surviving stale snapshot would read as current — worse than the copy this row removes');
});

test('R5 no array is allocated when the dedupe is on', () => {
    const e = build();
    let spread = 0;
    e.chart.data = new Proxy([{ t: 1 }, { t: 2 }], {
        get(target, prop, recv) {
            if (prop === Symbol.iterator || prop === 'length') spread += 1;
            return Reflect.get(target, prop, recv);
        },
    });
    e._seedFullDataSnapshot();
    assert.equal(spread, 0, 'the display series must not be walked at all');
    assert.equal(e.fullData, null);
});

test('R6 FLAG: truthy restores the copy; falsy keeps the removal', () => {
    for (const truthy of [true, 1, 'yes', {}]) {
        const w = { __TALARIA_SERIES_DEDUPE_V1: truthy };
        w.parent = w; w.top = w;
        const e = build(w);
        e._seedFullDataSnapshot();
        assert.ok(Array.isArray(e.fullData),
            `truthy ${JSON.stringify(truthy)} must restore the entry-time copy`);
        assert.equal(e.fullData.length, 3, 'and it must be the whole display series');
        assert.notEqual(e.fullData, e.chart.data, 'restored behaviour must copy, not alias');
    }
    for (const falsy of [false, 0, undefined, null, '']) {
        const w = { __TALARIA_SERIES_DEDUPE_V1: falsy };
        w.parent = w; w.top = w;
        const e = build(w);
        e._seedFullDataSnapshot();
        assert.equal(e.fullData, null, `falsy ${JSON.stringify(falsy)} must keep the removal`);
    }
});

test('R6b FLAG: read per call, and reaches a panel from the host realm', () => {
    const w = { __TALARIA_SERIES_DEDUPE_V1: true };
    w.parent = w; w.top = w;
    const e = build(w);
    e._seedFullDataSnapshot();
    assert.ok(Array.isArray(e.fullData), 'disabled on the first call');
    w.__TALARIA_SERIES_DEDUPE_V1 = false;
    e._seedFullDataSnapshot();
    assert.equal(e.fullData, null, 'a mid-session flip must take effect');

    const top = { __TALARIA_SERIES_DEDUPE_V1: true };
    top.parent = top; top.top = top;
    const panel = build({ parent: top, top });
    panel._seedFullDataSnapshot();
    assert.ok(Array.isArray(panel.fullData), 'a host-set switch must reach the panel realm');

    const pred = balanced(src, 'function _seriesDedupeDisabled(');
    assert.ok(!pred.includes('=== true'), 'strict === true would let 1 / "yes" fail to disable');
});

test('R7 the copies this row did NOT remove are still in place', () => {
    // Pinned by replay-reseed-incremental.test.mjs, which mutates these exact lines.
    // Removing them would silently convert another manager's suite into a no-op.
    const chart = readFileSync('chart v 1.4/chart/chart.js', 'utf8');
    const reseeds = (chart.match(/replay\.fullData = Array\.isArray\(this\.data\) \? \[\.\.\.this\.data\] : null;/g) || []).length;
    assert.equal(reseeds, 2, 'the two reseed copies must remain — they are another suite\'s mutation targets');
    assert.ok(chart.includes('replay.fullData = Array.isArray(this.data) ? this.data : null;'),
        'the by-reference reseed site must remain');

    // Teardown suites assert the field exists and reaches null.
    assert.ok(src.includes('instance.fullData = null;'), 'the release null-out must remain');
    assert.ok(src.includes('this.fullData = null;'), 'the constructor initialiser must remain');
});

test('R8 the audit document exists and matches what shipped', () => {
    const audit = readFileSync(AUDIT, 'utf8');
    assert.match(audit, /Product readers found: zero/, 'the audit must state the finding');
    assert.match(audit, /startReplayAtIndex/, 'the audit must name the removed sites');
    assert.match(audit, /enterReplayMode/, 'the audit must name the removed sites');
    assert.match(audit, /replay-reseed-incremental/, 'the audit must name what was left alone and why');
    assert.match(audit, /references to bars/,
        'the audit must not let this row be credited with bar savings it does not deliver');
});

test('R9 GATE-01: the entry-time copy was present before this row', () => {
    const pre = execFileSync('git', ['show', `${PRE_FIX_SHA}:${RS_A}`],
        { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const copies = (pre.match(/this\.fullData = \[\.\.\.this\.chart\.data\];/g) || []).length;
    assert.equal(copies, 2, 'pre-fix source must carry both entry-time copies, or this gate is vacuous');
    assert.ok(!pre.includes('_seedFullDataSnapshot'), 'pre-fix source must have no seeder');
});

test('R10 both shipped copies are byte-identical', () => {
    const h = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(h(RS_A), h(RS_B), 'mirrors diverged');
});

test('R11 SCOPE STAMP', () => {
    const stamp = {
        row: 'MEM-1d',
        switch: '__TALARIA_SERIES_DEDUPE_V1 (truthy disables)',
        audit: AUDIT,
        productReaders: 0,
        removed: [
            'replay-system.js startReplayAtIndex — entry-time [...chart.data]',
            'replay-system.js enterReplayMode — entry-time [...chart.data]',
        ],
        keptDeliberately: [
            'chart.js reseed copies x3 — mutation targets of replay-reseed-incremental.test.mjs',
            'null initialisers and release null-outs — asserted by two teardown suites',
        ],
        NOT_CLAIMED: [
            'this removes references to bars, not bars: the objects stay alive through chart.data, so the saving is pointers (order of 1 MB at 62,650 bars), not the 24 MB per thousand that tracks resident bars',
            'MEM-1c is the row that moves the residency number, not this one',
        ],
    };
    assert.equal(stamp.productReaders, 0);
    console.log('MEM-1d scope stamp:', JSON.stringify(stamp, null, 2));
});
