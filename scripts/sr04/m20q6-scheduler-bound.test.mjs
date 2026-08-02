/**
 * QW-3 / M20-Q6 — the scheduler registry is bounded by live timers, not by session length.
 *
 * Allocation sampling on the sealed candidate put the M20-Q6 capture machinery at
 * roughly 40% of everything allocated during a governed replay, the largest single
 * consumer and larger than any product code. `m20Q6TrackScheduler` was pushing an
 * entry plus a label string for every timer the session ever scheduled and never
 * removing any of them, so the array grew without bound and the clear path rescanned
 * all of it on every clear.
 *
 * The load-bearing correctness property is that a *pending* entry must survive. The
 * registry exists so teardown can cancel timers that are still live; releasing one of
 * those early would leak a timer past destroy. R3 and R6 are the cells that matter.
 *
 * Every cell runs against the shipped source, lifted by anchor, with the kill-switch
 * under test control. C-SELF mutates the shipped release in memory and proves this
 * suite reports the defect, so a future inert fix cannot pass here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const RS_A = 'chart v 1.4/chart/modules/replay-system.js';
const RS_B = 'homepage/public/chart/modules/replay-system.js';

/** Commit immediately before the registry bound landed. */
const PRE_FIX_SHA = '189a360ec';

const rs = readFileSync(RS_A, 'utf8');

