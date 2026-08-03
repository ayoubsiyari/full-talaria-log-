/**
 * PURGE-1 — manager-held iframe panel references are released by removeChart.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/multichart-prod/harness/purge1-panel-ref-release.test.mjs"
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Walk up to the repo root instead of counting directory levels.
 *
 * This file is mirrored to a tree at a DIFFERENT depth, so a fixed '../../..'
 * resolved to the wrong directory in one of the two locations and the gate there
 * died on load, or failed a cell on a path it built itself. A gate that cannot
 * reach its subject reports a red indistinguishable from a product defect.
 */
function findRoot(start) {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(dir, 'chart v 1.4')) && fs.existsSync(path.join(dir, 'homepage'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error(`ANCHOR_BROKEN: repo root not found from ${start}`);
}

const WORKTREE_ROOT = findRoot(__dirname);
const MANAGER_SRC = path.resolve(__dirname, '..', 'multichart-manager.js');
const MANAGER_MIRROR = path.resolve(
    WORKTREE_ROOT,
    'homepage',
    'public',
    'chart',
    'multichart-prod',
    'multichart-manager.js',
);
const SWITCH = '__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1';

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
        return child;
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

    querySelectorAll(selector) {
        this.stats.querySelectorAll.push(selector);
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
        querySelectorAll: [],
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

function addLoadedPanel(harness, id = 'B') {
    harness.manager.addChart({ id, tf: '1m' }, harness.mount);
    const entry = harness.manager.charts.get(id);
    assert.ok(entry, 'chart entry must be stored');
    assert.ok(entry.frame, 'chart entry must store frame');
    entry.frame.dispatch('load');
    return entry;
}

function assertPurged(entry, stats, { timersBeforeCallback = null } = {}) {
    const frame = entry.frame;
    const brandTimers = entry._mcBrandSuppressionTimersSnapshot || [];
    const bridgeTimers = entry._mcBridgeReadyTimeoutsSnapshot || [];

    assert.ok(brandTimers.length > 0, 'brand timer snapshot populated before purge');
    assert.ok(bridgeTimers.length > 0, 'bridge-ready timer snapshot populated before purge');
    assert.equal(frame.listenerCount('load'), 0, 'load listener removed');
    assert.equal(frame.listenerCount('error'), 0, 'error listener removed');
    assert.ok(stats.removedListeners.some((r) => r.type === 'load'), 'load removeEventListener called');
    assert.ok(stats.removedListeners.some((r) => r.type === 'error'), 'error removeEventListener called');
    assert.equal(entry._mcBrandSuppressionTimers.length, 0, 'brand timer list cleared');
    assert.equal(entry._mcBridgeReadyTimeouts.length, 0, 'bridge timeout list cleared');
    assert.ok(brandTimers.every((t) => t.cleared), 'brand timers cancelled');
    assert.ok(bridgeTimers.every((t) => t.cleared), 'bridge-ready timers cancelled');
    assert.equal(frame.removeCalls, 1, 'iframe removed after purge');
    assert.ok(stats.replayDestroyed >= 1, 'existing replay teardown still runs');

    if (timersBeforeCallback != null) {
        brandTimers[0].callback();
        assert.equal(stats.timers.length, timersBeforeCallback, 'removed brand chain does not re-arm');
    }
}

test('provenance: manager mirror is byte-identical and PURGE-1 switch is absent-default', () => {
    const a = sha256File(MANAGER_SRC);
    const b = sha256File(MANAGER_MIRROR);
    note('mirror-byte-identical', a === b, `sha256=${a.slice(0, 16)}`);
    assert.equal(a, b, 'homepage mirror must be byte-identical to chart tree');

    const src = fs.readFileSync(MANAGER_SRC, 'utf8');
    assert.ok(src.includes(SWITCH), 'reserved PURGE-1 switch name present');
    assert.ok(src.includes(`global.${SWITCH}`), 'PURGE-1 switch uses sibling truthiness read');
    assert.ok(!new RegExp(
        `hasOwnProperty\\s*\\.\\s*call\\s*\\(\\s*global\\s*,\\s*['"]${SWITCH}['"]`,
    ).test(src),
        'PURGE-1 switch must not disable on mere property presence');
    assert.ok(!new RegExp(`${SWITCH}[^\\n]*===\\s*false`).test(src), 'must not test switch as === false');
});

test('entry stores brand timer, bridge-ready timeout, and iframe load/error listeners', () => {
    const h = createHarness();
    const entry = addLoadedPanel(h);

    const brandTimers = entry._mcBrandSuppressionTimers.slice();
    const bridgeTimers = entry._mcBridgeReadyTimeouts.slice();
    entry._mcBrandSuppressionTimersSnapshot = brandTimers;
    entry._mcBridgeReadyTimeoutsSnapshot = bridgeTimers;

    note('entry-stores-handles', brandTimers.length === 1
        && bridgeTimers.length === 1
        && typeof entry._mcFrameLoadListener === 'function'
        && typeof entry._mcFrameErrorListener === 'function');
    assert.equal(brandTimers.length, 1, 'entry stores pending brand suppression timer handle');
    assert.equal(brandTimers[0].delay, 250);
    assert.equal(bridgeTimers.length, 1, 'entry stores bridge-ready timeout handle');
    assert.equal(bridgeTimers[0].delay, 30000);
    assert.equal(entry.frame.listenerCount('load'), 1, 'load listener installed');
    assert.equal(entry.frame.listenerCount('error'), 1, 'error listener installed');
});

test('removeChart cancels stored timers and removes iframe listeners during teardown', () => {
    const h = createHarness();
    const entry = addLoadedPanel(h);
    entry._mcBrandSuppressionTimersSnapshot = entry._mcBrandSuppressionTimers.slice();
    entry._mcBridgeReadyTimeoutsSnapshot = entry._mcBridgeReadyTimeouts.slice();

    h.manager.removeChart('B');

    note('remove-cancels-and-removes', true,
        `cleared=${h.stats.clearedTimers.length} removedListeners=${h.stats.removedListeners.length}`);
    assert.equal(h.manager.charts.has('B'), false, 'entry removed from manager map');
    assertPurged(entry, h.stats);
});

test('brand suppression chain stops rescheduling after panel removal', () => {
    const h = createHarness();
    const entry = addLoadedPanel(h);
    const brandTimers = entry._mcBrandSuppressionTimers.slice();
    entry._mcBrandSuppressionTimersSnapshot = brandTimers;
    entry._mcBridgeReadyTimeoutsSnapshot = entry._mcBridgeReadyTimeouts.slice();

    h.manager.removeChart('B');
    const timersBeforeCallback = h.stats.timers.length;
    assertPurged(entry, h.stats, { timersBeforeCallback });
    note('brand-chain-stops-after-remove', true, `timers=${timersBeforeCallback}`);
});

test('removeChart survives throwing frame accessor and deletes the map entry', () => {
    const h = createHarness();
    const entry = addLoadedPanel(h);
    const originalFrame = entry.frame;
    Object.defineProperty(entry, 'frame', {
        configurable: true,
        get() {
            throw new Error('broken frame accessor');
        },
    });

    assert.doesNotThrow(() => h.manager.removeChart('B'));
    note('remove-survives-throwing-frame-accessor', !h.manager.charts.has('B'),
        `mapSize=${h.manager.charts.size}`);
    assert.equal(h.manager.charts.has('B'), false, 'broken entry deleted from manager map');
    assert.equal(originalFrame.removeCalls, 0, 'inaccessible frame itself cannot be removed');
});

test('dispose continues tearing down other panels when one entry has a throwing frame accessor', () => {
    const h = createHarness();
    const first = addLoadedPanel(h, 'A');
    const broken = addLoadedPanel(h, 'B');
    const third = addLoadedPanel(h, 'C');
    Object.defineProperty(broken, 'frame', {
        configurable: true,
        get() {
            throw new Error('broken frame accessor');
        },
    });

    assert.doesNotThrow(() => h.manager.dispose());
    const connectedFrames = h.stats.frames.filter((frame) => frame.isConnected);
    note('dispose-continues-after-broken-entry', h.manager.charts.size === 0
        && first.frame.removeCalls === 1
        && third.frame.removeCalls === 1,
        `mapSize=${h.manager.charts.size} connected=${connectedFrames.length}`);
    assert.equal(h.manager.charts.size, 0, 'dispose deletes every chart entry');
    assert.equal(first.frame.removeCalls, 1, 'first iframe removed');
    assert.equal(third.frame.removeCalls, 1, 'third iframe removed');
    assert.equal(connectedFrames.length, 1, 'only inaccessible broken iframe remains connected');
});

test('double iframe load stores both brand handles and removeChart cancels both', () => {
    const h = createHarness();
    const entry = addLoadedPanel(h);
    entry.frame.dispatch('load');
    entry._mcBrandSuppressionTimersSnapshot = entry._mcBrandSuppressionTimers.slice();
    entry._mcBridgeReadyTimeoutsSnapshot = entry._mcBridgeReadyTimeouts.slice();

    note('double-load-stores-all-handles', entry._mcBrandSuppressionTimers.length === 2
        && entry._mcBridgeReadyTimeouts.length === 2,
        `brand=${entry._mcBrandSuppressionTimers.length} bridge=${entry._mcBridgeReadyTimeouts.length}`);
    assert.equal(entry._mcBrandSuppressionTimers.length, 2, 'double load stores both brand timer handles');
    assert.equal(entry._mcBridgeReadyTimeouts.length, 2, 'double load stores both bridge timer handles');

    h.manager.removeChart('B');

    assertPurged(entry, h.stats);
});

test('late captured load callback after removal does not arm a bridge-ready timeout', () => {
    const h = createHarness();
    h.manager.addChart({ id: 'B', tf: '1m' }, h.mount);
    const entry = h.manager.charts.get('B');
    const capturedLoad = entry._mcFrameLoadListener;

    h.manager.removeChart('B');
    const timersBeforeLateLoad = h.stats.timers.length;
    capturedLoad();

    note('late-load-after-remove-does-not-arm-bridge-timeout',
        h.stats.timers.length === timersBeforeLateLoad,
        `timers=${timersBeforeLateLoad}`);
    assert.equal(h.stats.timers.length, timersBeforeLateLoad,
        'post-removal load callback must not arm any fresh timer');
});

test('panel removed flag stops brand chain when iframe removal is skipped', () => {
    const h = createHarness();
    const entry = addLoadedPanel(h);
    entry._mcBrandSuppressionTimersSnapshot = entry._mcBrandSuppressionTimers.slice();
    entry._mcBridgeReadyTimeoutsSnapshot = entry._mcBridgeReadyTimeouts.slice();
    entry.frame.remove = function () {
        this.removeCalls += 1;
        throw new Error('remove failed');
    };

    h.manager.removeChart('B');
    const timersBeforeCallback = h.stats.timers.length;
    entry._mcBrandSuppressionTimersSnapshot[0].callback();

    note('panel-removed-flag-stops-chain-with-connected-frame',
        h.stats.timers.length === timersBeforeCallback && entry.frame.isConnected === true,
        `timers=${timersBeforeCallback}`);
    assert.equal(h.stats.timers.length, timersBeforeCallback,
        '_mcPanelRemoved must stop re-arm even when frame.remove did not detach');
    assert.equal(entry.frame.isConnected, true, 'test keeps frame connected to isolate _mcPanelRemoved');
});

test('removeChart purges timers and listeners for an already-detached iframe', () => {
    const h = createHarness();
    const entry = addLoadedPanel(h);
    entry._mcBrandSuppressionTimersSnapshot = entry._mcBrandSuppressionTimers.slice();
    entry._mcBridgeReadyTimeoutsSnapshot = entry._mcBridgeReadyTimeouts.slice();
    entry.frame.remove();
    assert.equal(entry.frame.isConnected, false, 'precondition: React already detached frame');

    h.manager.removeChart('B');

    note('already-detached-frame-still-purged', entry._mcBrandSuppressionTimers.length === 0
        && entry._mcBridgeReadyTimeouts.length === 0,
        `cleared=${h.stats.clearedTimers.length}`);
    assert.equal(h.manager.charts.has('B'), false, 'entry removed from manager map');
    assert.equal(entry._mcBrandSuppressionTimers.length, 0, 'brand timers cleared even after detach');
    assert.equal(entry._mcBridgeReadyTimeouts.length, 0, 'bridge timers cleared even after detach');
    assert.equal(entry.frame.listenerCount('load'), 0, 'load listener removed after detach');
    assert.equal(entry.frame.listenerCount('error'), 0, 'error listener removed after detach');
    assert.ok(entry._mcBrandSuppressionTimersSnapshot.every((t) => t.cleared), 'brand timer cancelled after detach');
    assert.ok(entry._mcBridgeReadyTimeoutsSnapshot.every((t) => t.cleared), 'bridge timer cancelled after detach');
});

test('kill switch round trip: absent, false, undefined purge; true restores legacy leak; delete purges again', () => {
    const h = createHarness();

    delete h.sandbox[SWITCH];
    const absent = addLoadedPanel(h, 'B');
    absent._mcBrandSuppressionTimersSnapshot = absent._mcBrandSuppressionTimers.slice();
    absent._mcBridgeReadyTimeoutsSnapshot = absent._mcBridgeReadyTimeouts.slice();
    h.manager.removeChart('B');
    const absentTimerCount = h.stats.timers.length;
    assertPurged(absent, h.stats, { timersBeforeCallback: absentTimerCount });
    note('switch-absent-purge-active', true, `timers=${absentTimerCount}`);

    h.sandbox[SWITCH] = false;
    const falsePresent = addLoadedPanel(h, 'C');
    falsePresent._mcBrandSuppressionTimersSnapshot = falsePresent._mcBrandSuppressionTimers.slice();
    falsePresent._mcBridgeReadyTimeoutsSnapshot = falsePresent._mcBridgeReadyTimeouts.slice();
    h.manager.removeChart('C');
    const falseTimerCount = h.stats.timers.length;
    assertPurged(falsePresent, h.stats, { timersBeforeCallback: falseTimerCount });
    note('switch-false-purge-active', true, `timers=${falseTimerCount}`);

    h.sandbox[SWITCH] = undefined;
    const undefinedPresent = addLoadedPanel(h, 'D');
    undefinedPresent._mcBrandSuppressionTimersSnapshot = undefinedPresent._mcBrandSuppressionTimers.slice();
    undefinedPresent._mcBridgeReadyTimeoutsSnapshot = undefinedPresent._mcBridgeReadyTimeouts.slice();
    h.manager.removeChart('D');
    const undefinedTimerCount = h.stats.timers.length;
    assertPurged(undefinedPresent, h.stats, { timersBeforeCallback: undefinedTimerCount });
    note('switch-undefined-purge-active', true, `timers=${undefinedTimerCount}`);

    h.sandbox[SWITCH] = true;
    const disabled = addLoadedPanel(h, 'E');
    const disabledBrandTimers = disabled._mcBrandSuppressionTimers.slice();
    const disabledBridgeTimers = disabled._mcBridgeReadyTimeouts.slice();
    h.manager.removeChart('E');
    // ORPHAN-L2/L3 own iframe load/error release (not PURGE-gated).
    assert.equal(disabled.frame.listenerCount('load'), 0,
        'PURGE-off still releases load listener (owned by ORPHAN-L2)');
    assert.equal(disabled.frame.listenerCount('error'), 0,
        'PURGE-off still releases error listener (owned by ORPHAN-L3)');
    const beforeLegacyTick = h.stats.timers.length;
    disabledBrandTimers[0].callback();
    const timerLeakRestored = disabledBrandTimers.every((t) => t.cleared === false)
        && disabledBridgeTimers.every((t) => t.cleared === false)
        && h.stats.timers.length === beforeLegacyTick + 1;
    note('switch-present-restores-legacy-timer-leak', timerLeakRestored,
        `listeners=${disabled.frame.listenerCount('load')}/${disabled.frame.listenerCount('error')} `
        + `timersBefore=${beforeLegacyTick} timersAfter=${h.stats.timers.length}`);
    assert.equal(timerLeakRestored, true,
        'PURGE-off still leaks brand/bridge timers (PURGE-1 ownership); listeners owned by L2/L3');

    delete h.sandbox[SWITCH];
    const removedAgain = addLoadedPanel(h, 'F');
    removedAgain._mcBrandSuppressionTimersSnapshot = removedAgain._mcBrandSuppressionTimers.slice();
    removedAgain._mcBridgeReadyTimeoutsSnapshot = removedAgain._mcBridgeReadyTimeouts.slice();
    h.manager.removeChart('F');
    const removedAgainTimerCount = h.stats.timers.length;
    assertPurged(removedAgain, h.stats, { timersBeforeCallback: removedAgainTimerCount });
    note('switch-deleted-purge-active', true, `timers=${removedAgainTimerCount}`);

    note('switch-round-trip-without-reload', true,
        'absent→false→undefined→true→delete exercised in one manager realm');
});
