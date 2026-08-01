/**
 * MEM-1a / EVICT-03 — bars behind the playhead are evicted, reversibly, keyed to the
 * playhead, without moving a bar that an open position still needs.
 *
 * Every cell runs the SHIPPED text: the constants, the flag predicate and both methods
 * are lifted out of replay-system.js by anchor and brace-matched, never re-typed here.
 * A cell that passes against a paraphrase of the fix proves nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const A = 'chart v 1.4/chart/modules/replay-system.js';
const B = 'homepage/public/chart/modules/replay-system.js';

/** Commit immediately before MEM-1a landed. GATE-01 must keep witnessing the defect
 *  after the fix commits, so this is pinned rather than HEAD-relative. */
const PRE_FIX_SHA = '4b18f2e6d';

const src = readFileSync(A, 'utf8');

/** Lift `anchor` plus its brace-balanced body out of `text`. */
function balanced(text, anchor) {
    const at = text.indexOf(anchor);
    assert.notEqual(at, -1, `anchor not found: ${anchor}`);
    const open = text.indexOf('{', at);
    assert.notEqual(open, -1, `no brace after anchor: ${anchor}`);
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
            depth -= 1;
            if (depth === 0) return text.slice(at, i + 1);
        }
    }
    throw new Error(`unbalanced: ${anchor}`);
}

function lineOf(text, needle) {
    const at = text.indexOf(needle);
    return at === -1 ? null : text.slice(0, at).split('\n').length;
}

/** Build the shipped methods over a fake replay system, with the flag under our control. */
function build(flags = {}) {
    const contextConst = src.match(/const EVICT_CONTEXT_BARS = \d+;/)[0];
    const slackConst = src.match(/const EVICT_SLACK_BARS = \d+;/)[0];
    const pred = balanced(src, 'function _evictBehindPlayheadDisabled(');
    const oldest = balanced(src, '_oldestOpenPositionTimestamp()');
    const evict = balanced(src, '_evictBehindPlayhead()');

    const reads = [];
    const truthy = (name) => {
        reads.push(name);
        return Boolean(flags[name]);
    };

    const factory = new Function('_talariaDisableFlagTruthy', `
        ${contextConst}
        ${slackConst}
        ${pred}
        return {
            ${oldest},
            ${evict},
            __contextBars: EVICT_CONTEXT_BARS,
            __slackBars: EVICT_SLACK_BARS,
        };
    `);
    return { proto: factory(truthy), reads };
}

function bars(n, startT = 1_000_000) {
    const out = new Array(n);
    for (let i = 0; i < n; i += 1) out[i] = { t: startT + i * 60_000, c: i };
    return out;
}

/** A replay system carrying only what the shipped methods touch. */
function makeRs(proto, { count, playhead, open = [], sessionStartIndex = 0 }) {
    const rs = Object.create(proto);
    rs.fullRawData = bars(count);
    rs.currentIndex = playhead;
    rs.sessionStartIndex = sessionStartIndex;
    rs.chart = { orderManager: { openPositions: open } };
    return rs;
}

test('R1 bars behind the playhead are evicted once the prefix is worth trimming', () => {
    const { proto } = build();
    const ctx = proto.__contextBars;
    const rs = makeRs(proto, { count: 60_000, playhead: 50_000 });

    rs._evictBehindPlayhead();

    assert.ok(rs.fullRawData.length < 60_000, 'master must shrink');
    const behind = rs.currentIndex;
    assert.equal(behind, ctx, `exactly the context window is retained behind the playhead, got ${behind}`);
    const ahead = rs.fullRawData.length - 1 - rs.currentIndex;
    assert.equal(ahead, 60_000 - 1 - 50_000, 'nothing ahead of the playhead is touched');
});

test('R2 AMORTISED: no allocation while the evictable prefix is under the slack', () => {
    const { proto } = build();
    const ctx = proto.__contextBars;
    const slack = proto.__slackBars;
    // Playhead sits so the evictable prefix is one bar short of the slack threshold.
    const playhead = ctx + slack - 1;
    const rs = makeRs(proto, { count: playhead + 100, playhead });
    const before = rs.fullRawData;

    rs._evictBehindPlayhead();

    assert.equal(rs.fullRawData, before, 'array identity must be unchanged — no trim, no allocation');
    assert.equal(rs.currentIndex, playhead, 'playhead untouched when nothing is evicted');
});

