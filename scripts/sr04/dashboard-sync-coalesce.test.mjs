/**
 * dashboard-sync-coalesce.test.mjs — LAG-2.
 *
 * PART A pins the ATTRIBUTION. The row as filed said `replay-dashboard-sync.js:10` runs
 * `m20Q6CapturedClear` and a `set innerHTML` synchronously per clock update via
 * `_onReplayVirtualTimeForDashboard`. Two thirds of that is wrong and Part A proves it
 * executably rather than by reading: the heavy work was already behind a 1200 ms trailing
 * debounce, and the only `innerHTML` write reachable from a per-tick replay method is on a
 * different path entirely (`ensureReplayFollowButton`, reached from `updateAutoScrollIndicator`,
 * not from the event).
 *
 * PART B pins the FIX. What IS synchronous per tick in this file is the debounce's own re-arm:
 * `updateTimeDisplay` (replay-system.js:8754) dispatches from inside an `m20Q6CaptureEffects`
 * window, so the listener's `clearTimeout` is `m20Q6CapturedClear` (replay-system.js:9816) —
 * a linear scan of `state.schedulers`, an array pruned only by `m20Q6DrainState`
 * (replay-system.js:10199) and grown one entry per tick by the paired `setTimeout`.
 *
 * WHAT IS COUNTED. Entries into `_onReplayVirtualTimeForDashboard` are counted by the function
 * itself. Entries into `m20Q6CapturedClear` / `m20Q6TrackScheduler` are counted at the call site
 * under an identity guard (R0 proves the counted callee is the real shipped wrapper, by function
 * identity and name), so every increment is followed by exactly one entry. No downstream proxy —
 * timer counts, PATCH counts and scan side effects are all rejected as stand-ins.
 *
 * LIMIT. Engine-level. The scheduler wrappers, the flag helper and the listener are all shipped
 * text, but the scope, the clock and the frame loop are modelled. This infers per-tick scheduler
 * occupancy; it does not witness a freeze. No browser or paint harness exists in this repo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const SYNC_REL = 'chart v 1.4/chart/modules/replay-dashboard-sync.js';
const SYNC_MIRROR_REL = 'homepage/public/chart/modules/replay-dashboard-sync.js';
const REPLAY_REL = 'chart v 1.4/chart/modules/replay-system.js';
const CHART_REL = 'chart v 1.4/chart/chart.js';

const SWITCH = '__TALARIA_DASHBOARD_SYNC_COALESCE_V1';
const COALESCE_MARKER = SWITCH;

const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

const SYNC_SRC = read(SYNC_REL);
const REPLAY_SRC = read(REPLAY_REL);
const CHART_SRC = read(CHART_REL);

/* ------------------------------------------------------------------ shipped-text extraction */

/** Brace-matched slice starting at a `function NAME(` declaration, so cells run shipped text. */
function extractFunction(src, name, { indent = '    ' } = {}) {
    const anchor = `\n${indent}function ${name}(`;
    const a = src.indexOf(anchor);
    assert.notEqual(a, -1, `${name} not found in shipped source`);
    assert.equal(src.indexOf(anchor, a + 1), -1, `${name} declaration must be unique`);
    let depth = 0;
    let i = src.indexOf('{', a);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(a + 1, i + 1);
}

/** Brace-matched slice of a class method, used to prove a body does NOT contain something. */
function extractMethod(src, name, { indent = '    ' } = {}) {
    const anchor = `\n${indent}${name}(`;
    const a = src.indexOf(anchor);
    assert.notEqual(a, -1, `${name} not found`);
    let depth = 0;
    let i = src.indexOf('{', a);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(a + 1, i + 1);
}

const NOT_A_DECLARATION = new Set([
    'if', 'else', 'for', 'while', 'do', 'switch', 'catch', 'try', 'return', 'typeof', 'new', 'with',
]);

/** Enclosing top-level declaration (class method or nested function) for an absolute offset. */
function enclosingMethod(src, offset) {
    const lines = src.slice(0, offset).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
        const m = /^ {4}(?:async )?(?:function )?([A-Za-z_$][\w$]*)\s*\(/.exec(lines[i]);
        if (m && !NOT_A_DECLARATION.has(m[1])) return m[1];
    }
    return '(module scope)';
}

