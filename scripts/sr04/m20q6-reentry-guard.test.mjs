/**
 * m20q6-reentry-guard.test.mjs — LAG-4 oracle for re-entrancy of the M20-Q6 effect capture.
 *
 * WHAT THIS CERTIFIES, AND WHAT IT DOES NOT.
 * Every cell runs the shipped text of `m20Q6CaptureEffects` and `m20Q6CapturedReplayEffect`,
 * pulled out of replay-system.js by string anchor and evaluated with the patch installers
 * stubbed. It counts CAPTURE SESSIONS — the product's own `session` object, one per established
 * capture — not a proxy such as wall time or call count, because the wrapper is entered twice by
 * design and only the session count distinguishes redundant capture from a cheap pass-through.
 * It does NOT witness listener bookkeeping end to end: the patch installers are stubs, so a cell
 * greening here says the guard admits exactly one session, not that teardown is complete.
 *
 * LAG-4 as written asserts the nested capture is redundant work that needs a new single-entry
 * guard. On the pre-change bytes that is already false: `state.captureDepth` has gated
 * m20Q6CaptureEffects since the M20-Q6 block landed whole in f38333b95, and the nesting cell below
 * measures one session, not two, on `git show HEAD:` source. The defect that IS live on those
 * bytes is narrower and worse: the depth increment sat OUTSIDE the try, with the caller-supplied
 * extraTargets scan between them, so a throwing `id` getter wedged captureDepth at 1 and silently
 * disabled capture for the rest of the instance's life — the exact stuck-guard failure LAG-4 names
 * as the thing to prevent. That is the red-before-green gate here.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL_REL = 'chart v 1.4/chart/modules/replay-system.js';
const MIRROR_REL = 'homepage/public/chart/modules/replay-system.js';
const CANONICAL = path.join(REPO, CANONICAL_REL);
const MIRROR = path.join(REPO, MIRROR_REL);

const RESERVED_SWITCH = '__TALARIA_M20Q6_REENTRY_GUARD_V1';

const CAPTURE_ANCHOR = '    function m20Q6CaptureEffects(state, fn, extraTargets = []) {';
const WRAPPER_ANCHOR = '            value: function m20Q6CapturedReplayEffect(...args) {';

const diskSrc = fs.readFileSync(CANONICAL, 'utf8');
const headSrc = execFileSync('git', ['show', `HEAD:${CANONICAL_REL}`], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 1 << 28,
});

/* ------------------------------------------------------------------ extraction */

/**
 * Brace-match a uniquely anchored block so the cells run shipped text, not a paraphrase.
 * Matching starts at the anchor's final `{` — anchors carry default params such as
 * `options = {}`, and starting at the first brace would return that empty object instead.
 */
function extractBlock(src, anchor) {
    const a = src.indexOf(anchor);
    assert.notEqual(a, -1, `anchor not found: ${anchor.trim()}`);
    assert.equal(src.indexOf(anchor, a + 1), -1, `anchor must be unique: ${anchor.trim()}`);
    const open = a + anchor.lastIndexOf('{');
    assert.equal(src[open], '{', `anchor must end at its opening brace: ${anchor.trim()}`);
    let depth = 0;
    let i = open;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    assert.equal(depth, 0, `unbalanced block at anchor: ${anchor.trim()}`);
    return src.slice(a, i + 1);
}

/** The captured-effect roster is an array literal, so brace matching does not apply. */
function extractEffectMethodList(src) {
    const anchor = '    const m20Q6EffectMethods = [';
    const a = src.indexOf(anchor);
    assert.notEqual(a, -1, 'm20Q6EffectMethods not found');
    assert.equal(src.indexOf(anchor, a + 1), -1, 'm20Q6EffectMethods anchor must be unique');
    const end = src.indexOf('\n    ];', a);
    assert.notEqual(end, -1, 'm20Q6EffectMethods list is unterminated');
    return src.slice(a, end);
}

/* ------------------------------------------------------------------ the model */