test('R3 the playhead is rebased exactly; session start rebases or clamps, never goes negative', () => {
    // Case A — session start survives the trim, so it must resolve to the identical bar.
    const a = build().proto;
    const rsA = makeRs(a, { count: 60_000, playhead: 50_000, sessionStartIndex: 47_000 });
    const playheadBarA = rsA.fullRawData[50_000];
    const sessionBarA = rsA.fullRawData[47_000];

    rsA._evictBehindPlayhead();

    assert.equal(rsA.fullRawData[rsA.currentIndex], playheadBarA,
        'currentIndex must still resolve to the identical bar object');
    assert.equal(rsA.fullRawData[rsA.sessionStartIndex], sessionBarA,
        'a surviving session start must rebase to the identical bar object');

    // Case B — the session began further back than we retain. It cannot address an
    // evicted bar, so it clamps to the earliest retained bar rather than going negative.
    const b = build().proto;
    const rsB = makeRs(b, { count: 60_000, playhead: 50_000, sessionStartIndex: 40_000 });
    const playheadBarB = rsB.fullRawData[50_000];

    rsB._evictBehindPlayhead();

    assert.equal(rsB.fullRawData[rsB.currentIndex], playheadBarB, 'playhead still exact');
    assert.equal(rsB.sessionStartIndex, 0, 'an evicted session start clamps to the earliest retained bar');
    assert.ok(rsB.sessionStartIndex >= 0, 'never negative — a negative index would silently read undefined');
});

test('R4 MONEY PATH: an open position entry bar is never evicted', () => {
    const { proto } = build();
    const all = bars(60_000);
    const entryBar = all[1_000];               // far behind the context window
    const rs = makeRs(proto, { count: 60_000, playhead: 50_000, open: [{ openTime: entryBar.t }] });
    const entryT = entryBar.t;

    rs._evictBehindPlayhead();

    const first = rs.fullRawData[0];
    assert.ok(Number(first.t) <= entryT,
        `floor must not advance past the oldest open entry (kept from ${first.t}, entry at ${entryT})`);
    assert.ok(rs.fullRawData.some((b) => b.t === entryT), 'the entry bar itself must still be resident');
    assert.equal(rs.fullRawData[rs.currentIndex].t, all[50_000].t, 'playhead still correct after a clamped trim');
});

test('R5 MONEY PATH: an open position with an unreadable entry blocks eviction entirely', () => {
    const { proto } = build();
    const rs = makeRs(proto, { count: 60_000, playhead: 50_000, open: [{ openTime: undefined }] });
    const before = rs.fullRawData;

    rs._evictBehindPlayhead();

    assert.equal(rs.fullRawData, before,
        'an entry we cannot read is not evidence that eviction is safe — it must block the trim');
});

test('R6 with no open positions the floor is the context window alone', () => {
    const { proto } = build();
    const ctx = proto.__contextBars;
    const rs = makeRs(proto, { count: 60_000, playhead: 50_000, open: [] });

    rs._evictBehindPlayhead();

    assert.equal(rs.currentIndex, ctx, 'no position, no clamp');
});

test('R7 FLAG: truthy disables and restores full residency; falsy keeps the fix', () => {
    const off = build({ __TALARIA_EVICT_BEHIND_PLAYHEAD_V1: true });
    const rsOff = makeRs(off.proto, { count: 60_000, playhead: 50_000 });
    const beforeOff = rsOff.fullRawData;
    rsOff._evictBehindPlayhead();
    assert.equal(rsOff.fullRawData, beforeOff, 'truthy switch must restore legacy residency');

    for (const falsy of [false, 0, undefined, null, '']) {
        const on = build({ __TALARIA_EVICT_BEHIND_PLAYHEAD_V1: falsy });
        const rsOn = makeRs(on.proto, { count: 60_000, playhead: 50_000 });
        rsOn._evictBehindPlayhead();
        assert.ok(rsOn.fullRawData.length < 60_000, `falsy ${JSON.stringify(falsy)} must keep the fix on`);
    }
});