/**
 * Bytes of a path from the last commit that predates this change. Anchored on the absence of the
 * switch marker rather than on HEAD, so the gate keeps discriminating after the fix is committed.
 */
function preChangeSource(rel, marker) {
    const log = execFileSync('git', ['log', '--format=%H', '--', rel],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 })
        .split('\n').map((s) => s.trim()).filter(Boolean);
    for (const sha of log) {
        let blob;
        try {
            blob = execFileSync('git', ['show', `${sha}:${rel}`],
                { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 64 });
        } catch (_e) {
            continue;
        }
        if (!blob.includes(marker)) return { sha, src: blob };
    }
    throw new Error(`no pre-change revision of ${rel} found`);
}

const PRE = preChangeSource(SYNC_REL, COALESCE_MARKER);

/**
 * replay-system.js as it stood immediately before the QW-3 registry bound.
 *
 * Part A's attribution is a claim about the bytes the row was filed against, so it
 * is pinned there. Asserting it against today's file would make the cells fail the
 * moment the defect is fixed, which is backwards.
 */
const REPLAY_PRE_QW3 = execFileSync(
    'git', ['show', `189a360ec:${REPLAY_REL}`],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
);

/* ------------------------------------------------------------------ the m20Q6 scheduler harness */

/**
 * Instantiate the REAL `m20Q6PatchSchedulers` / `m20Q6TrackScheduler` / `m20Q6RestoreOwnProperty`
 * over a modelled scope, plus a capture window with the shipped depth guard. Panels never see a
 * synthetic clearTimeout in production either — inside a capture window `clearTimeout` IS
 * `m20Q6CapturedClear`, which is the whole point of the row.
 */