/**
 * A ReplaySystem stand-in carrying the real capture machinery.
 *
 * `sessions` is a Set of the product's own session objects, so the count cannot drift from what
 * m20Q6CaptureEffects actually established. The two effect methods mirror the product's real
 * nesting: updateChartData calls this._renderReplayChartUpdate(), and both names are in
 * m20Q6EffectMethods, so both carry the m20Q6CapturedReplayEffect wrapper.
 */
function harness(src, { renderBody = () => {} } = {}) {
    const captureSrc = extractBlock(src, CAPTURE_ANCHOR);
    const wrapperRaw = extractBlock(src, WRAPPER_ANCHOR);
    const wrapperSrc = wrapperRaw.slice(wrapperRaw.indexOf('function '));

    const sessions = new Set();
    const noteSession = (_state, _target, session) => { if (session) sessions.add(session); };

    const makeCapture = new Function(
        'm20Q6PatchTarget', 'm20Q6PatchSchedulers', 'm20Q6PatchTimezoneManager', 'm20Q6RestoreOwnProperty',
        `${captureSrc}\nreturn m20Q6CaptureEffects;`,
    );
    const captureEffects = makeCapture(
        noteSession,
        noteSession,
        (state, session) => noteSession(state, null, session),
        () => {},
    );

    const state = {
        instance: null,
        chart: null,
        phase: 'active',
        acceptCallbacks: true,
        captureDepth: 0,
        captureOwnerRoot: null,
        events: [],
        schedulers: [],
        managers: [],
    };
    const stateFor = () => state;

    const install = (name, method) => {
        const make = new Function(
            'm20Q6StateFor', 'm20Q6CaptureEffects', 'name', 'method',
            `return (${wrapperSrc});`,
        );
        return make(stateFor, captureEffects, name, method);
    };

    const calls = { updateChartData: 0, render: 0 };
    const instance = {};
    state.instance = instance;

    instance._renderReplayChartUpdate = install('_renderReplayChartUpdate', function () {
        calls.render++;
        return renderBody.call(this);
    });
    instance.updateChartData = install('updateChartData', function (autoScroll = true, options = {}) {
        calls.updateChartData++;
        // replay-system.js:4371 — the inner nesting site, inside the outer wrapped call.
        this._renderReplayChartUpdate();
        return options;
    });

    return { instance, state, sessions, calls, captureEffects };
}

/** Drive one capture with a caller-supplied target whose `id` getter throws. */
function captureWithHostileTarget(h) {
    const hostile = { get id() { throw new Error('hostile id getter'); } };
    let threw = null;
    try {
        h.captureEffects(h.state, () => {}, [hostile]);
    } catch (error) {
        threw = error;
    }
    return threw;
}

/** True when the given source still increments captureDepth before entering the try. */
function incrementsBeforeTry(src) {
    const block = extractBlock(src, CAPTURE_ANCHOR);
    const inc = block.indexOf('state.captureDepth += 1;');
    const tryAt = block.indexOf('\n        try {');
    assert.notEqual(inc, -1, 'captureDepth increment not found');
    assert.notEqual(tryAt, -1, 'capture try block not found');
    const between = block.slice(inc, tryAt);
    return between.includes('extraTargets');
}

/* ------------------------------------------------------------------ cells */

test('two nesting sites are real: updateChartData and the render it triggers are both wrapped', () => {
    const methods = extractEffectMethodList(diskSrc);
    assert.match(methods, /'updateChartData',/, 'updateChartData must be a captured effect method');
    assert.match(methods, /'_renderReplayChartUpdate',/, 'render must be a captured effect method');

    const body = extractBlock(diskSrc, '    updateChartData(autoScroll = true, options = {}) {');
    assert.match(
        body,
        /this\._renderReplayChartUpdate\(\);/,
        'updateChartData must call the wrapped render, or the nesting under test does not occur',
    );
});

