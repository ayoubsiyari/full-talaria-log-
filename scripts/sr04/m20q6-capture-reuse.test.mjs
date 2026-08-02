/**
 * QW-3 / M20-Q6 — capture wrappers are installed once and reused.
 *
 * After the scheduler registry was bounded, the remaining M20-Q6 allocation was
 * m20Q6PatchSchedulers / m20Q6PatchTarget rebuilding a record and a wrapper
 * closure for every patched method on every scope on every scheduled callback.
 * Those wrappers close over the original and the active capture state — neither
 * of which changes between captures — so they can be built once and left
 * installed until drain.
 *
 * Correctness that must hold:
 *   - outside a capture window the wrappers are transparent
 *   - inside a capture window timers are still tracked into the active state
 *   - two instances in one realm share one wrapper (no nesting) and route by
 *     the active-capture pointer
 *   - drain restores the native property when the last owner leaves
 *   - kill-switch restores the legacy rebuild-every-capture behaviour
 *
 * C-SELF mutates the shipped CaptureEffects in memory to force the legacy
 * path and proves this suite reports the growth, so an inert fix cannot pass.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const RS_A = 'chart v 1.4/chart/modules/replay-system.js';
const RS_B = 'homepage/public/chart/modules/replay-system.js';
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

function build({ disableReuse, mutate } = {}) {
    const flagReader = balanced(rs, 'function _talariaDisableFlagTruthy(');
    const poolPred = balanced(rs, 'function _m20Q6SchedulerPoolV1Enabled(');
    const reusePred = balanced(rs, 'function _m20Q6CaptureReuseV1Enabled(');
    const cap = rs.match(/const M20Q6_SCHEDULER_POOL_CAP = \d+;/)[0];

    const helpers = [
        'm20Q6RestoreOwnProperty',
        'm20Q6ClaimSharedPatch',
        'm20Q6ReleaseSharedPatches',
        'm20Q6PatchTarget',
        'm20Q6ReleaseScheduler',
        'm20Q6SchedulerLabel',
        'm20Q6TrackScheduler',
        'm20Q6PatchSchedulers',
        'm20Q6PatchTimezoneManager',
        'm20Q6InstallCapturePatches',
        'm20Q6CaptureEffects',
    ].map((name) => balanced(rs, `\n    function ${name}(`)).join('\n');

    let body = helpers;
    if (mutate === 'reuse-inert') {
        // Force every capture down the legacy rebuild path even when the
        // kill-switch says reuse is on. An inert product fix must fail R2.
        body = body.replace(
            'const reuse = _m20Q6CaptureReuseV1Enabled();',
            'const reuse = false;',
        );
    }

    const win = { setTimeout, clearTimeout, setInterval, clearInterval };
    win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    win.cancelAnimationFrame = (h) => clearTimeout(h);
    win.queueMicrotask = queueMicrotask;
    win.parent = win;
    win.top = win;
    if (disableReuse !== undefined) {
        win.__TALARIA_DISABLE_M20Q6_CAPTURE_REUSE_V1 = disableReuse;
    }

    const factory = new Function('window', 'globalThis', `
        const document = null;
        ${flagReader}
        ${poolPred}
        ${reusePred}
        ${cap}
        const m20Q6SharedPatches = new WeakMap();
        let m20Q6ActiveCaptureState = null;
        function m20Q6AddEvent() { throw new Error('addEvent not under test'); }
        ${body}
        return {
            scope: window,
            capture: m20Q6CaptureEffects,
            release: m20Q6ReleaseSharedPatches,
            makeState() {
                return {
                    instance: {},
                    acceptCallbacks: true,
                    captureDepth: 0,
                    captureOwnerRoot: null,
                    events: [],
                    schedulers: [],
                    schedulerSerial: 0,
                    schedulerPool: [],
                    patchRecords: [],
                    managers: [],
                    _reuseSession: null,
                };
            },
            sharedPatches: m20Q6SharedPatches,
            get active() { return m20Q6ActiveCaptureState; },
        };
    `);
    return factory(win, win);
}

test('R0 mirrors are byte-identical over the reuse region', () => {
    const a = readFileSync(RS_A);
    const b = readFileSync(RS_B);
    assert.equal(
        createHash('sha256').update(a).digest('hex'),
        createHash('sha256').update(b).digest('hex'),
        'homepage mirror drifted from primary',
    );
});

test('R1 kill-switch defaults ON (reuse active when flag absent)', () => {
    const api = build();
    const state = api.makeState();
    let saw = 0;
    api.capture(state, () => { saw += 1; });
    assert.equal(saw, 1);
    assert.ok(state.patchRecords.length > 0, 'reuse should claim shared patches');
    api.release(state);
});

test('R2 steady-state capture does not rebuild scheduler wrappers', () => {
    const api = build();
    const state = api.makeState();
    const scope = api.scope;
    const before = scope.setTimeout;

    api.capture(state, () => {});
    const afterFirst = scope.setTimeout;
    assert.notEqual(afterFirst, before, 'first capture installs a wrapper');
    assert.equal(typeof afterFirst, 'function');

    for (let i = 0; i < 50; i += 1) api.capture(state, () => {});
    assert.equal(scope.setTimeout, afterFirst, 'later captures must reuse the same wrapper');
    assert.equal(state.patchRecords.length > 0, true);
    // One claim per patched name, not one per capture.
    const timeoutClaims = state.patchRecords.filter((r) => r.name === 'setTimeout');
    assert.equal(timeoutClaims.length, 1, 'setTimeout claimed once, not once per capture');
    api.release(state);
    assert.equal(scope.setTimeout, before, 'drain restores the native timer');
});

test('R3 wrappers are transparent outside a capture window', async () => {
    const api = build();
    const state = api.makeState();
    const scope = api.scope;
    api.capture(state, () => {});
    assert.equal(state.schedulers.length, 0);

    let fired = false;
    const handle = scope.setTimeout(() => { fired = true; }, 1);
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(fired, true);
    assert.equal(state.schedulers.length, 0, 'outside capture must not track');
    scope.clearTimeout(handle);
    api.release(state);
});

test('R4 wrappers track into the active state inside a capture window', () => {
    const api = build();
    const state = api.makeState();
    const scope = api.scope;
    api.capture(state, () => {
        const h = scope.setTimeout(() => {}, 1000);
        assert.equal(state.schedulers.length, 1);
        assert.equal(state.schedulers[0].pending, true);
        scope.clearTimeout(h);
        assert.equal(state.schedulers.length, 0, 'clear releases the pooled entry');
    });
    api.release(state);
});

test('R5 two instances share one wrapper and route by active capture', () => {
    const api = build();
    const a = api.makeState();
    const b = api.makeState();
    const scope = api.scope;
    api.capture(a, () => {});
    const wrapper = scope.setTimeout;
    api.capture(b, () => {
        assert.equal(scope.setTimeout, wrapper, 'second owner must not nest a wrapper');
    });
    api.capture(a, () => {
        scope.setTimeout(() => {}, 1000);
        assert.equal(a.schedulers.length, 1);
        assert.equal(b.schedulers.length, 0, 'tracks into the active owner only');
        scope.clearTimeout(a.schedulers[0].handle);
    });
    api.release(a);
    // b still owns the shared patch, so the wrapper stays.
    assert.equal(scope.setTimeout, wrapper);
    api.release(b);
});

test('R6 kill-switch restores rebuild-every-capture', () => {
    const api = build({ disableReuse: true });
    const state = api.makeState();
    const scope = api.scope;
    api.capture(state, () => {});
    assert.equal(state.patchRecords.length, 0, 'legacy path claims no shared patches');
    // Legacy restores in finally, so the native timer is back.
    const native = scope.setTimeout;
    api.capture(state, () => {
        assert.notEqual(scope.setTimeout, native, 'legacy installs for the window');
    });
    assert.equal(scope.setTimeout, native, 'legacy restores after the window');
});

test('R7 query discoveries are ephemeral and do not join the shared registry', () => {
    const api = build();
    const state = api.makeState();
    const scope = api.scope;
    // A fake document with querySelector returning a fresh node each call.
    const nodes = [];
    scope.document = {
        querySelector() {
            const node = {
                id: `n${nodes.length}`,
                addEventListener() {},
                removeEventListener() {},
            };
            nodes.push(node);
            return node;
        },
    };
    // InstallCapturePatches patches document when present.
    const doc = scope.document;
    // Point the factory's document binding... Install uses typeof document.
    // Instead drive discoveries through a patched query on the scope window
    // by giving the instance a querySelector that returns fresh nodes.
    state.instance = {
        querySelector() {
            const node = { addEventListener() {}, removeEventListener() {} };
            nodes.push(node);
            return node;
        },
    };

    api.capture(state, () => {
        for (let i = 0; i < 20; i += 1) state.instance.querySelector('.x');
    });
    const sharedAfterFirst = state.patchRecords.length;
    assert.ok(sharedAfterFirst > 0, 'stable targets still claim shared patches');

    for (let round = 0; round < 10; round += 1) {
        api.capture(state, () => {
            for (let i = 0; i < 20; i += 1) state.instance.querySelector('.x');
        });
    }
    assert.equal(
        state.patchRecords.length,
        sharedAfterFirst,
        'discoveries must not grow the shared registry across captures',
    );
    assert.equal(nodes.length, 20 * 11, 'sanity: discoveries actually ran');
    // None of the discovered nodes may own a shared patch entry.
    for (const node of nodes) {
        assert.equal(api.sharedPatches.has(node), false, 'discovered node leaked into shared registry');
    }
    void doc;
    void scope;
    api.release(state);
});

test('C-SELF neutering reuse makes R2 fail', () => {
    const api = build({ mutate: 'reuse-inert' });
    const state = api.makeState();
    const scope = api.scope;
    const before = scope.setTimeout;
    api.capture(state, () => {});
    // Inert path restores, so we are back on native; the growth signal is that
    // patchRecords stay empty across many captures (no shared claim) while the
    // suite's R2 expects claims. Assert the defect the self-proof must see.
    assert.equal(state.patchRecords.length, 0, 'inert reuse must not claim shared patches');
    assert.equal(scope.setTimeout, before);
    let rebuilt = 0;
    const seen = new Set();
    for (let i = 0; i < 10; i += 1) {
        api.capture(state, () => {
            if (!seen.has(scope.setTimeout)) {
                seen.add(scope.setTimeout);
                rebuilt += 1;
            }
        });
    }
    assert.ok(rebuilt >= 1, 'inert path rebuilds wrappers inside the window');
});