test('R8 FLAG: read per eviction, never sampled at construction', () => {
    let disabled = true;
    const reads = [];
    const contextConst = src.match(/const EVICT_CONTEXT_BARS = \d+;/)[0];
    const slackConst = src.match(/const EVICT_SLACK_BARS = \d+;/)[0];
    const factory = new Function('_talariaDisableFlagTruthy', `
        ${contextConst}
        ${slackConst}
        ${balanced(src, 'function _evictBehindPlayheadDisabled(')}
        return { ${balanced(src, '_oldestOpenPositionTimestamp()')}, ${balanced(src, '_evictBehindPlayhead()')} };
    `);
    const proto = factory((name) => { reads.push(name); return disabled; });

    const rs1 = makeRs(proto, { count: 60_000, playhead: 50_000 });
    rs1._evictBehindPlayhead();
    assert.equal(rs1.fullRawData.length, 60_000, 'disabled at first call');

    disabled = false;
    const rs2 = makeRs(proto, { count: 60_000, playhead: 50_000 });
    rs2._evictBehindPlayhead();
    assert.ok(rs2.fullRawData.length < 60_000, 'a mid-session flip must take effect — not sampled once');
    assert.ok(reads.length >= 2, 'the switch is consulted on each eviction decision');
});

test('R9 GATE-01: the unmodified source does not evict on the advance path', () => {
    const head = execFileSync('git', ['show', `${PRE_FIX_SHA}:${A}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    assert.ok(!head.includes('_evictBehindPlayhead'),
        'pre-fix source must have no eviction — otherwise this gate is vacuous');
    assert.ok(head.includes('_advanceReplayPlayheadOneStep'),
        'the advance path itself must already exist at the pinned sha');

    // and the shipped source must call it FROM that path, not merely define it
    const advance = balanced(src, '_advanceReplayPlayheadOneStep()');
    const calls = (advance.match(/this\._evictBehindPlayhead\(\)/g) || []).length;
    assert.equal(calls, 2, 'both exit paths of the advance must evict, got ' + calls);
});

test('R10 both shipped copies are byte-identical', () => {
    const h = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
    assert.equal(h(A), h(B), 'mirrors diverged');
});

test('R11 the switch is not read with strict equality', () => {
    const pred = balanced(src, 'function _evictBehindPlayheadDisabled(');
    assert.ok(!pred.includes('=== true'), 'strict === true would let 1 / "yes" silently fail to disable');
    assert.ok(pred.includes('_talariaDisableFlagTruthy'), 'must use the shared realm-climbing reader');
});

test('R12 SCOPE STAMP: what this row does and does not claim', () => {
    const { proto } = build();
    const stamp = {
        row: 'MEM-1a / EVICT-03',
        switch: '__TALARIA_EVICT_BEHIND_PLAYHEAD_V1 (truthy disables)',
        contextBarsRetained: proto.__contextBars,
        slackBars: proto.__slackBars,
        rebasedIndices: ['currentIndex', 'sessionStartIndex'],
        moneyPathFloor: 'oldest openPositions[].openTime; unreadable entry blocks eviction',
        reversible: 'panning back refetches via checkViewportLoadMore',
        callSites: `replay-system.js _advanceReplayPlayheadOneStep, both exits (defined near line ${lineOf(src, '_evictBehindPlayhead() {')})`,
        NOT_CLAIMED: [
            'no MB figure is claimed here — this is an engine-level oracle, not a heap measurement',
            'trade markers for closed trades outside the retained window need a pan-back refetch to redraw',
        ],
    };
    assert.ok(stamp.contextBarsRetained >= 500, 'context window must cover indicator warm-up');
    assert.ok(stamp.slackBars > 0, 'eviction must be amortised');
    console.log('MEM-1a scope stamp:', JSON.stringify(stamp, null, 2));
});
