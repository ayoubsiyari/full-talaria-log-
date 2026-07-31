/**
 * order-manager-teardown.test.mjs
 *
 * R3 (exit a session, enter another in the same tab) cannot be correct while an outgoing
 * OrderManager keeps receiving input. initReplaySystem constructs a fresh manager and abandons the
 * previous one, whose document/window listeners stay attached and keep firing, holding the previous
 * session's state.
 *
 * These cells assert RELEASE BEHAVIOURALLY — a destroyed manager stops receiving dispatched events —
 * rather than counting removeEventListener calls, because a remove call that disagrees on handler
 * identity or capture flag detaches nothing while looking exactly like teardown.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CANONICAL = path.join(REPO, 'chart v 1.4', 'chart', 'modules', 'order-manager.js');
const MIRROR = path.join(REPO, 'homepage', 'public', 'chart', 'modules', 'order-manager.js');
const SRC = fs.readFileSync(CANONICAL, 'utf8');

/* ------------------------------------------------------------------ extraction */

function extractMethod(src, name) {
    const needle = new RegExp(`\\n    ${name}\\(`, 'g');
    const hits = src.match(needle) || [];
    assert.equal(hits.length, 1, `needle for ${name} must match exactly once, got ${hits.length}`);
    const start = src.search(needle);
    let depth = 0;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i + 1); }
    }
    throw new Error(`unbalanced braces extracting ${name}`);
}

/* ------------------------------------------------------------------ fake DOM */

/** A target that records listeners and honours the capture flag the way a real one does. */
function makeTarget(name) {
    const bound = [];
    return {
        name,
        bound,
        addEventListener(type, handler, options) {
            bound.push({ type, handler, capture: options === true || !!(options && options.capture) });
        },
        removeEventListener(type, handler, options) {
            const capture = options === true || !!(options && options.capture);
            const i = bound.findIndex((b) => b.type === type && b.handler === handler && b.capture === capture);
            if (i !== -1) bound.splice(i, 1);
        },
        dispatch(type, ev = {}) {
            let n = 0;
            for (const b of [...bound]) if (b.type === type) { b.handler(ev); n++; }
            return n;
        },
        count(type) {
            return bound.filter((b) => !type || b.type === type).length;
        }
    };
}

function makeManager(src, { flag } = {}) {
    const doc = makeTarget('document');
    const win = makeTarget('window');
    win.__TALARIA_DISABLE_ORDER_MANAGER_TEARDOWN_V1 = flag;
    globalThis.window = win;
    globalThis.document = doc;

    const mgr = { escapes: [], focusLosses: [] };
    for (const name of ['_trackListener', '_trackObserver', 'destroy']) {
        // eslint-disable-next-line no-new-func
        mgr[name] = new Function(`return function ${extractMethod(src, name)}`)();
    }
    mgr._oiIsProvisionalEditActive = () => true;
    mgr._oiCancelActiveProvisionalEdit = (reason) => mgr.escapes.push(reason);
    mgr._m20A1Teardown = () => { mgr.journalTornDown = true; };
    return { mgr, doc, win };
}

/** Install the same shape the product installs at _oiEnsureProvisionalCancelHandlers. */
function installEscapeHandler(mgr) {
    const self = mgr;
    mgr._trackListener(globalThis.document, 'keydown', (e) => {
        if (e.key !== 'Escape' || !self._oiIsProvisionalEditActive()) return;
        self._oiCancelActiveProvisionalEdit('escape');
    });
}

/* ------------------------------------------------------------------ cells */

test('T1 POSITIVE CONTROL: before teardown the handler fires (the cells can see it working)', () => {
    const { mgr, doc } = makeManager(SRC);
    installEscapeHandler(mgr);
    doc.dispatch('keydown', { key: 'Escape' });
    assert.deepEqual(mgr.escapes, ['escape'], 'handler must fire while the manager is alive');
});

test('T2 after destroy() the manager STOPS RECEIVING the event', () => {
    const { mgr, doc } = makeManager(SRC);
    installEscapeHandler(mgr);
    doc.dispatch('keydown', { key: 'Escape' });
    mgr.destroy();
    doc.dispatch('keydown', { key: 'Escape' });
    assert.deepEqual(mgr.escapes, ['escape'], 'exactly one delivery: the pre-teardown one');
    assert.equal(doc.count('keydown'), 0, 'and the listener is genuinely detached');
});

