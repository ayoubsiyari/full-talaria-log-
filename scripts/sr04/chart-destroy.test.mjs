/**
 * chart-destroy.test.mjs — LIFE-1. Chart.destroy(), proven behaviourally.
 *
 * "No listeners remain in an array" is bookkeeping. The defect is that after exit-and-re-enter
 * (reset path R3) two engines are live and BOTH act on the same global keydown, so the cells here
 * dispatch to a real listener table and assert the stale engine STOPS RECEIVING. Memory is the
 * second-order benefit; input correctness is the defect.
 *
 * Product methods are extracted from chart.js by anchor and bound to a stub, so these run shipped
 * text rather than a paraphrase.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = path.join(REPO, 'chart v 1.4', 'chart', 'chart.js');
const MIRROR = path.join(REPO, 'homepage', 'public', 'chart', 'chart.js');
const SRC = fs.readFileSync(CANONICAL, 'utf8');
const FLAG = '__TALARIA_CHART_DESTROY_V1';

/** Slice a class method by its signature, brace-matching to its end. */
function extractMethod(src, signature) {
    const at = src.indexOf(signature);
    assert.notEqual(at, -1, `method not found: ${signature}`);
    let depth = 0;
    let i = src.indexOf('{', at);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(at, i + 1);
}

function extractFn(src, name) {
    const at = src.indexOf(`function ${name}(`);
    assert.notEqual(at, -1, `function not found: ${name}`);
    let depth = 0;
    let i = src.indexOf('{', at);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(at, i + 1);
}

/** A minimal event target that behaves like the DOM for add/remove/dispatch. */
function makeTarget(name) {
    const table = new Map();
    return {
        name,
        addEventListener(type, handler, options) {
            const key = `${type}|${!!(options && options.capture)}`;
            if (!table.has(key)) table.set(key, []);
            table.get(key).push(handler);
        },
        removeEventListener(type, handler, options) {
            const key = `${type}|${!!(options && options.capture)}`;
            const arr = table.get(key) || [];
            const i = arr.indexOf(handler);
            if (i >= 0) arr.splice(i, 1);
        },
        dispatch(type, capture = false) {
            const arr = table.get(`${type}|${!!capture}`) || [];
            for (const h of arr.slice()) h({ type });
            return arr.length;
        },
        liveCount() {
            let n = 0;
            for (const arr of table.values()) n += arr.length;
            return n;
        }
    };
}

/** Build an engine carrying the real _trackListener/_trackObserver/_trackTimer/destroy. */
function makeEngine(src, { flagValue } = {}) {
    const track = extractMethod(src, '    _trackListener(target, type, handler, options) {');
    const trackObs = extractMethod(src, '    _trackObserver(observer) {');
    const trackTimer = extractMethod(src, '    _trackTimer(id, kind) {');
    const destroy = extractMethod(src, '    destroy() {');
    const flagFn = extractFn(src, '_talariaChartDestroyDisabled');

    const win = {};
    if (flagValue !== undefined) win[FLAG] = flagValue;
    win.parent = win;
    win.top = win;

    const cleared = { interval: [], timeout: [], raf: [] };
    const sandbox = {
        window: win,
        clearInterval: (id) => cleared.interval.push(id),
        clearTimeout: (id) => cleared.timeout.push(id),
        cancelAnimationFrame: (id) => cleared.raf.push(id)
    };

    // eslint-disable-next-line no-new-func
    const factory = new Function(
        'window', 'clearInterval', 'clearTimeout', 'cancelAnimationFrame',
        `${flagFn}\nreturn { ${track}, ${trackObs}, ${trackTimer}, ${destroy} };`
    );
    const proto = factory(sandbox.window, sandbox.clearInterval, sandbox.clearTimeout, sandbox.cancelAnimationFrame);
    const engine = Object.assign(Object.create(proto), {
        data: [1, 2, 3], rawData: [1, 2, 3], fullData: [1, 2, 3], fullRawData: [1, 2, 3],
        _frameDisplaySeries: [1], _resampledCache: {}, _panTimeTickCache: {}
    });
    return { engine, cleared, win };
}

/* ------------------------------------------------------------------ cells */

test('L1 the stale engine STOPS RECEIVING after destroy (the actual defect)', () => {
    const doc = makeTarget('document');
    const { engine } = makeEngine(SRC);
    let seen = 0;
    engine._trackListener(doc, 'keydown', () => { seen += 1; });

    doc.dispatch('keydown');
    assert.equal(seen, 1, 'live engine must receive');

    engine.destroy();
    doc.dispatch('keydown');
    assert.equal(seen, 1, 'destroyed engine must NOT receive — this is R3');
    assert.equal(doc.liveCount(), 0, 'and the listener table must be empty');
});

test('L2 R3: two engines, only the surviving one acts', () => {
    // The reset path builds a new engine without tearing down the old one. Before LIFE-1 both
    // answered the same key. This is that scene.
    const doc = makeTarget('document');
    const a = makeEngine(SRC).engine;
    const b = makeEngine(SRC).engine;
    let aSaw = 0; let bSaw = 0;
    a._trackListener(doc, 'keydown', () => { aSaw += 1; });
    b._trackListener(doc, 'keydown', () => { bSaw += 1; });

    doc.dispatch('keydown');
    assert.deepEqual([aSaw, bSaw], [1, 1], 'both live before teardown');

    a.destroy();
    doc.dispatch('keydown');
    assert.deepEqual([aSaw, bSaw], [1, 2], 'stale engine silent, new engine still works');
});