function makeHarness() {
    // The registry bound (QW-3) added a switch, a pool cap and a release path that
    // m20Q6TrackScheduler now calls. Lifting the tracker without them compiles and
    // then throws at the first timer, so they are lifted here rather than stubbed:
    // a stub would let this suite pass against a registry that no longer bounds.
    const poolCap = REPLAY_SRC.match(/const M20Q6_SCHEDULER_POOL_CAP = \d+;/)[0];
    const pieces = [
        poolCap,
        // These two are module-level, not inside the m20Q6 IIFE.
        extractFunction(REPLAY_SRC, '_talariaDisableFlagTruthy', { indent: '' }),
        extractFunction(REPLAY_SRC, '_m20Q6SchedulerPoolV1Enabled', { indent: '' }),
        extractFunction(REPLAY_SRC, 'm20Q6SchedulerLabel'),
        extractFunction(REPLAY_SRC, 'm20Q6ReleaseScheduler'),
        extractFunction(REPLAY_SRC, 'm20Q6RestoreOwnProperty'),
        extractFunction(REPLAY_SRC, 'm20Q6TrackScheduler'),
        extractFunction(REPLAY_SRC, 'm20Q6PatchSchedulers'),
    ].join('\n\n');

    // eslint-disable-next-line no-new-func
    const factory = new Function('m20Q6CaptureEffects', 'window',
        `${pieces}\nreturn { m20Q6PatchSchedulers, m20Q6RestoreOwnProperty, m20Q6TrackScheduler };`);

    let api = null;
    const state = {
        schedulers: [],
        schedulerSerial: 0,
        schedulerPool: [],
        acceptCallbacks: true,
        captureDepth: 0,
        instance: null,
    };

    function captureEffects(st, fn) {
        if (!st || st.captureDepth > 0) return fn();
        st.captureDepth += 1;
        const session = { records: [], targets: new WeakSet(), schedulerScopes: new WeakSet() };
        try {
            api.m20Q6PatchSchedulers(st, scope, session);
            return fn();
        } finally {
            for (let i = session.records.length - 1; i >= 0; i--) {
                api.m20Q6RestoreOwnProperty(session.records[i].target, session.records[i].name, session.records[i]);
            }
            st.captureDepth -= 1;
        }
    }

    const win = {};
    win.parent = win;
    win.top = win;
    api = factory((st, fn) => captureEffects(st, fn), win);

    const clock = { now: 1_700_000_000_000 };
    const timers = [];
    const frames = [];
    let nextTimerId = 1;
    let nextFrameId = 1;

    const counters = {
        capturedClearEntries: 0,
        capturedClearScanIterations: 0,
        trackSchedulerEntries: 0,
        dashboardEntries: 0,
        dashboardDetails: [],
    };

    const scope = {
        setTimeout(fn, ms) {
            const id = nextTimerId++;
            timers.push({ id, at: clock.now + (Number(ms) || 0), fn });
            return id;
        },
        clearTimeout(id) {
            const i = timers.findIndex((t) => t.id === id);
            if (i >= 0) timers.splice(i, 1);
        },
        requestAnimationFrame(fn) {
            const id = nextFrameId++;
            frames.push({ id, fn });
            return id;
        },
        cancelAnimationFrame(id) {
            const i = frames.findIndex((f) => f.id === id);
            if (i >= 0) frames.splice(i, 1);
        },
    };

    // window IS the patched scope, exactly as in a browser realm where window === globalThis.
    scope.parent = scope;
    scope.top = scope;
    scope.document = { hidden: false };

    const listeners = new Map();
    scope.addEventListener = (type, handler) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
    };
    scope.dispatchEvent = (ev) => {
        for (const h of listeners.get(ev.type) || []) h(ev);
    };

    /**
     * Identity-guarded call-site counters. The product's unqualified `setTimeout` / `clearTimeout`
     * must resolve through the scope at CALL time so that patching mid-run is visible, which is
     * why these forwarders exist at all; the counting rides along.
     */
    const setTimeoutFwd = (fn, ms) => {
        const target = scope.setTimeout;
        if (target.name === 'm20Q6CapturedScheduler') counters.trackSchedulerEntries++;
        return target.call(scope, fn, ms);
    };
    const clearTimeoutFwd = (id) => {
        const target = scope.clearTimeout;
        if (target.name === 'm20Q6CapturedClear') {
            counters.capturedClearEntries++;
            counters.capturedClearScanIterations += state.schedulers.length;
        }
        return target.call(scope, id);
    };

    function runDueTimers() {
        for (;;) {
            const due = timers.filter((t) => t.at <= clock.now).sort((a, b) => a.at - b.at)[0];
            if (!due) return;
            timers.splice(timers.indexOf(due), 1);
            due.fn();
        }
    }

    function runFrame() {
        const batch = frames.splice(0, frames.length);
        for (const f of batch) f.fn(clock.now);
    }

    /** Advance the modelled clock one display refresh at a time, timers then frame. */
    function advance(ms, frameMs = 16) {
        let left = ms;
        while (left > 0) {
            const step = Math.min(frameMs, left);
            clock.now += step;
            left -= step;
            runDueTimers();
            runFrame();
        }
    }

    return { api, state, scope, clock, counters, captureEffects, setTimeoutFwd, clearTimeoutFwd, advance, timers, frames };
}

/** The shipped self→parent→top reader, instantiated against the modelled window. */
function makeFlagReader(scope) {
    const src = extractFunction(REPLAY_SRC, '_talariaDisableFlagTruthy', { indent: '' });
    // eslint-disable-next-line no-new-func
    return new Function('window', `${src}\nreturn _talariaDisableFlagTruthy;`)(scope);
}

/**
 * Run `src` (shipped listener text) through one modelled replay session.
 * Every tick dispatches replayVirtualTimeChanged from INSIDE a capture window, which is what
 * `updateTimeDisplay` does at replay-system.js:8754.
 */