test('T3 R3: an outgoing manager stops acting while the incoming one works', () => {
    // The reset scenario. Both managers share one document, as two sessions in one tab do.
    const { mgr: oldMgr, doc } = makeManager(SRC);
    installEscapeHandler(oldMgr);

    const newMgr = { escapes: [] };
    for (const name of ['_trackListener', '_trackObserver', 'destroy']) {
        // eslint-disable-next-line no-new-func
        newMgr[name] = new Function(`return function ${extractMethod(SRC, name)}`)();
    }
    newMgr._oiIsProvisionalEditActive = () => true;
    newMgr._oiCancelActiveProvisionalEdit = (r) => newMgr.escapes.push(r);
    installEscapeHandler(newMgr);

    assert.equal(doc.count('keydown'), 2, 'both sessions attached — this is the state today');
    oldMgr.destroy();
    doc.dispatch('keydown', { key: 'Escape' });

    assert.deepEqual(oldMgr.escapes, [], 'the outgoing session must not act on the new session input');
    assert.deepEqual(newMgr.escapes, ['escape'], 'the incoming session must still work');
    assert.equal(doc.count('keydown'), 1, 'exactly one manager attached after reset');
});

test('T4 observers are disconnected, not merely dropped', () => {
    const { mgr } = makeManager(SRC);
    let disconnected = 0;
    mgr._trackObserver({ disconnect: () => { disconnected++; } });
    mgr.destroy();
    assert.equal(disconnected, 1, 'a tracked observer must be disconnected');
});

test('T5 capture flag is preserved, so the remove actually detaches', () => {
    // A remove that disagrees on capture silently detaches nothing while looking like teardown.
    const { mgr, doc } = makeManager(SRC);
    mgr._trackListener(doc, 'mousedown', () => {}, true);
    assert.equal(doc.count('mousedown'), 1);
    mgr.destroy();
    assert.equal(doc.count('mousedown'), 0, 'capture-registered listener must be removed');
});

test('T6 destroy() is idempotent and safe on a bare instance', () => {
    const { mgr, doc } = makeManager(SRC);
    installEscapeHandler(mgr);
    mgr.destroy();
    mgr.destroy();
    assert.equal(doc.count(), 0);

    const bare = { destroy: new Function(`return function ${extractMethod(SRC, 'destroy')}`)() };
    assert.doesNotThrow(() => bare.destroy(), 'must not throw on a partially constructed instance');
});

test('T7 FLAG-02 truthy disables teardown, falsy keeps it', () => {
    for (const v of [true, 1, 'yes', 'true', {}, [], '0']) {
        const { mgr, doc } = makeManager(SRC, { flag: v });
        installEscapeHandler(mgr);
        mgr.destroy();
        assert.equal(doc.count('keydown'), 1, `truthy ${JSON.stringify(v)} must leave the listener attached`);
    }
    for (const v of [undefined, null, false, 0, '', Number.NaN]) {
        const { mgr, doc } = makeManager(SRC, { flag: v });
        installEscapeHandler(mgr);
        mgr.destroy();
        assert.equal(doc.count('keydown'), 0, `falsy ${JSON.stringify(v)} must tear down`);
    }
});

test('T8 FLAG-03 the OFF arm is a WORKING product, not an inert one', () => {
    // Legacy behaviour restored means the manager still receives and acts on input.
    const { mgr, doc } = makeManager(SRC, { flag: true });
    installEscapeHandler(mgr);
    mgr.destroy();
    doc.dispatch('keydown', { key: 'Escape' });
    assert.deepEqual(mgr.escapes, ['escape'], 'with teardown disabled the handler still works');
});

test('T9 the journal teardown still runs, so destroy composes rather than replaces', () => {
    const { mgr } = makeManager(SRC);
    mgr.destroy();
    assert.equal(mgr.journalTornDown, true, '_m20A1Teardown must still be invoked');
});