test('L3 capture-flag listeners are removed with the same flag', () => {
    // removeEventListener with a mismatched capture flag silently does nothing, which would leave
    // the listener attached while the array reported it released.
    const doc = makeTarget('document');
    const { engine } = makeEngine(SRC);
    let seen = 0;
    engine._trackListener(doc, 'mousedown', () => { seen += 1; }, { capture: true });
    doc.dispatch('mousedown', true);
    assert.equal(seen, 1);
    engine.destroy();
    doc.dispatch('mousedown', true);
    assert.equal(seen, 1, 'capture listener must actually be removed');
});

test('L4 children are destroyed, and a child that throws does not strand the parent', () => {
    const doc = makeTarget('document');
    const { engine } = makeEngine(SRC);
    let omKilled = false;
    engine.orderManager = { destroy() { omKilled = true; throw new Error('child exploded'); } };
    let rsKilled = false;
    engine.replaySystem = { destroy() { rsKilled = true; } };
    engine._trackListener(doc, 'keydown', () => {});

    assert.doesNotThrow(() => engine.destroy());
    assert.ok(omKilled, 'orderManager.destroy must be called');
    assert.ok(rsKilled, 'a throwing sibling must not prevent the next child being destroyed');
    assert.equal(doc.liveCount(), 0, 'and listeners must still be released');
});

test('L5 observers disconnected and timers cleared by kind', () => {
    const { engine, cleared } = makeEngine(SRC);
    let disconnected = 0;
    engine._trackObserver({ disconnect() { disconnected += 1; } });
    engine._trackTimer(11, 'interval');
    engine._trackTimer(22, 'raf');
    engine._trackTimer(33, 'timeout');
    engine.destroy();
    assert.equal(disconnected, 1);
    assert.deepEqual(cleared.interval, [11]);
    assert.deepEqual(cleared.raf, [22]);
    assert.deepEqual(cleared.timeout, [33]);
});

test('L6 MEM-1 half: series references are dropped', () => {
    // A released engine that still pins its bars does not bend the residency slope.
    const { engine } = makeEngine(SRC);
    engine.destroy();
    for (const f of ['data', 'rawData', 'fullData', 'fullRawData', '_frameDisplaySeries', '_resampledCache', '_panTimeTickCache']) {
        assert.equal(engine[f], null, `${f} must be released`);
    }
});

test('L7 destroy is idempotent and reports whether it acted', () => {
    const doc = makeTarget('document');
    const { engine } = makeEngine(SRC);
    engine._trackListener(doc, 'keydown', () => {});
    assert.equal(engine.destroy(), true, 'first call acts');
    assert.equal(engine.destroy(), false, 'second call is a no-op');
});

test('L8 FLAG-03: kill-switch truthy restores the never-released engine, product still works', () => {
    for (const v of [true, 1, 'yes', {}]) {
        const doc = makeTarget('document');
        const { engine } = makeEngine(SRC, { flagValue: v });
        let seen = 0;
        engine._trackListener(doc, 'keydown', () => { seen += 1; });
        assert.equal(engine.destroy(), false, `truthy ${JSON.stringify(v)} must disable destroy`);
        doc.dispatch('keydown');
        assert.equal(seen, 1, 'legacy behaviour: the engine still receives');
        assert.deepEqual(engine.data, [1, 2, 3], 'and its series are untouched');
    }
});

test('L9 FLAG-02: falsy values keep the fix active', () => {
    for (const v of [undefined, null, false, 0, '', Number.NaN]) {
        const doc = makeTarget('document');
        const { engine } = makeEngine(SRC, { flagValue: v });
        engine._trackListener(doc, 'keydown', () => {});
        assert.equal(engine.destroy(), true, `falsy ${JSON.stringify(v)} must keep destroy`);
        assert.equal(doc.liveCount(), 0);
    }
});

test('L10 the switch is read with a truthy climb, not === true', () => {
    assert.ok(!new RegExp(`${FLAG}\\s*===\\s*true`).test(SRC),
        'strict equality would let 1 / "yes" silently fail to disable');
    const fn = extractFn(SRC, '_talariaChartDestroyDisabled');
    assert.match(fn, /window\.parent/, 'must climb to parent');
    assert.match(fn, /window\.top/, 'must climb to top');
});

test('L11 the seam is actually used by the constructor cluster', () => {
    // Wiring, not presence: a seam nothing routes through releases nothing.
    const uses = (SRC.match(/this\._trackListener\(/g) || []).length;
    assert.ok(uses >= 5, `expected the viewport cluster routed through the seam, found ${uses}`);
    assert.match(SRC, /this\._trackListener\(window, 'resize', this\._handleViewportRefresh\)/);
    assert.match(SRC, /this\._trackListener\(document, 'visibilitychange', this\._handleVisibilityRefresh\)/);
});

test('L12 GATE-01: unmodified source has no destroy at all', () => {
    // Pinned pre-LIFE-1: HEAD stops being "unmodified source" as soon as this commits.
    const head = execFileSync('git', ['show', '88840d9ea:chart v 1.4/chart/chart.js'],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 400 });
    assert.ok(!/\n    destroy\(\) \{/.test(head), 'this gate must be RED before LIFE-1');
});

test('L13 both shipped copies are byte-identical', () => {
    assert.equal(SRC, fs.readFileSync(MIRROR, 'utf8'), 'chart.js copies must match');
});