function balanced(text, anchor) {
    const at = text.indexOf(anchor);
    assert.notEqual(at, -1, `anchor not found: ${anchor}`);
    assert.equal(
        text.indexOf(anchor, at + 1), -1,
        `anchor is ambiguous, refusing to guess: ${anchor}`,
    );
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

/**
 * Compile the shipped registry over a fake scope.
 *
 * The capture machinery is deliberately stubbed: this suite grades the registry,
 * and dragging in the patch/restore path would make a registry regression
 * indistinguishable from a capture regression.
 */
function build({ disable, mutate } = {}) {
    const cap = rs.match(/const M20Q6_SCHEDULER_POOL_CAP = \d+;/)[0];
    const reader = balanced(rs, 'function _talariaDisableFlagTruthy(');
    const pred = balanced(rs, 'function _m20Q6SchedulerPoolV1Enabled(');
    const label = balanced(rs, '\n    function m20Q6SchedulerLabel(');
    let release = balanced(rs, '\n    function m20Q6ReleaseScheduler(');
    const track = balanced(rs, '\n    function m20Q6TrackScheduler(');
    const patch = balanced(rs, '\n    function m20Q6PatchSchedulers(');
    if (mutate === 'release-inert') {
        release = '\n    function m20Q6ReleaseScheduler(state, entry) { return; }';
    }

    const win = {};
    win.parent = win;
    win.top = win;
    if (disable !== undefined) win.__TALARIA_DISABLE_M20Q6_POOL_V1 = disable;

    const factory = new Function('window', `
        ${cap}
        ${reader}
        ${pred}
        function m20Q6CaptureEffects(state, fn) { return fn(); }
        ${label}
        ${release}
        ${track}
        ${patch}
        return {
            m20Q6TrackScheduler,
            m20Q6PatchSchedulers,
            m20Q6SchedulerLabel,
            m20Q6ReleaseScheduler,
            CAP: M20Q6_SCHEDULER_POOL_CAP,
        };
    `);
    return factory(win);
}

function makeState() {
    return {
        instance: {},
        acceptCallbacks: true,
        captureDepth: 0,
        schedulers: [],
        schedulerSerial: 0,
        schedulerPool: [],
    };
}

function makeSession() {
    return { records: [], targets: new WeakSet(), schedulerScopes: new WeakSet() };
}

/** A scope whose timers only run when the test says so. */
function makeScope() {
    let next = 1;
    const live = new Map();
    const scope = {
        setTimeout(fn) { const h = next++; live.set(h, { fn, kind: 'timeout' }); return h; },
        clearTimeout(h) { live.delete(h); },
        setInterval(fn) { const h = next++; live.set(h, { fn, kind: 'interval' }); return h; },
        clearInterval(h) { live.delete(h); },
        requestAnimationFrame(fn) { const h = next++; live.set(h, { fn, kind: 'raf' }); return h; },
        cancelAnimationFrame(h) { live.delete(h); },
        queueMicrotask(fn) { const h = next++; live.set(h, { fn, kind: 'microtask' }); return h; },
    };
    scope.__fire = (h) => {
        const t = live.get(h);
        if (!t) return false;
        if (t.kind !== 'interval') live.delete(h);
        t.fn();
        return true;
    };
    scope.__liveCount = () => live.size;
    return scope;
}

function armed(opts) {
    const api = build(opts);
    const state = makeState();
    const scope = makeScope();
    api.m20Q6PatchSchedulers(state, scope, makeSession());
    return { api, state, scope };
}

test('R1 a fired one-shot leaves nothing behind, so the registry tracks live timers only', () => {
    const { state, scope } = armed();
    const handles = [];
    for (let i = 0; i < 500; i += 1) handles.push(scope.setTimeout(() => {}, 0));
    assert.equal(state.schedulers.length, 500, 'all 500 are live before firing');
    for (const h of handles) scope.__fire(h);
    assert.equal(
        state.schedulers.length, 0,
        'every timer fired, so the registry should be empty rather than holding 500 corpses',
    );
});

test('R2 the kill-switch restores the unbounded registry', () => {
    const { state, scope } = armed({ disable: '1' });
    const handles = [];
    for (let i = 0; i < 500; i += 1) handles.push(scope.setTimeout(() => {}, 0));
    for (const h of handles) scope.__fire(h);
    assert.equal(
        state.schedulers.length, 500,
        'with the switch thrown the legacy growth must come back, or the switch is decorative',
    );
    assert.equal(state.schedulers.every((e) => e.pending === false), true);
});

test('R3 a repeating timer stays pending and drainable across many firings', () => {
    const { state, scope } = armed();
    const h = scope.setInterval(() => {}, 10);
    for (let i = 0; i < 50; i += 1) scope.__fire(h);
    assert.equal(state.schedulers.length, 1, 'an interval is one entry no matter how often it fires');
    assert.equal(state.schedulers[0].pending, true, 'a live interval must remain pending for teardown');
    assert.equal(state.schedulers[0].handle, h);
});

test('R4 clearing a pending timer settles and releases it', () => {
    const { state, scope } = armed();
    const h = scope.setTimeout(() => {}, 10);
    assert.equal(state.schedulers.length, 1);
    scope.clearTimeout(h);
    assert.equal(state.schedulers.length, 0, 'a cleared timer is settled and must not be retained');
    assert.equal(scope.__liveCount(), 0, 'and the underlying timer is genuinely cancelled');
});

test('R5 released entries are reused rather than reallocated', () => {
    const { state, scope } = armed();
    const h1 = scope.setTimeout(() => {}, 0);
    const first = state.schedulers[0];
    scope.__fire(h1);
    assert.equal(state.schedulerPool.length, 1, 'the settled entry went to the pool');
    scope.setTimeout(() => {}, 0);
    assert.equal(
        state.schedulers[0], first,
        'the next timer should reuse the pooled entry; a fresh object means the pool is inert',
    );
    assert.equal(state.schedulerPool.length, 0);
});

test('R6 a released entry pins neither its scope, its handle, nor its clear function', () => {
    const { state, scope } = armed();
    const h = scope.setTimeout(() => {}, 0);
    const entry = state.schedulers[0];
    scope.__fire(h);
    assert.equal(entry.scope, null, 'a pooled entry holding its scope would pin the window');
    assert.equal(entry.handle, null);
    assert.equal(entry.clear, null);
    assert.equal(entry.slot, -1);
});

test('R7 labels survive: legacy verbatim when unpooled, unique and monotonic when pooled', () => {
    const legacy = armed({ disable: '1' });
    legacy.scope.setTimeout(() => {}, 0);
    legacy.scope.setTimeout(() => {}, 0);
    assert.equal(legacy.api.m20Q6SchedulerLabel(legacy.state.schedulers[0]), 'timeout:0');
    assert.equal(legacy.api.m20Q6SchedulerLabel(legacy.state.schedulers[1]), 'timeout:1');

    const pooled = armed();
    const seen = new Set();
    for (let i = 0; i < 20; i += 1) {
        const h = pooled.scope.setTimeout(() => {}, 0);
        seen.add(pooled.api.m20Q6SchedulerLabel(pooled.state.schedulers.at(-1)));
        pooled.scope.__fire(h);
    }
    assert.equal(seen.size, 20, 'reused entries must not collide onto one label');
    assert.equal(seen.has('timeout:19'), true, 'the serial keeps counting past the array length');
});

test('R8 swap-removal leaves every survivor addressable by its own slot', () => {
    const { state, scope } = armed();
    const handles = [];
    for (let i = 0; i < 40; i += 1) handles.push(scope.setTimeout(() => {}, 0));
    // Fire a scattered subset so removals happen from the middle, not the tail.
    for (const h of [handles[0], handles[7], handles[8], handles[20], handles[39]]) scope.__fire(h);
    assert.equal(state.schedulers.length, 35);
    state.schedulers.forEach((entry, i) => {
        assert.equal(entry.slot, i, `entry at ${i} carries a stale slot, so its later release would corrupt the array`);
        assert.equal(entry.pending, true);
    });
});

test('R9 the pool itself is bounded, so it cannot become the leak it replaces', () => {
    const { api, state, scope } = armed();
    const handles = [];
    for (let i = 0; i < api.CAP + 50; i += 1) handles.push(scope.setTimeout(() => {}, 0));
    for (const h of handles) scope.__fire(h);
    assert.equal(state.schedulers.length, 0);
    assert.equal(state.schedulerPool.length, api.CAP, 'the pool must cap, not grow');
});

test('R10 clearing an unknown handle changes nothing', () => {
    const { state, scope } = armed();
    scope.setTimeout(() => {}, 0);
    scope.setTimeout(() => {}, 0);
    const before = state.schedulers.map((e) => e.serial);
    scope.clearTimeout(987654);
    assert.deepEqual(state.schedulers.map((e) => e.serial), before);
    assert.equal(state.schedulers.length, 2);
});

test('R11 clearing the wrong kind does not settle a live timer of another kind', () => {
    const { state, scope } = armed();
    const t = scope.setTimeout(() => {}, 0);
    // A raf handle that happens to collide with the timeout handle is exactly the
    // case the scope+kind match exists to reject.
    scope.cancelAnimationFrame(t);
    assert.equal(state.schedulers.length, 1, 'the timeout must survive a raf cancel of the same number');
    assert.equal(state.schedulers[0].pending, true);
});

test('C-SELF an inert release is reported by this suite, so the gate discriminates', () => {
    const api = build({ mutate: 'release-inert' });
    const state = makeState();
    const scope = makeScope();
    api.m20Q6PatchSchedulers(state, scope, makeSession());
    const handles = [];
    for (let i = 0; i < 100; i += 1) handles.push(scope.setTimeout(() => {}, 0));
    for (const h of handles) scope.__fire(h);
    assert.equal(
        state.schedulers.length, 100,
        'with release neutered the registry must grow again; if it does not, R1 proves nothing',
    );
});

test('GATE-01 the bound is absent from the unmodified source at the pre-fix commit', () => {
    const before = execFileSync('git', ['show', `${PRE_FIX_SHA}:${RS_A}`], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(before.includes('m20Q6ReleaseScheduler'), false);
    assert.equal(before.includes('M20Q6_SCHEDULER_POOL_CAP'), false);
    assert.equal(before.includes('_m20Q6SchedulerPoolV1Enabled'), false);
    assert.equal(
        before.includes('label: `${kind}:${state.schedulers.length}`'), true,
        'the pre-fix source should still carry the eager label the fix replaced',
    );
    assert.equal(
        before.includes('for (const entry of state.schedulers)'), true,
        'and the unbounded forward scan in the clear path',
    );
});

test('MIRROR both copies of the engine are byte-identical', () => {
    const a = createHash('sha256').update(readFileSync(RS_A)).digest('hex');
    const b = createHash('sha256').update(readFileSync(RS_B)).digest('hex');
    assert.equal(a, b, 'the mirrors diverged; the fix landed in one tree only');
});