test('T10 GATE-01: the shipped source BEFORE this change has no destroy at all', () => {
    const head = execFileSync('git', ['show', 'HEAD:chart v 1.4/chart/modules/order-manager.js'],
        { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 200 });
    assert.equal((head.match(/\n    destroy\(/g) || []).length, 0,
        'baseline must have no destroy — this is what R3 was blocked on');
    assert.equal((head.match(/\n    _trackListener\(/g) || []).length, 0);
});

test('T10b the REAL dock registration releases its window listeners and its observer', () => {
    // Extracts and runs the shipped registration block rather than asserting its text, so a site
    // that reverts to bare addEventListener fails on behaviour instead of on a grep.
    const OPEN = '        let miDockResizeT = null;';
    const a = SRC.indexOf(OPEN);
    assert.notEqual(a, -1, 'dock registration anchor not found');
    assert.equal(SRC.indexOf(OPEN, a + 1), -1, 'anchor must be unique');
    const b = SRC.indexOf('} catch (_) {}', a);
    assert.notEqual(b, -1);
    const snippet = SRC.slice(a, b + '} catch (_) {}'.length);

    const { mgr, win } = makeManager(SRC);
    let observed = 0;
    let disconnected = 0;
    globalThis.ResizeObserver = class { observe() { observed++; } disconnect() { disconnected++; } };
    globalThis.document.getElementById = () => ({ id: 'replayToolbar' });

    // eslint-disable-next-line no-new-func
    new Function('applyMiDockAnchorAboveReplay', 'miDockAnchoredAboveReplay', snippet)
        .call(mgr, () => {}, true);

    assert.equal(win.count('resize'), 1, 'dock must register a resize listener');
    assert.equal(win.count('orientationchange'), 1);
    assert.equal(observed, 1, 'and observe the toolbar');

    mgr.destroy();
    assert.equal(win.count('resize'), 0, 'resize listener must be released by destroy()');
    assert.equal(win.count('orientationchange'), 0);
    assert.equal(disconnected, 1, 'and the observer disconnected');
});

test('T11 the always-registered global listeners are routed through the registry', () => {
    // These fire for every manager instance, so they are the ones that accumulate across sessions.
    for (const src of [SRC, fs.readFileSync(MIRROR, 'utf8')]) {
        assert.match(src, /this\._trackListener\(document, 'keydown'/);
        assert.match(src, /this\._trackListener\(window, 'multichartFocusChanged'/);
        assert.match(src, /this\._trackListener\(window, 'blur'/);
        assert.match(src, /this\._trackListener\(window, 'resize', onReplayDockResize\)/);
        assert.match(src, /this\._trackListener\(window, 'orientationchange', onReplayDockResize\)/);
        assert.match(src, /this\._trackObserver\(ro\)/);
    }
});

test('T12 mirrors are byte-identical', () => {
    assert.equal(SRC, fs.readFileSync(MIRROR, 'utf8'));
});

test('T13 destroy() IS CALLED: initOrderManager releases the outgoing manager first', () => {
    // A correct and uncalled teardown is the same defect as a correct and uncalled resolver, so the
    // call site is executed here rather than asserted. The real initOrderManager body is extracted
    // and run against a stub that records the ordering.
    for (const rel of ['chart v 1.4/chart/chart.js', 'homepage/public/chart/chart.js']) {
        const src = fs.readFileSync(path.join(REPO, rel), 'utf8');
        const start = src.search(/\n    initOrderManager\(\)/);
        assert.notEqual(start, -1, `${rel} must define initOrderManager`);
        let depth = 0;
        let end = start;
        for (let i = src.indexOf('{', start); i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
        }
        const body = src.slice(src.indexOf('{', start) + 1, end);

        const order = [];
        const chart = {
            replaySystem: {},
            orderManager: { destroy: () => order.push('destroy-old') }
        };
        // eslint-disable-next-line no-new-func
        const fn = new Function('OrderManager', body);
        fn.call(chart, function OrderManagerCtor() { order.push('construct-new'); });

        assert.deepEqual(order, ['destroy-old', 'construct-new'],
            `${rel}: the outgoing manager must be destroyed BEFORE the replacement is constructed`);
        assert.notEqual(chart.orderManager, undefined, 'and a new manager must still be installed');
    }
});

test('T13b a throwing teardown never blocks construction of the new manager', () => {
    const src = fs.readFileSync(path.join(REPO, 'chart v 1.4', 'chart', 'chart.js'), 'utf8');
    const start = src.search(/\n    initOrderManager\(\)/);
    let depth = 0;
    let end = start;
    for (let i = src.indexOf('{', start); i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    const body = src.slice(src.indexOf('{', start) + 1, end);
    let constructed = false;
    const chart = {
        replaySystem: {},
        orderManager: { destroy: () => { throw new Error('teardown blew up'); } }
    };
    // eslint-disable-next-line no-new-func
    new Function('OrderManager', body).call(chart, function Ctor() { constructed = true; });
    assert.equal(constructed, true, 'a failed teardown must not leave the chart with no manager');
});