test('nested call captures once, not twice', () => {
    const h = harness(diskSrc);
    h.instance.updateChartData(true);
    assert.equal(h.calls.updateChartData, 1);
    assert.equal(h.calls.render, 1, 'the inner operation must still run — the guard is a pass-through');
    assert.equal(h.sessions.size, 1, 'the nested wrapper entry must not establish a second capture');
    assert.equal(h.state.captureDepth, 0, 'depth must unwind to zero');
});

test('a non-nested call still captures', () => {
    const h = harness(diskSrc);
    h.instance._renderReplayChartUpdate();
    assert.equal(h.calls.render, 1);
    assert.equal(h.sessions.size, 1, 'an unnested effect must establish exactly one capture');
    assert.equal(h.state.captureDepth, 0);
});

test('a throw inside the inner call leaves the guard released', () => {
    let armed = true;
    const h = harness(diskSrc, {
        renderBody() {
            if (!armed) return;
            armed = false;
            throw new Error('inner effect exploded');
        },
    });

    assert.throws(() => h.instance.updateChartData(true), /inner effect exploded/);
    assert.equal(h.state.captureDepth, 0, 'the guard must not stay latched after a throw');

    const before = h.sessions.size;
    h.instance._renderReplayChartUpdate();
    assert.equal(h.sessions.size, before + 1, 'capture must still work on the call after the throw');
});

test('a throw in the extraTargets scan leaves the guard released (red on pre-change bytes)', () => {
    const h = harness(diskSrc);
    assert.notEqual(captureWithHostileTarget(h), null, 'the hostile getter must actually throw');
    assert.equal(h.state.captureDepth, 0, 'the guard must not stay latched after a scan throw');

    const before = h.sessions.size;
    h.instance._renderReplayChartUpdate();
    assert.equal(h.sessions.size, before + 1, 'capture must still work after a scan throw');
});

test('the stuck-guard defect reproduces on unmodified HEAD source', () => {
    if (!incrementsBeforeTry(headSrc)) {
        // The fix is committed; HEAD must behave like the working tree.
        const h = harness(headSrc);
        captureWithHostileTarget(h);
        assert.equal(h.state.captureDepth, 0);
        const before = h.sessions.size;
        h.instance._renderReplayChartUpdate();
        assert.equal(h.sessions.size, before + 1);
        return;
    }

    const h = harness(headSrc);
    assert.notEqual(captureWithHostileTarget(h), null);
    assert.equal(h.state.captureDepth, 1, 'pre-change bytes wedge the guard on');

    const before = h.sessions.size;
    h.instance.updateChartData(true);
    assert.equal(h.calls.render, 1, 'the operation still runs — the loss is silent');
    assert.equal(h.sessions.size, before, 'pre-change bytes capture nothing for the rest of the session');
});

test("HEAD already admits one capture per nest — LAG-4's double-capture premise does not reproduce", () => {
    const h = harness(headSrc);
    h.instance.updateChartData(true);
    assert.equal(
        h.sessions.size,
        1,
        'the captureDepth gate predates LAG-4; a cell asserting two sessions on HEAD would be false',
    );
});

test('the reserved kill-switch is absent from both mirrors', () => {
    const mirrorSrc = fs.readFileSync(MIRROR, 'utf8');
    assert.equal(
        diskSrc.includes(RESERVED_SWITCH), false,
        `${RESERVED_SWITCH} is wired up; the guard's switch semantics now need their own cells`,
    );
    assert.equal(mirrorSrc.includes(RESERVED_SWITCH), false);
});

test('the guard reads no flag, so no polarity or strict-equality read can regress', () => {
    const block = extractBlock(diskSrc, CAPTURE_ANCHOR);
    assert.equal(block.includes('_talariaDisableFlagTruthy'), false);
    assert.equal(block.includes('=== true'), false, 'a strict read of a switch would break the climb helper');
});

test('both mirrors are byte-identical', () => {
    const a = fs.readFileSync(CANONICAL);
    const b = fs.readFileSync(MIRROR);
    assert.equal(a.equals(b), true, `${CANONICAL_REL} and ${MIRROR_REL} diverged`);
});