function runSession(src, {
    ticks, tickMs = 16, flag = undefined, hostFlag = undefined, quietMs = 4000, hidden = false,
} = {}) {
    const H = makeHarness();
    const { scope, state, counters } = H;

    scope.document.hidden = !!hidden;
    if (hostFlag !== undefined) {
        const host = { [SWITCH]: hostFlag };
        scope.parent = host;
        scope.top = host;
    }
    scope._talariaDisableFlagTruthy = makeFlagReader(scope);
    if (flag !== undefined) scope[SWITCH] = flag;

    scope.chart = {
        _onReplayVirtualTimeForDashboard(detail) {
            counters.dashboardEntries++;
            counters.dashboardDetails.push(detail);
        },
    };

    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'setTimeout', 'clearTimeout', 'Date', src)(
        scope, scope.document, H.setTimeoutFwd, H.clearTimeoutFwd, { now: () => H.clock.now },
    );

    const BASE = 1_600_000_000_000;
    for (let i = 0; i < ticks; i++) {
        H.advance(tickMs);
        H.captureEffects(state, () => {
            scope.dispatchEvent({
                type: 'replayVirtualTimeChanged',
                detail: { timestamp: BASE + i * 60_000, symbol: 'EURUSD', currentIndex: i },
            });
        });
    }
    const lastTickAt = H.clock.now;
    H.advance(quietMs);

    return {
        ...counters,
        schedulersRetained: state.schedulers.length,
        lastDetail: counters.dashboardDetails[counters.dashboardDetails.length - 1] || null,
        expectedLastTs: BASE + (ticks - 1) * 60_000,
        lastTickAt,
    };
}

/* ================================================================== PART A — attribution */

test('R0 the counted callee IS the shipped m20Q6CapturedClear, by identity', () => {
    const H = makeHarness();
    let insideName = null;
    let insideFn = null;
    H.captureEffects(H.state, () => {
        insideName = H.scope.clearTimeout.name;
        insideFn = H.scope.clearTimeout;
    });
    assert.equal(insideName, 'm20Q6CapturedClear',
        'inside a capture window clearTimeout must resolve to the shipped wrapper');
    assert.notEqual(insideFn, H.scope.clearTimeout, 'the wrapper must be restored on exit');
    assert.match(REPLAY_SRC, /record\.wrapper = function m20Q6CapturedClear\(handle\) \{/);
});

test('R1 ATTRIBUTION: the row as filed does NOT reproduce — the heavy work was already coalesced', () => {
    // 1800 ticks of continuous play on the PRE-CHANGE bytes the row was filed against.
    const pre = runSession(PRE.src, { ticks: 1800, quietMs: 0 });
    assert.equal(pre.dashboardEntries, 0,
        '_onReplayVirtualTimeForDashboard must never be entered during continuous play — '
        + `the 1200 ms debounce already coalesced it (got ${pre.dashboardEntries} entries)`);
    assert.match(PRE.src, /\}, 1200\)/, 'the pre-change file already carried the 1200 ms debounce');
});

test('R2 ATTRIBUTION: m20Q6CapturedClear is the patched clearTimeout, not replay work', () => {
    const body = extractMethod(CHART_SRC, '_onReplayVirtualTimeForDashboard');
    assert.ok(!/clearTimeout|clearInterval|cancelAnimationFrame/.test(body),
        '_onReplayVirtualTimeForDashboard reaches no clear* call, so it cannot reach m20Q6CapturedClear');
    assert.ok(!/innerHTML/.test(body), '_onReplayVirtualTimeForDashboard writes no innerHTML');
    // The wrapper is installed by m20Q6PatchSchedulers over clearTimeout/clearInterval/cancelAnimationFrame.
    const patch = extractFunction(REPLAY_SRC, 'm20Q6PatchSchedulers');
    assert.match(patch, /\['clearTimeout', 'timeout'\]/);
    assert.match(patch, /function m20Q6CapturedClear\(handle\)/);

    // The scan this row attributed the cost to was real, and is pinned against the
    // bytes the row was filed against rather than against today's file.
    const patchPre = extractFunction(REPLAY_PRE_QW3, 'm20Q6PatchSchedulers');
    assert.match(patchPre, /for \(const entry of state\.schedulers\)/,
        'the attributed cost was a forward linear scan of state.schedulers');
    assert.ok(!/for \(const entry of state\.schedulers\)/.test(patch),
        'and QW-3 has since removed it; if it is back, the registry bound was reverted');
});

