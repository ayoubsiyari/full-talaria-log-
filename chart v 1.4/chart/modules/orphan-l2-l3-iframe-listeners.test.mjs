/**
 * ORPHAN-L2 + ORPHAN-L3 — iframe load/error listeners released on removeChart.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/orphan-l2-l3-iframe-listeners.test.mjs"
 *
 * Defect: MultichartManager.addChart installs iframe `load`/`error` listeners
 * and stores them on the entry, but removeChart only removed them inside
 * `if (mcPanelStatePurgeV1Enabled())`. When PURGE-1 is off or that path is
 * missed, +2 listeners/cycle survive (C families 2/3).
 *
 * Fix: always release load (L2) and error (L3) on iframe removeChart, each
 * behind its own kill-switch (absent = ON; truthiness; per call). Family 1
 * (finer host commit) and order-marker listeners are out of scope.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(__dirname, '..', '..', '..');
const MANAGER_SRC = path.resolve(__dirname, '..', 'multichart-prod', 'multichart-manager.js');
const MANAGER_MIRROR = path.resolve(
    WORKTREE_ROOT,
    'homepage',
    'public',
    'chart',
    'multichart-prod',
    'multichart-manager.js',
);
const LOAD_SWITCH = '__TALARIA_DISABLE_MC_IFRAME_LOAD_LISTENER_RELEASE_V1';
const ERROR_SWITCH = '__TALARIA_DISABLE_MC_IFRAME_ERROR_LISTENER_RELEASE_V1';
const PURGE_SWITCH = '__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1';

function sha256File(filePath) {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function note(name, pass, detail = '') {
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

class FakeElement {
    constructor(tagName) {
        this.tagName = String(tagName || '').toUpperCase();
        this.children = [];
        this.parentNode = null;
        this.isConnected = false;
        this.style = {};
        this.attributes = {};
        this.className = '';
        this.textContent = '';
    }

    appendChild(child) {
        child.parentNode = this;
        child.isConnected = true;
        this.children.push(child);
        return child;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx >= 0) this.children.splice(idx, 1);
        child.parentNode = null;
        child.isConnected = false;
    }

    remove() {
        if (this.parentNode && typeof this.parentNode.removeChild === 'function') {
            this.parentNode.removeChild(this);
        } else {
            this.isConnected = false;
        }
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    querySelector() {
        return null;
    }
}

class FakePanelDocument {
    constructor(stats) {
        this.stats = stats;
        this.documentElement = new FakeElement('html');
        this.head = new FakeElement('head');
        this.readyState = 'complete';
        this._byId = new Map();
    }

    createElement(tagName) {
        this.stats.createdElements += 1;
        const el = new FakeElement(tagName);
        let id = '';
        Object.defineProperty(el, 'id', {
            get: () => id,
            set: (value) => {
                id = String(value);
                if (id) this._byId.set(id, el);
            },
        });
        return el;
    }

    getElementById(id) {
        return this._byId.get(String(id)) || null;
    }

    querySelectorAll() {
        return [];
    }
}

class FakeFrame extends FakeElement {
    constructor(stats) {
        super('iframe');
        this.stats = stats;
        this.listeners = new Map();
        this.removeCalls = 0;
        this.contentDocument = new FakePanelDocument(stats);
        this.contentWindow = {
            location: { href: 'http://example.test/chart-host.html' },
            document: this.contentDocument,
            chart: {
                replaySystem: {
                    destroy: () => { stats.replayDestroyed += 1; },
                },
            },
        };
    }

    addEventListener(type, listener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
        this.stats.removedListeners.push({ type, listener });
        const set = this.listeners.get(type);
        if (set) set.delete(listener);
    }

    listenerCount(type) {
        const set = this.listeners.get(type);
        return set ? set.size : 0;
    }

    dispatch(type) {
        const set = this.listeners.get(type);
        if (!set) return;
        for (const listener of Array.from(set)) listener.call(this, { type, target: this });
    }

    remove() {
        this.removeCalls += 1;
        super.remove();
    }
}

function createHarness() {
    const source = fs.readFileSync(MANAGER_SRC, 'utf8');
    const stats = {
        timers: [],
        clearedTimers: [],
        removedListeners: [],
        frames: [],
        createdElements: 0,
        replayDestroyed: 0,
        logs: [],
    };
    let timerId = 0;
    const body = new FakeElement('body');
    body.isConnected = true;
    const head = new FakeElement('head');
    head.isConnected = true;
    const document = {
        readyState: 'complete',
        visibilityState: 'visible',
        body,
        head,
        createElement(tagName) {
            if (String(tagName).toLowerCase() === 'iframe') {
                const frame = new FakeFrame(stats);
                stats.frames.push(frame);
                return frame;
            }
            return new FakeElement(tagName);
        },
        getElementById() {
            return null;
        },
    };
    const sandbox = {
        console,
        document,
        URLSearchParams,
        MultichartGuards: {
            filterForbiddenFields(msg) {
                return { clean: msg, dropped: [] };
            },
        },
        addEventListener() {},
        removeEventListener() {},
        setTimeout(callback, delay) {
            const handle = { id: ++timerId, callback, delay, cleared: false };
            stats.timers.push(handle);
            return handle;
        },
        clearTimeout(handle) {
            if (!handle) return;
            handle.cleared = true;
            stats.clearedTimers.push(handle);
        },
        performance: { now: () => 0 },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: MANAGER_SRC });
    const manager = new sandbox.MultichartManager({
        container: body,
        onLog(entry) { stats.logs.push(entry); },
    });
    return { sandbox, manager, stats, mount: body };
}

function addPanel(harness, id = 'B') {
    harness.manager.addChart({ id, tf: '1m' }, harness.mount);
    const entry = harness.manager.charts.get(id);
    assert.ok(entry, 'chart entry must be stored');
    assert.ok(entry.frame, 'chart entry must store frame');
    return entry;
}

function assertListenersReleased(entry, stats, { load = true, error = true } = {}) {
    if (load) {
        assert.equal(entry.frame.listenerCount('load'), 0, 'load listener removed');
        assert.equal(entry._mcFrameLoadListener, null, 'load listener ref cleared');
        assert.ok(stats.removedListeners.some((r) => r.type === 'load'), 'load removeEventListener called');
    } else {
        assert.equal(entry.frame.listenerCount('load'), 1, 'load listener orphaned when L2 killed');
        assert.equal(typeof entry._mcFrameLoadListener, 'function', 'load listener ref retained when L2 killed');
        assert.ok(!stats.removedListeners.some((r) => r.type === 'load'), 'load removeEventListener skipped when L2 killed');
    }
    if (error) {
        assert.equal(entry.frame.listenerCount('error'), 0, 'error listener removed');
        assert.equal(entry._mcFrameErrorListener, null, 'error listener ref cleared');
        assert.ok(stats.removedListeners.some((r) => r.type === 'error'), 'error removeEventListener called');
    } else {
        assert.equal(entry.frame.listenerCount('error'), 1, 'error listener orphaned when L3 killed');
        assert.equal(typeof entry._mcFrameErrorListener, 'function', 'error listener ref retained when L3 killed');
        assert.ok(!stats.removedListeners.some((r) => r.type === 'error'), 'error removeEventListener skipped when L3 killed');
    }
}

test('provenance: manager mirror byte-identical; L2/L3 switches absent-default truthiness', () => {
    const a = sha256File(MANAGER_SRC);
    const b = sha256File(MANAGER_MIRROR);
    note('mirror-byte-identical', a === b, `sha256=${a.slice(0, 16)}`);
    assert.equal(a, b, 'homepage mirror must be byte-identical to chart tree');

    const src = fs.readFileSync(MANAGER_SRC, 'utf8');
    for (const sw of [LOAD_SWITCH, ERROR_SWITCH]) {
        assert.ok(src.includes(sw), `reserved switch ${sw} present`);
        assert.ok(src.includes(`global.${sw}`), `${sw} uses sibling truthiness read`);
        assert.ok(!new RegExp(
            `hasOwnProperty\\s*\\.\\s*call\\s*\\(\\s*global\\s*,\\s*['"]${sw}['"]`,
        ).test(src),
            `${sw} must not disable on mere property presence`);
        assert.ok(!new RegExp(`${sw}[^\\n]*===\\s*false`).test(src),
            `${sw} must not test switch as === false`);
        assert.ok(!new RegExp(`${sw}[^\\n]*===\\s*true`).test(src),
            `${sw} must not test switch as === true`);
    }

    // Mutant: release still nested only under PURGE-1 (pre-fix tip shape).
    const purgeBlock = src.match(
        /if\s*\(\s*mcPanelStatePurgeV1Enabled\s*\(\s*\)\s*\)\s*\{[\s\S]*?\n        \}/,
    );
    assert.ok(purgeBlock, 'PURGE-1 removeChart block still present for timers');
    assert.ok(!purgeBlock[0].includes("removeEventListener('load'"),
        'load release must not live only inside PURGE-1 block');
    assert.ok(!purgeBlock[0].includes("removeEventListener('error'"),
        'error release must not live only inside PURGE-1 block');
    assert.ok(src.includes('mcIframeLoadListenerReleaseV1Enabled'), 'L2 helper present');
    assert.ok(src.includes('mcIframeErrorListenerReleaseV1Enabled'), 'L3 helper present');
});

test('addChart stores load/error listeners on the iframe entry', () => {
    const h = createHarness();
    const entry = addPanel(h);

    note('entry-stores-listeners',
        typeof entry._mcFrameLoadListener === 'function'
        && typeof entry._mcFrameErrorListener === 'function'
        && entry.frame.listenerCount('load') === 1
        && entry.frame.listenerCount('error') === 1);
    assert.equal(typeof entry._mcFrameLoadListener, 'function');
    assert.equal(typeof entry._mcFrameErrorListener, 'function');
    assert.equal(entry.frame.listenerCount('load'), 1);
    assert.equal(entry.frame.listenerCount('error'), 1);
    assert.equal(entry.frame.listeners.get('load').has(entry._mcFrameLoadListener), true);
    assert.equal(entry.frame.listeners.get('error').has(entry._mcFrameErrorListener), true);
});

test('default: removeChart releases both load and error listeners', () => {
    const h = createHarness();
    delete h.sandbox[LOAD_SWITCH];
    delete h.sandbox[ERROR_SWITCH];
    const entry = addPanel(h);

    h.manager.removeChart('B');

    note('default-both-released',
        entry.frame.listenerCount('load') === 0
        && entry.frame.listenerCount('error') === 0,
        `removed=${h.stats.removedListeners.map((r) => r.type).join(',')}`);
    assertListenersReleased(entry, h.stats, { load: true, error: true });
    assert.equal(h.manager.charts.has('B'), false);
});

test('kill L2 only: load may orphan; error still released', () => {
    const h = createHarness();
    h.sandbox[LOAD_SWITCH] = true;
    delete h.sandbox[ERROR_SWITCH];
    const entry = addPanel(h);

    h.manager.removeChart('B');

    note('kill-l2-only',
        entry.frame.listenerCount('load') === 1
        && entry.frame.listenerCount('error') === 0);
    assertListenersReleased(entry, h.stats, { load: false, error: true });
});

test('kill L3 only: error may orphan; load still released', () => {
    const h = createHarness();
    delete h.sandbox[LOAD_SWITCH];
    h.sandbox[ERROR_SWITCH] = true;
    const entry = addPanel(h);

    h.manager.removeChart('B');

    note('kill-l3-only',
        entry.frame.listenerCount('load') === 0
        && entry.frame.listenerCount('error') === 1);
    assertListenersReleased(entry, h.stats, { load: true, error: false });
});

test('kill both L2 and L3: both listeners orphan (legacy)', () => {
    const h = createHarness();
    h.sandbox[LOAD_SWITCH] = true;
    h.sandbox[ERROR_SWITCH] = true;
    const entry = addPanel(h);

    h.manager.removeChart('B');

    note('kill-both-orphan',
        entry.frame.listenerCount('load') === 1
        && entry.frame.listenerCount('error') === 1);
    assertListenersReleased(entry, h.stats, { load: false, error: false });
});

test('PURGE-1 killed: L2/L3 still release (independent of purge gate)', () => {
    const h = createHarness();
    h.sandbox[PURGE_SWITCH] = true;
    delete h.sandbox[LOAD_SWITCH];
    delete h.sandbox[ERROR_SWITCH];
    const entry = addPanel(h);
    entry.frame.dispatch('load');
    const brandTimers = entry._mcBrandSuppressionTimers.slice();
    assert.ok(brandTimers.length > 0, 'precondition: load armed brand timer under purge-off');

    h.manager.removeChart('B');

    // Mutant dies: if release still gated by purge, listeners survive here.
    note('purge-off-listeners-still-released',
        entry.frame.listenerCount('load') === 0
        && entry.frame.listenerCount('error') === 0
        && brandTimers.every((t) => t.cleared === false),
        'listeners released; brand timers still legacy-leaked under purge kill');
    assertListenersReleased(entry, h.stats, { load: true, error: true });
    assert.ok(brandTimers.every((t) => t.cleared === false),
        'PURGE-1 kill still leaves timer purge off (L2/L3 do not own timers)');
});

test('switch truthiness: false/undefined keep release ON; truthy kills', () => {
    const h = createHarness();

    h.sandbox[LOAD_SWITCH] = false;
    h.sandbox[ERROR_SWITCH] = false;
    const falseEntry = addPanel(h, 'F');
    h.manager.removeChart('F');
    assertListenersReleased(falseEntry, h.stats, { load: true, error: true });
    note('switch-false-release-on', true);

    h.stats.removedListeners.length = 0;
    h.sandbox[LOAD_SWITCH] = undefined;
    h.sandbox[ERROR_SWITCH] = undefined;
    const undefEntry = addPanel(h, 'U');
    h.manager.removeChart('U');
    assertListenersReleased(undefEntry, h.stats, { load: true, error: true });
    note('switch-undefined-release-on', true);

    h.stats.removedListeners.length = 0;
    h.sandbox[LOAD_SWITCH] = 1;
    h.sandbox[ERROR_SWITCH] = '1';
    const truthyEntry = addPanel(h, 'T');
    h.manager.removeChart('T');
    assertListenersReleased(truthyEntry, h.stats, { load: false, error: false });
    note('switch-truthy-kills', true);

    delete h.sandbox[LOAD_SWITCH];
    delete h.sandbox[ERROR_SWITCH];
    h.stats.removedListeners.length = 0;
    const deletedEntry = addPanel(h, 'D');
    h.manager.removeChart('D');
    assertListenersReleased(deletedEntry, h.stats, { load: true, error: true });
    note('switch-deleted-release-on', true);
});

test('host removeChart path does not touch iframe listener release', () => {
    const h = createHarness();
    const hostEntry = {
        id: 'A',
        host: true,
        frame: null,
        _mcFrameLoadListener: () => {},
        _mcFrameErrorListener: () => {},
    };
    h.manager.charts.set('A', hostEntry);
    assert.doesNotThrow(() => h.manager.removeChart('A'));
    note('host-path-untouched', !h.manager.charts.has('A')
        && typeof hostEntry._mcFrameLoadListener === 'function'
        && h.stats.removedListeners.length === 0);
    assert.equal(h.manager.charts.has('A'), false);
    assert.equal(typeof hostEntry._mcFrameLoadListener, 'function');
    assert.equal(h.stats.removedListeners.length, 0);
});

test('throwing frame accessor: map entry still deleted; no throw', () => {
    const h = createHarness();
    const entry = addPanel(h);
    const originalFrame = entry.frame;
    Object.defineProperty(entry, 'frame', {
        configurable: true,
        get() {
            throw new Error('broken frame accessor');
        },
    });

    assert.doesNotThrow(() => h.manager.removeChart('B'));
    note('throwing-frame-survives', !h.manager.charts.has('B'),
        `mapSize=${h.manager.charts.size}`);
    assert.equal(h.manager.charts.has('B'), false);
    // Cannot remove listeners when frame is inaccessible — but teardown continues.
    assert.equal(originalFrame.listenerCount('load'), 1);
    assert.equal(originalFrame.listenerCount('error'), 1);
});