test('R3 ATTRIBUTION: the registry grew without bound, and QW-3 bounded it', () => {
    // The finding, against the bytes it was filed against: one prune site, at teardown.
    const prunesPre = [...REPLAY_PRE_QW3.matchAll(/state\.schedulers = state\.schedulers\.filter/g)];
    assert.equal(prunesPre.length, 1, 'exactly one prune site before QW-3');
    assert.equal(enclosingMethod(REPLAY_PRE_QW3, prunesPre[0].index), 'm20Q6DrainState');

    // The fix, measured through the same harness that measured the defect. The
    // registry now releases entries as they settle, so a long session neither
    // retains an entry per tick nor pays a quadratic scan.
    const now = runSession(PRE.src, { ticks: 1200, quietMs: 0 });
    assert.ok(now.schedulersRetained < 64,
        'retention must track live timers, not tick count '
        + `(retained ${now.schedulersRetained} across 1200 ticks)`);
    const n = now.capturedClearEntries;
    assert.ok(n > 0, 'the clear path must still be exercised, or this proves nothing');
    assert.ok(now.capturedClearScanIterations < n * 64,
        'scan cost must now be linear in live timers rather than quadratic in session length '
        + `(n=${n}, iters=${now.capturedClearScanIterations})`);
});

test('R4 ATTRIBUTION: no innerHTML write is reachable from the replayVirtualTimeChanged path', () => {
    const dispatch = extractMethod(REPLAY_SRC, '_dispatchReplayVirtualTimeChanged');
    const timeDisplay = extractMethod(REPLAY_SRC, 'updateTimeDisplay');
    assert.ok(!/innerHTML/.test(dispatch), '_dispatchReplayVirtualTimeChanged writes no innerHTML');
    assert.ok(!/innerHTML/.test(timeDisplay), 'updateTimeDisplay writes no innerHTML');
    assert.ok(!/innerHTML/.test(SYNC_SRC), 'the dashboard-sync listener writes no innerHTML');

    // Where the innerHTML writes in replay-system.js actually live.
    const owners = [...REPLAY_SRC.matchAll(/\.innerHTML\s*\+?=/g)]
        .map((m) => enclosingMethod(REPLAY_SRC, m.index));
    assert.deepEqual([...new Set(owners)].sort(), [
        'addCloseButtonToClone',
        'ensureReplayFollowButton',
        'm20Q6DrainState',
        'showGoBackInstruction',
        'showPickModeInstruction',
    ].sort(), 'the innerHTML owners must be exactly these — none of them is on the event path');

    // The per-tick one is reached from updateAutoScrollIndicator, not from the event.
    const indicator = extractMethod(REPLAY_SRC, 'updateAutoScrollIndicator');
    assert.match(indicator, /this\.ensureReplayFollowButton\(\)/);
    assert.match(extractMethod(REPLAY_SRC, 'completeTickAnimation'), /this\.updateAutoScrollIndicator\(\)/);
});

test('R5 ATTRIBUTION: every replayVirtualTimeChanged listener in the shipped trees is enumerated', () => {
    const roots = ['chart v 1.4/chart', 'homepage/public/chart'];
    const found = new Set();
    for (const root of roots) {
        for (const dir of ['modules', 'multichart-prod', '']) {
            const abs = path.join(REPO, root, dir);
            if (!fs.existsSync(abs)) continue;
            for (const f of fs.readdirSync(abs)) {
                if (!f.endsWith('.js')) continue;
                const txt = fs.readFileSync(path.join(abs, f), 'utf8');
                if (/addEventListener\(\s*["']replayVirtualTimeChanged["']/.test(txt)) {
                    found.add(path.posix.join(dir || '.', f));
                }
            }
        }
    }
    assert.deepEqual([...found].sort(), [
        'modules/economic-news-sidebar.js',
        'modules/replay-dashboard-sync.js',
        'modules/replay-news-panel.js',
    ], 'a new synchronous listener on this event would change the per-tick cost of the dispatch');
});

/* ================================================================== PART B — the fix */

test('R6 GATE: the pre-change listener enters m20Q6CapturedClear once per tick', () => {
    const pre = runSession(PRE.src, { ticks: 1800, quietMs: 0 });
    assert.equal(pre.capturedClearEntries, 1799,
        'one re-arm per tick after the first (the first tick has no timer to clear)');
    assert.equal(pre.trackSchedulerEntries, 1800, 'and one scheduler registration per tick');
});

test('R7 the shipped listener enters m20Q6CapturedClear zero times, at any tick rate', () => {
    for (const tickMs of [4, 8, 16, 33]) {
        const now = runSession(SYNC_SRC, { ticks: 1800, tickMs, quietMs: 0 });
        assert.equal(now.capturedClearEntries, 0,
            `tickMs=${tickMs}: the coalescer must not re-arm through clearTimeout`);
        assert.equal(now.capturedClearScanIterations, 0);
        assert.ok(now.trackSchedulerEntries < 60,
            `tickMs=${tickMs}: scheduler registrations must be per quiet period, not per tick `
            + `(got ${now.trackSchedulerEntries} for 1800 ticks)`);
    }
});

test('R8 the trailing write ALWAYS lands, exactly once, carrying the newest detail', () => {
    for (const ticks of [1, 2, 7, 60, 1800]) {
        const r = runSession(SYNC_SRC, { ticks });
        assert.equal(r.dashboardEntries, 1,
            `${ticks} ticks must collapse to exactly one write, got ${r.dashboardEntries}`);
        assert.equal(r.lastDetail.timestamp, r.expectedLastTs,
            'a stale trailing detail leaves the dashboard frozen for the rest of the session');
    }
});

test('R9 the write lands on the same 1200 ms trailing schedule as before', () => {
    const opts = { ticks: 400, quietMs: 4000 };
    const H = [];
    for (const src of [PRE.src, SYNC_SRC]) {
        const harness = makeHarness();
        harness.scope._talariaDisableFlagTruthy = makeFlagReader(harness.scope);
        let landedAt = null;
        harness.scope.chart = { _onReplayVirtualTimeForDashboard() { landedAt = harness.clock.now; } };
        // eslint-disable-next-line no-new-func
        new Function('window', 'document', 'setTimeout', 'clearTimeout', 'Date', src)(
            harness.scope, harness.scope.document, harness.setTimeoutFwd, harness.clearTimeoutFwd,
            { now: () => harness.clock.now },
        );
        for (let i = 0; i < opts.ticks; i++) {
            harness.advance(16);
            harness.captureEffects(harness.state, () => harness.scope.dispatchEvent({
                type: 'replayVirtualTimeChanged',
                detail: { timestamp: 1_600_000_000_000 + i * 60_000, currentIndex: i },
            }));
        }
        const lastTick = harness.clock.now;
        harness.advance(opts.quietMs);
        assert.ok(landedAt !== null, 'the write must land in both arms');
        H.push(landedAt - lastTick);
    }
    const [legacy, fixed] = H;
    assert.ok(Math.abs(fixed - legacy) <= 32,
        `trailing latency must match within one frame (legacy ${legacy} ms, fixed ${fixed} ms)`);
});

test('R10 FLAG: truthy disables and restores the per-tick re-arm; falsy keeps the fix', () => {
    for (const v of [true, 1, 'yes', 'true', {}, [], '0']) {
        const r = runSession(SYNC_SRC, { ticks: 300, flag: v, quietMs: 4000 });
        assert.equal(r.capturedClearEntries, 299,
            `truthy ${JSON.stringify(v)} must restore the legacy per-tick re-arm`);
        // A kill-switch arm must be a WORKING product, not a dead branch.
        assert.equal(r.dashboardEntries, 1, `truthy ${JSON.stringify(v)}: the write must still land`);
        assert.equal(r.lastDetail.timestamp, r.expectedLastTs);
    }
    for (const v of [undefined, null, false, 0, '', Number.NaN]) {
        const r = runSession(SYNC_SRC, { ticks: 300, flag: v, quietMs: 4000 });
        assert.equal(r.capturedClearEntries, 0, `falsy ${JSON.stringify(v)} must keep the fix active`);
        assert.equal(r.dashboardEntries, 1);
    }
});

test('R11 FLAG: the switch is read per call, never sampled at init', () => {
    const H = makeHarness();
    H.scope._talariaDisableFlagTruthy = makeFlagReader(H.scope);
    let entries = 0;
    H.scope.chart = { _onReplayVirtualTimeForDashboard() { entries++; } };
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'setTimeout', 'clearTimeout', 'Date', SYNC_SRC)(
        H.scope, H.scope.document, H.setTimeoutFwd, H.clearTimeoutFwd, { now: () => H.clock.now },
    );
    const burst = () => {
        for (let i = 0; i < 200; i++) {
            H.advance(16);
            H.captureEffects(H.state, () => H.scope.dispatchEvent({
                type: 'replayVirtualTimeChanged', detail: { timestamp: 1e12 + i, currentIndex: i },
            }));
        }
    };
    burst();
    assert.equal(H.counters.capturedClearEntries, 0, 'absent switch ⇒ fix active');
    H.scope[SWITCH] = 1;                                   // flipped mid-session, no reload
    burst();
    assert.ok(H.counters.capturedClearEntries > 150, 'flipping the switch mid-session must take effect');
    const armed = H.counters.capturedClearEntries;
    H.scope[SWITCH] = false;
    burst();
    assert.ok(H.counters.capturedClearEntries - armed < 5, 'and flipping it back must take effect too');
    H.advance(4000);
    assert.ok(entries > 0, 'the product still delivers across switch flips');
});

test('R12 FLAG: a switch set on the HOST reaches the panel realm', () => {
    // Panels are iframes. An operator types into the page they can see, which is the host, so an
    // own-window read would leave the cure running in every panel while reporting "disabled".
    const own = runSession(SYNC_SRC, { ticks: 300, quietMs: 4000 });
    assert.equal(own.capturedClearEntries, 0, 'baseline: no switch anywhere ⇒ fix active');

    const climbed = runSession(SYNC_SRC, { ticks: 300, hostFlag: 1, quietMs: 4000 });
    assert.equal(climbed.capturedClearEntries, 299,
        'a switch set only on parent/top must disable the fix inside the panel realm');
    assert.equal(climbed.dashboardEntries, 1, 'and the disabled arm must still deliver');
});

test('R13 the switch read uses the shared truthy helper, never === true', () => {
    assert.match(SYNC_SRC, /window\._talariaDisableFlagTruthy/);
    assert.match(SYNC_SRC, new RegExp(`read\\('${SWITCH}'\\)`));
    assert.ok(!new RegExp(`${SWITCH}\\s*===\\s*true`).test(SYNC_SRC),
        'strict equality would let 1 / "yes" silently fail to disable');
    assert.ok(!/===\s*true/.test(SYNC_SRC), 'no strict-true switch read anywhere in the file');
});

test('R14 both shipped copies are byte-identical', () => {
    assert.equal(SYNC_SRC, read(SYNC_MIRROR_REL), 'replay-dashboard-sync.js copies must match');
});

test('R15 SCOPE STAMP: the numbers, and what they are not', () => {
    const pre = runSession(PRE.src, { ticks: 1800, quietMs: 0 });
    const now = runSession(SYNC_SRC, { ticks: 1800, quietMs: 0 });
    console.log('\nLAG-2 dashboard-sync — 1800 ticks (28.8 s of 16 ms play), one listener modelled:');
    console.log(`  m20Q6CapturedClear entries   ${String(pre.capturedClearEntries).padStart(7)}  ->  ${now.capturedClearEntries}`);
    console.log(`  scan iterations (quadratic)  ${String(pre.capturedClearScanIterations).padStart(7)}  ->  ${now.capturedClearScanIterations}`);
    console.log(`  m20Q6TrackScheduler entries  ${String(pre.trackSchedulerEntries).padStart(7)}  ->  ${now.trackSchedulerEntries}`);
    console.log(`  schedulers retained          ${String(pre.schedulersRetained).padStart(7)}  ->  ${now.schedulersRetained}`);
    console.log('  ROW CORRECTION: _onReplayVirtualTimeForDashboard entries during continuous');
    console.log(`                  play: ${pre.dashboardEntries} before this change and ${now.dashboardEntries} after. The row\'s`);
    console.log('                  stated mechanism was already mitigated by the 1200 ms debounce.');
    console.log('  LIMIT: engine-level. Shipped wrappers, shipped flag helper, shipped listener;');
    console.log('         modelled scope, clock and frame loop. Infers scheduler occupancy per');
    console.log('         tick, does not witness a freeze.');
    assert.equal(now.capturedClearEntries, 0);
    assert.ok(pre.capturedClearEntries > 1000);
});
