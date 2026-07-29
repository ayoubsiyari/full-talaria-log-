/**
 * REALM-TEARDOWN-RELEASE — five independent removeChart realm-release cuts.
 *
 *   node --test --test-concurrency=1 realm-teardown-release.test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKTREE_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MANAGER_SRC = path.resolve(__dirname, '..', 'multichart-manager.js');
const MANAGER_MIRROR = path.resolve(
    WORKTREE_ROOT,
    'homepage',
    'public',
    'chart',
    'multichart-prod',
    'multichart-manager.js',
);
const INDICATORS_SRC = path.resolve(
    WORKTREE_ROOT,
    'chart v 1.4',
    'chart',
    'modules',
    'chart-indicators-full.js',
);
const INDICATORS_MIRROR = path.resolve(
    WORKTREE_ROOT,
    'homepage',
    'public',
    'chart',
    'modules',
    'chart-indicators-full.js',
);
const CUSTOM_SRC = path.resolve(
    WORKTREE_ROOT,
    'chart v 1.4',
    'chart',
    'modules',
    'custom-indicators-runtime.js',
);
const CUSTOM_MIRROR = path.resolve(
    WORKTREE_ROOT,
    'homepage',
    'public',
    'chart',
    'modules',
    'custom-indicators-runtime.js',
);

const FLAGS = {
    drag: '__TALARIA_DISABLE_MC_RELEASE_DRAG_GUARD_V1',
    order: '__TALARIA_DISABLE_MC_RELEASE_ORDER_REGISTRY_V1',
    tfAbort: '__TALARIA_DISABLE_MC_RELEASE_TF_ABORT_V1',
    indWorker: '__TALARIA_DISABLE_MC_RELEASE_INDICATOR_WORKER_V1',
    blobWorker: '__TALARIA_DISABLE_MC_RELEASE_BLOB_WORKER_V1',
};
const STASH_FLAG = '__TALARIA_DISABLE_MC_STASHED_PANEL_HANDLE_V1';
const ALL_FLAGS = Object.values(FLAGS);
const OM_KEYS = [
    'orderLines', 'slLines', 'tpLines', 'beLines',
    'entryMarkers', 'exitMarkers', 'splitGroupAvgLines',
    'multiTPAvgLines', 'pendingTargetLines', 'tradeConnectors',
    'partialCloseMarkers', 'mfeMaeMarkers',
];

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
        const tokens = new Set();
        const el = this;
        this.classList = {
            add(...names) {
                for (const t of names) tokens.add(String(t));
                el.className = Array.from(tokens).join(' ');
            },
            remove(...names) {
                for (const t of names) tokens.delete(String(t));
                el.className = Array.from(tokens).join(' ');
            },
            contains(name) {
                return tokens.has(String(name));
            },
        };
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

    querySelectorAll() {
        return [];
    }
}

function makeReleaseProbe(stats) {
    const abortCalls = { count: 0 };
    const abortController = {
        abort() {
            abortCalls.count += 1;
            if (this._throwOnAbort) throw new Error('abort boom');
        },
        _throwOnAbort: false,
    };
    const panelChart = {
        _removeDragEndGuardCalls: 0,
        _disposeIndicatorWorkerCalls: 0,
        _releaseSharedBarStoreFileRefsCalls: 0,
        _timeframeFetchAbort: abortController,
        _abortCalls: abortCalls,
        replaySystem: {
            destroy() { stats.replayDestroyed += 1; },
        },
        _removeDragEndGuard() {
            panelChart._removeDragEndGuardCalls += 1;
            if (panelChart._throwDrag) throw new Error('drag boom');
        },
        _disposeIndicatorWorker() {
            panelChart._disposeIndicatorWorkerCalls += 1;
            panelChart._pendingCleared = true;
            panelChart._workerTerminated = true;
            if (panelChart._throwIndWorker) throw new Error('ind worker boom');
        },
        _releaseSharedBarStoreFileRefs() {
            panelChart._releaseSharedBarStoreFileRefsCalls += 1;
        },
        _throwDrag: false,
        _throwIndWorker: false,
        _pendingCleared: false,
        _workerTerminated: false,
    };
    const customApi = {
        disposeCalls: 0,
        revoked: false,
        disposeWorker() {
            customApi.disposeCalls += 1;
            customApi.revoked = true;
            if (customApi._throw) throw new Error('blob boom');
        },
        _throw: false,
    };
    return { panelChart, abortController, abortCalls, customApi };
}

class FakeFrame extends FakeElement {
    constructor(stats) {
        super('iframe');
        this.stats = stats;
        this.listeners = new Map();
        this.removeCalls = 0;
        this.contentDocument = new FakePanelDocument(stats);
        const probe = makeReleaseProbe(stats);
        this._probe = probe;
        this.contentWindow = {
            location: { href: 'http://example.test/chart-host.html' },
            document: this.contentDocument,
            chart: probe.panelChart,
            TalariaCustomIndicators: probe.customApi,
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

function makeHostOrderManager(hostChart, panelChart) {
    const om = {
        stripCalls: 0,
        _stripThrow: false,
        _stripOrderDrawingLayersFromChart(chart) {
            om.stripCalls += 1;
            if (om._stripThrow) throw new Error('strip boom');
            void chart;
        },
    };
    for (const key of OM_KEYS) {
        om[key] = [
            { id: `host-${key}`, chart: hostChart },
            { id: `panel-${key}`, chart: panelChart },
        ];
    }
    return om;
}

function clearAllFlags(sandbox) {
    for (const flag of ALL_FLAGS) delete sandbox[flag];
    delete sandbox[STASH_FLAG];
}

function stashViaBridgeReady(harness, entry, id) {
    harness.manager._onWindowMessage({
        data: { type: 'bridge-ready', source: id },
    });
    assert.ok(entry.panelWinStash, 'bridge-ready must stash panelWin');
    assert.ok(entry.panelChartStash, 'bridge-ready must stash panelChart');
    return entry;
}

function detachFrame(entry) {
    const liveWin = entry.frame.contentWindow;
    const liveChart = liveWin && liveWin.chart;
    entry.frame.contentWindow = null;
    assert.equal(entry.frame.contentWindow, null, 'contentWindow must be null (detached)');
    return { liveWin, liveChart };
}

function createHarness(opts = {}) {
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
    const hostChart = { id: 'host-chart' };
    const hostOm = {
        stripCalls: 0,
        _stripThrow: false,
        _stripOrderDrawingLayersFromChart(chart) {
            hostOm.stripCalls += 1;
            if (hostOm._stripThrow) throw new Error('strip boom');
            void chart;
        },
        orderLines: [],
        slLines: [],
        tpLines: [],
        beLines: [],
        entryMarkers: [],
        exitMarkers: [],
        splitGroupAvgLines: [],
        multiTPAvgLines: [],
        pendingTargetLines: [],
        tradeConnectors: [],
        partialCloseMarkers: [],
        mfeMaeMarkers: [],
    };
    hostChart.orderManager = hostOm;
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
        chart: hostChart,
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    if (opts.flags) {
        for (const [k, v] of Object.entries(opts.flags)) sandbox[k] = v;
    }
    vm.runInNewContext(source, sandbox, { filename: MANAGER_SRC });
    const manager = new sandbox.MultichartManager({
        container: body,
        onLog(entry) { stats.logs.push(entry); },
    });
    return { sandbox, manager, stats, mount: body, hostChart, hostOm };
}

function addLoadedPanel(harness, id = 'B') {
    harness.manager.addChart({ id, tf: '1m' }, harness.mount);
    const entry = harness.manager.charts.get(id);
    assert.ok(entry, 'chart entry must be stored');
    assert.ok(entry.frame, 'chart entry must store frame');
    entry.frame.dispatch('load');
    return entry;
}

function seedHostOmForPanel(harness, panelChart) {
    const om = makeHostOrderManager(harness.hostChart, panelChart);
    harness.hostChart.orderManager = om;
    harness.hostOm = om;
    harness.sandbox.chart = harness.hostChart;
    return om;
}

function probeOf(entry) {
    return entry.frame._probe;
}

function assertRemoveCompleted(harness, entry, id) {
    assert.equal(entry.frame.removeCalls, 1, 'c.frame.remove() ran');
    assert.equal(harness.manager.charts.has(id), false, 'charts.delete(id) happened');
}

function assertCut1Ran(probe) {
    assert.equal(probe.panelChart._removeDragEndGuardCalls, 1, 'cut1: drag guard removed');
}
function assertCut1Skipped(probe) {
    assert.equal(probe.panelChart._removeDragEndGuardCalls, 0, 'cut1: drag guard NOT removed');
}
function assertCut2Ran(om, panelChart, hostChart) {
    assert.ok(om.stripCalls >= 1, 'cut2: strip called');
    for (const key of OM_KEYS) {
        const arr = om[key];
        assert.ok(Array.isArray(arr), `cut2: ${key} is array`);
        assert.equal(arr.some((e) => e.chart === panelChart), false, `cut2: ${key} panel entries pruned`);
        assert.equal(arr.some((e) => e.chart === hostChart), true, `cut2: ${key} host entries survive`);
        assert.equal(arr.length, 1, `cut2: ${key} only host remains`);
    }
}
function assertCut2Skipped(om, panelChart, hostChart) {
    assert.equal(om.stripCalls, 0, 'cut2: strip NOT called');
    for (const key of OM_KEYS) {
        assert.equal(om[key].length, 2, `cut2 off: ${key} untouched`);
        assert.equal(om[key].some((e) => e.chart === panelChart), true);
        assert.equal(om[key].some((e) => e.chart === hostChart), true);
    }
}
function assertCut3Ran(probe) {
    assert.equal(probe.abortCalls.count, 1, 'cut3: abort called');
    assert.equal(probe.panelChart._timeframeFetchAbort, null, 'cut3: abort nulled');
}
function assertCut3Skipped(probe) {
    assert.equal(probe.abortCalls.count, 0, 'cut3: abort NOT called');
    assert.ok(probe.panelChart._timeframeFetchAbort, 'cut3: abort controller retained');
}
function assertCut4Ran(probe) {
    assert.equal(probe.panelChart._disposeIndicatorWorkerCalls, 1, 'cut4: dispose called');
    assert.equal(probe.panelChart._pendingCleared, true, 'cut4: pending cleared');
    assert.equal(probe.panelChart._workerTerminated, true, 'cut4: worker terminated');
}
function assertCut4Skipped(probe) {
    assert.equal(probe.panelChart._disposeIndicatorWorkerCalls, 0, 'cut4: dispose NOT called');
}
function assertCut5Ran(probe) {
    assert.equal(probe.customApi.disposeCalls, 1, 'cut5: disposeWorker called');
    assert.equal(probe.customApi.revoked, true, 'cut5: blob revoked');
}
function assertCut5Skipped(probe) {
    assert.equal(probe.customApi.disposeCalls, 0, 'cut5: disposeWorker NOT called');
    assert.equal(probe.customApi.revoked, false, 'cut5: blob NOT revoked');
}

function assertAllCutsRan(probe, om, hostChart) {
    assertCut1Ran(probe);
    assertCut2Ran(om, probe.panelChart, hostChart);
    assertCut3Ran(probe);
    assertCut4Ran(probe);
    assertCut5Ran(probe);
}

// ── provenance / mirrors ──────────────────────────────────────────────────

test('provenance: writable mirrors are byte-identical', () => {
    const pairs = [
        ['manager', MANAGER_SRC, MANAGER_MIRROR],
        ['indicators', INDICATORS_SRC, INDICATORS_MIRROR],
        ['custom', CUSTOM_SRC, CUSTOM_MIRROR],
    ];
    for (const [name, a, b] of pairs) {
        const ha = sha256File(a);
        const hb = sha256File(b);
        note(`mirror-${name}`, ha === hb, `sha256=${ha.slice(0, 16)}`);
        assert.equal(ha, hb, `${name} mirror must be byte-identical`);
    }
});

// ── CUT 1 ─────────────────────────────────────────────────────────────────

test('cut1-ON: FLAG absent ⇒ _removeDragEndGuard called', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut1Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut1-ON', true);
});

test('cut1-OFF: FLAG truthy ⇒ _removeDragEndGuard NOT called; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    h.sandbox[FLAGS.drag] = true;
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut1Skipped(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut1-OFF', true);
});

// ── CUT 2 ─────────────────────────────────────────────────────────────────

test('cut2-ON: FLAG absent ⇒ registries pruned for panel only', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    const om = seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut2Ran(om, probe.panelChart, h.hostChart);
    assertRemoveCompleted(h, entry, 'B');
    note('cut2-ON', true);
});

test('cut2-OFF: FLAG truthy ⇒ registries untouched; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    h.sandbox[FLAGS.order] = true;
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    const om = seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut2Skipped(om, probe.panelChart, h.hostChart);
    assertRemoveCompleted(h, entry, 'B');
    note('cut2-OFF', true);
});

test('cut2-HOST-SAFETY: only panel entries pruned; every host entry survives', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    const om = seedHostOmForPanel(h, probe.panelChart);
    // Extra host-only rows without panel twin — must survive.
    for (const key of OM_KEYS) {
        om[key].push({ id: `host-extra-${key}`, chart: h.hostChart });
    }
    h.manager.removeChart('B');
    for (const key of OM_KEYS) {
        const arr = om[key];
        assert.equal(arr.every((e) => e.chart !== probe.panelChart), true,
            `${key}: no panel entries remain`);
        assert.equal(arr.filter((e) => e.chart === h.hostChart).length, 2,
            `${key}: both host entries survive`);
    }
    assertRemoveCompleted(h, entry, 'B');
    note('cut2-HOST-SAFETY', true);
});

// ── CUT 3 ─────────────────────────────────────────────────────────────────

test('cut3-ON: FLAG absent ⇒ timeframe fetch aborted and nulled', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut3Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut3-ON', true);
});

test('cut3-OFF: FLAG truthy ⇒ abort NOT called; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    h.sandbox[FLAGS.tfAbort] = true;
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut3Skipped(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut3-OFF', true);
});

// ── CUT 4 ─────────────────────────────────────────────────────────────────

test('cut4-ON: FLAG absent ⇒ _disposeIndicatorWorker called (terminate+pending clear)', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut4Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut4-ON', true);
});

test('cut4-OFF: FLAG truthy ⇒ dispose NOT called; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    h.sandbox[FLAGS.indWorker] = true;
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut4Skipped(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut4-OFF', true);
});

test('cut4-DISPOSER-PENDING: Chart.prototype._disposeIndicatorWorker terminates + clears pending', () => {
    const text = fs.readFileSync(INDICATORS_SRC, 'utf8');
    class Chart {}
    const workers = [];
    function Worker() {
        const w = {
            terminated: false,
            terminate() { this.terminated = true; },
            onmessage: null,
            onerror: null,
            postMessage() {},
        };
        workers.push(w);
        return w;
    }
    const window = {
        Chart,
        console: { log() {}, warn() {}, error() {} },
        setTimeout() {},
        clearTimeout() {},
        document: {
            createElement() { return { style: {}, appendChild() {} }; },
            head: { appendChild() {} },
            getElementById() { return null; },
            querySelector() { return null; },
            querySelectorAll() { return []; },
        },
    };
    const context = vm.createContext({
        window,
        self: window,
        document: window.document,
        console: window.console,
        setTimeout: window.setTimeout,
        clearTimeout: window.clearTimeout,
        Worker,
        Map,
        Date,
        Math,
        Array,
        Object,
        Number,
        String,
        Boolean,
        JSON,
        Error,
    });
    vm.runInContext(text, context, { filename: 'chart-indicators-full.js' });
    // Force init (module polls for Chart)
    for (let i = 0; i < 5; i++) {
        if (typeof Chart.prototype._disposeIndicatorWorker === 'function') break;
    }
    assert.equal(typeof Chart.prototype._disposeIndicatorWorker, 'function',
        'disposer attached to Chart.prototype');

    // Spin a worker via recalculate path if available; else plant singleton by calling dispose after seeding via source markers.
    // Exercise by invoking get-path: create worker through private path if exposed, else call dispose on empty then re-seed via reflection.
    // Direct behavioural proof: install a pending entry by calling the disposer after manually constructing via a temporary chart that triggers worker creation.
    const chart = new Chart();
    chart.data = [];
    chart.indicators = { active: [], data: {} };

    // Seed singleton + pending by evaluating a tiny helper that reaches module scope through the disposer contract:
    // Call dispose once (no-op), then re-read source to confirm clear is present AND run a sandbox extract of the dispose body.
    const disposeSrc = text.match(
        /Chart\.prototype\._disposeIndicatorWorker\s*=\s*function\s*\(\)\s*\{[\s\S]*?\n    \};/,
    );
    assert.ok(disposeSrc, 'dispose source present');
    assert.ok(disposeSrc[0].includes('_workerPending.clear()'), 'dispose clears _workerPending');
    assert.ok(disposeSrc[0].includes('terminate'), 'dispose terminates worker');

    // Live behavioural: create worker singleton by invoking _getIndicatorWorker via a side channel —
    // attach a test hook by running a fragment that closes over the same pattern.
    // Instead, call dispose after forcing worker creation through Worker constructor count.
    // The module creates the worker lazily; call dispose and verify it is safe, then
    // re-run a miniature replica of the dispose contract in-module by calling it twice.
    Chart.prototype._disposeIndicatorWorker.call(chart);

    // Build a local replica matching the product disposer semantics for pending clear proof,
    // then assert product source contains the same reject+clear sequence as onerror.
    const onerrorClear = /_workerPending\.forEach\(function\(p\)\s*\{\s*p\.reject/;
    const disposeClear = /_workerPending\.forEach\(function\(p\)\s*\{\s*try\s*\{\s*p\.reject/;
    assert.ok(onerrorClear.test(text) || text.includes('_workerPending.forEach'),
        'onerror pending reject pattern present');
    assert.ok(disposeClear.test(text) || (
        text.includes('_disposeIndicatorWorker')
        && text.includes('_workerPending.clear()')
        && text.includes('worker disposed')
    ), 'dispose rejects and clears pending');

    // Stronger live test: extract dispose into a sandbox with controllable singleton/pending.
    const extract = `
      var _indicatorWorkerSingleton = { terminateCalls: 0, terminate: function(){ this.terminateCalls++; } };
      var _workerPending = new Map();
      var rejected = [];
      _workerPending.set(1, { reject: function(e){ rejected.push(String(e && e.message || e)); } });
      _workerPending.set(2, { reject: function(e){ rejected.push(String(e && e.message || e)); } });
      ${disposeSrc[0]}
      Chart.prototype._disposeIndicatorWorker.call({});
      this.__result = {
        singletonNull: _indicatorWorkerSingleton === null,
        terminateCalls: 1,
        pendingSize: _workerPending.size,
        rejected: rejected.slice(),
      };
      // terminateCalls from the object before nulling:
    `;
    // Fix extract: capture terminateCalls before null
    const extract2 = `
      var term = { terminateCalls: 0, terminate: function(){ this.terminateCalls++; } };
      var _indicatorWorkerSingleton = term;
      var _workerPending = new Map();
      var rejected = [];
      _workerPending.set(1, { reject: function(e){ rejected.push(String(e && e.message || e)); } });
      _workerPending.set(2, { reject: function(e){ rejected.push(String(e && e.message || e)); } });
      function dispose() {
        try {
          if (_indicatorWorkerSingleton) {
            try { _indicatorWorkerSingleton.terminate(); } catch (_) {}
          }
        } catch (_) {}
        _indicatorWorkerSingleton = null;
        try {
          _workerPending.forEach(function(p) {
            try { p.reject(new Error('worker disposed')); } catch (_) {}
          });
          _workerPending.clear();
        } catch (_) {}
      }
      dispose();
      this.__result = {
        singletonNull: _indicatorWorkerSingleton === null,
        terminateCalls: term.terminateCalls,
        pendingSize: _workerPending.size,
        rejectedCount: rejected.length,
      };
    `;
    // Prefer executing the actual extracted product function against local vars —
    // rewrite product body to use our locals by evaluating Chart.prototype assignment.
    const liveCtx = { Chart: class {}, Error, Map };
    vm.runInNewContext(
        `var _indicatorWorkerSingleton = null; var _workerPending = new Map();\n`
        + `var term = { terminateCalls: 0, terminate: function(){ this.terminateCalls++; } };\n`
        + `_indicatorWorkerSingleton = term;\n`
        + `var rejected = [];\n`
        + `_workerPending.set(1, { reject: function(e){ rejected.push(1); } });\n`
        + `_workerPending.set(2, { reject: function(e){ rejected.push(2); } });\n`
        + disposeSrc[0] + '\n'
        + `Chart.prototype._disposeIndicatorWorker.call({});\n`
        + `this.__result = { singletonNull: _indicatorWorkerSingleton === null, terminateCalls: term.terminateCalls, pendingSize: _workerPending.size, rejectedCount: rejected.length };\n`,
        liveCtx,
        { filename: 'dispose-live.js' },
    );
    assert.equal(liveCtx.__result.singletonNull, true);
    assert.equal(liveCtx.__result.terminateCalls, 1);
    assert.equal(liveCtx.__result.pendingSize, 0, 'M5: pending map must be cleared');
    assert.equal(liveCtx.__result.rejectedCount, 2);
    note('cut4-DISPOSER-PENDING', true,
        `term=${liveCtx.__result.terminateCalls} pending=${liveCtx.__result.pendingSize}`);
    void extract;
    void extract2;
});

// ── CUT 5 ─────────────────────────────────────────────────────────────────

test('cut5-ON: FLAG absent ⇒ blob worker disposeWorker/revoke called', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut5Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut5-ON', true);
});

test('cut5-OFF: FLAG truthy ⇒ disposeWorker NOT called; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    h.sandbox[FLAGS.blobWorker] = true;
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    h.manager.removeChart('B');
    assertCut5Skipped(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('cut5-OFF', true);
});

test('cut5-DISPOSER-REVOKE: TalariaCustomIndicators.disposeWorker terminates + revokes URL', () => {
    const text = fs.readFileSync(CUSTOM_SRC, 'utf8');
    const revoked = [];
    const terminated = [];
    const sandbox = {
        Blob: class {
            constructor(parts) { this.parts = parts; }
        },
        URL: {
            createObjectURL() { return 'blob:test-url-1'; },
            revokeObjectURL(url) { revoked.push(url); },
        },
        Worker: class {
            constructor(url) {
                this.url = url;
                this.onmessage = null;
                this.onerror = null;
            }
            terminate() { terminated.push(this.url); }
            postMessage() {}
        },
        setTimeout() { return 1; },
        clearTimeout() {},
    };
    sandbox.window = sandbox;
    vm.runInNewContext(text, sandbox, { filename: 'custom-indicators-runtime.js' });
    const api = sandbox.TalariaCustomIndicators;
    assert.ok(api, 'TalariaCustomIndicators exposed');
    assert.equal(typeof api.disposeWorker, 'function', 'disposeWorker exposed');

    // Force ensureWorker via runCompute path would need pump; call dispose after priming by
    // invoking runCompute then dispose — or call disposeWorker after manually ensuring via private.
    // Prime by posting a compute (async). Simpler: call disposeWorker when idle (nulls), then
    // use ensure by starting runCompute and immediately dispose.
    const p = api.runCompute('function compute(bars,params){return {overlay:true,plots:[]};}', {
        open: [1], high: [1], low: [1], close: [1], volume: [0], time: [0],
    }, {});
    // Worker created synchronously in pump
    api.disposeWorker();
    assert.ok(terminated.length >= 1, 'worker terminated');
    assert.ok(revoked.includes('blob:test-url-1'), 'object URL revoked');
    // Second dispose is no-op
    api.disposeWorker();
    p.catch(() => {});
    note('cut5-DISPOSER-REVOKE', true, `term=${terminated.length} revoked=${revoked.length}`);
});

// ── FLAG-03 working product (both ON and OFF complete) ────────────────────

test('FLAG-03-complete-absent: all flags absent ⇒ removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assertRemoveCompleted(h, entry, 'B');
    assertAllCutsRan(probe, h.hostOm, h.hostChart);
    note('FLAG-03-complete-absent', true);
});

test('FLAG-03-complete-all-off: all five flags truthy ⇒ removeChart still completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    for (const f of ALL_FLAGS) h.sandbox[f] = true;
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    const om = seedHostOmForPanel(h, probe.panelChart);
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assertRemoveCompleted(h, entry, 'B');
    assertCut1Skipped(probe);
    assertCut2Skipped(om, probe.panelChart, h.hostChart);
    assertCut3Skipped(probe);
    assertCut4Skipped(probe);
    assertCut5Skipped(probe);
    note('FLAG-03-complete-all-off', true);
});

// ── Independence: one flag truthy, other four still fire ──────────────────

const INDEPENDENCE_CASES = [
    { name: 'indep-drag-off', off: FLAGS.drag, skip: assertCut1Skipped, othersOk: (p, om, host) => {
        assertCut2Ran(om, p.panelChart, host); assertCut3Ran(p); assertCut4Ran(p); assertCut5Ran(p);
    } },
    { name: 'indep-order-off', off: FLAGS.order, skip: (p, om, host) => assertCut2Skipped(om, p.panelChart, host), othersOk: (p) => {
        assertCut1Ran(p); assertCut3Ran(p); assertCut4Ran(p); assertCut5Ran(p);
    } },
    { name: 'indep-tfAbort-off', off: FLAGS.tfAbort, skip: assertCut3Skipped, othersOk: (p, om, host) => {
        assertCut1Ran(p); assertCut2Ran(om, p.panelChart, host); assertCut4Ran(p); assertCut5Ran(p);
    } },
    { name: 'indep-indWorker-off', off: FLAGS.indWorker, skip: assertCut4Skipped, othersOk: (p, om, host) => {
        assertCut1Ran(p); assertCut2Ran(om, p.panelChart, host); assertCut3Ran(p); assertCut5Ran(p);
    } },
    { name: 'indep-blobWorker-off', off: FLAGS.blobWorker, skip: assertCut5Skipped, othersOk: (p, om, host) => {
        assertCut1Ran(p); assertCut2Ran(om, p.panelChart, host); assertCut3Ran(p); assertCut4Ran(p);
    } },
];

for (const cell of INDEPENDENCE_CASES) {
    test(cell.name + ': one flag truthy; other four releases still occur', () => {
        const h = createHarness();
        clearAllFlags(h.sandbox);
        h.sandbox[cell.off] = true;
        const entry = addLoadedPanel(h);
        const probe = probeOf(entry);
        const om = seedHostOmForPanel(h, probe.panelChart);
        h.manager.removeChart('B');
        if (cell.off === FLAGS.order) cell.skip(probe, om, h.hostChart);
        else cell.skip(probe);
        cell.othersOk(probe, om, h.hostChart);
        assertRemoveCompleted(h, entry, 'B');
        note(cell.name, true);
    });
}

// ── Throw isolation ───────────────────────────────────────────────────────

test('throw-iso-cut1: drag guard throws; other four run; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    probe.panelChart._throwDrag = true;
    const om = seedHostOmForPanel(h, probe.panelChart);
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assert.equal(probe.panelChart._removeDragEndGuardCalls, 1);
    assertCut2Ran(om, probe.panelChart, h.hostChart);
    assertCut3Ran(probe);
    assertCut4Ran(probe);
    assertCut5Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('throw-iso-cut1', true);
});

test('throw-iso-cut2: strip/prune throws; other four run; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    const om = seedHostOmForPanel(h, probe.panelChart);
    om._stripThrow = true;
    // Also make filter path throw by replacing arrays with throwing proxy after strip fails — strip is caught internally.
    // Force outer cut2 catch: replace orderManager getter to throw on second access via poison prune.
    Object.defineProperty(om, 'orderLines', {
        configurable: true,
        get() { throw new Error('prune boom'); },
        set() {},
    });
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assertCut1Ran(probe);
    assertCut3Ran(probe);
    assertCut4Ran(probe);
    assertCut5Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('throw-iso-cut2', true);
});

test('throw-iso-cut3: abort throws; other four run; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    probe.abortController._throwOnAbort = true;
    const om = seedHostOmForPanel(h, probe.panelChart);
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assertCut1Ran(probe);
    assertCut2Ran(om, probe.panelChart, h.hostChart);
    // abort threw but nulling may still happen after inner try — either way others run
    assertCut4Ran(probe);
    assertCut5Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('throw-iso-cut3', true);
});

test('throw-iso-cut4: disposeIndicatorWorker throws; other four run; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    probe.panelChart._throwIndWorker = true;
    const om = seedHostOmForPanel(h, probe.panelChart);
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assertCut1Ran(probe);
    assertCut2Ran(om, probe.panelChart, h.hostChart);
    assertCut3Ran(probe);
    assert.equal(probe.panelChart._disposeIndicatorWorkerCalls, 1);
    assertCut5Ran(probe);
    assertRemoveCompleted(h, entry, 'B');
    note('throw-iso-cut4', true);
});

test('throw-iso-cut5: disposeWorker throws; other four run; removeChart completes', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h);
    const probe = probeOf(entry);
    probe.customApi._throw = true;
    const om = seedHostOmForPanel(h, probe.panelChart);
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assertCut1Ran(probe);
    assertCut2Ran(om, probe.panelChart, h.hostChart);
    assertCut3Ran(probe);
    assertCut4Ran(probe);
    assert.equal(probe.customApi.disposeCalls, 1);
    assertRemoveCompleted(h, entry, 'B');
    note('throw-iso-cut5', true);
});

// ── Per-call flip (kills module-scope hoist mutant M8) ─────────────────────

test('flag-flip-per-call: truthy→absent mid-session flips cut on without reload', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    h.sandbox[FLAGS.drag] = true;
    const entryOff = addLoadedPanel(h, 'OFF');
    const probeOff = probeOf(entryOff);
    seedHostOmForPanel(h, probeOff.panelChart);
    h.manager.removeChart('OFF');
    assertCut1Skipped(probeOff);

    delete h.sandbox[FLAGS.drag];
    const entryOn = addLoadedPanel(h, 'ON');
    const probeOn = probeOf(entryOn);
    seedHostOmForPanel(h, probeOn.panelChart);
    h.manager.removeChart('ON');
    assertCut1Ran(probeOn);
    assertRemoveCompleted(h, entryOn, 'ON');
    note('flag-flip-per-call', true);
});

test('flag-polarity: falsy values keep cut ON (not === true sampling)', () => {
    const h = createHarness();
    for (const falsy of [false, 0, '', null, undefined]) {
        clearAllFlags(h.sandbox);
        h.sandbox[FLAGS.drag] = falsy;
        const id = `F${String(falsy)}`;
        const entry = addLoadedPanel(h, id);
        const probe = probeOf(entry);
        seedHostOmForPanel(h, probe.panelChart);
        h.manager.removeChart(id);
        assertCut1Ran(probe);
    }
    note('flag-polarity', true);
});

// ── STASHED-PANEL-HANDLE (detached-collapse path) ─────────────────────────

test('stash-detached-collapse: contentWindow null + stash ⇒ five cuts + bar-store fire', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h, 'B');
    const probe = probeOf(entry);
    const om = seedHostOmForPanel(h, probe.panelChart);
    stashViaBridgeReady(h, entry, 'B');
    detachFrame(entry);
    h.manager.removeChart('B');
    assertAllCutsRan(probe, om, h.hostChart);
    assert.equal(probe.panelChart._releaseSharedBarStoreFileRefsCalls, 1,
        'bar-store release must fire via stash');
    assert.equal(h.stats.replayDestroyed, 1,
        'ORPHAN/replay site must resolve panelChart via stash when detached');
    assertRemoveCompleted(h, entry, 'B');
    note('stash-detached-collapse', true);
});

test('stash-detached-flag-OFF: contentWindow null + stash + kill-switch ⇒ releases skip', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h, 'B');
    const probe = probeOf(entry);
    const om = seedHostOmForPanel(h, probe.panelChart);
    stashViaBridgeReady(h, entry, 'B');
    h.sandbox[STASH_FLAG] = true;
    detachFrame(entry);
    h.manager.removeChart('B');
    assertCut1Skipped(probe);
    assertCut2Skipped(om, probe.panelChart, h.hostChart);
    assertCut3Skipped(probe);
    assertCut4Skipped(probe);
    assertCut5Skipped(probe);
    assert.equal(probe.panelChart._releaseSharedBarStoreFileRefsCalls, 0,
        'bar-store must skip when stash kill-switch is on');
    assertRemoveCompleted(h, entry, 'B');
    note('stash-detached-flag-OFF', true);
});

test('stash-live-preferred: live handle used when live and stash differ', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h, 'B');
    const probe = probeOf(entry);
    const liveChart = probe.panelChart;
    const liveWin = entry.frame.contentWindow;
    const om = seedHostOmForPanel(h, liveChart);

    const stashAbort = { abort() { stashAbort.count += 1; }, count: 0 };
    const stashChart = {
        _removeDragEndGuardCalls: 0,
        _disposeIndicatorWorkerCalls: 0,
        _releaseSharedBarStoreFileRefsCalls: 0,
        _timeframeFetchAbort: stashAbort,
        _removeDragEndGuard() { stashChart._removeDragEndGuardCalls += 1; },
        _disposeIndicatorWorker() { stashChart._disposeIndicatorWorkerCalls += 1; },
        _releaseSharedBarStoreFileRefs() { stashChart._releaseSharedBarStoreFileRefsCalls += 1; },
        replaySystem: { destroy() {} },
    };
    const stashCustom = {
        disposeCalls: 0,
        disposeWorker() { stashCustom.disposeCalls += 1; },
    };
    const stashWin = {
        chart: stashChart,
        TalariaCustomIndicators: stashCustom,
    };
    entry.panelWinStash = stashWin;
    entry.panelChartStash = stashChart;

    assert.notEqual(liveChart, stashChart, 'live and stash chart must differ');
    assert.notEqual(liveWin, stashWin, 'live and stash win must differ');

    h.manager.removeChart('B');
    assertAllCutsRan(probe, om, h.hostChart);
    assert.equal(liveChart._releaseSharedBarStoreFileRefsCalls, 1, 'live bar-store used');
    assert.equal(stashChart._removeDragEndGuardCalls, 0, 'stash cut1 NOT used');
    assert.equal(stashChart._disposeIndicatorWorkerCalls, 0, 'stash cut4 NOT used');
    assert.equal(stashAbort.count, 0, 'stash cut3 NOT used');
    assert.equal(stashCustom.disposeCalls, 0, 'stash cut5 NOT used');
    assert.equal(stashChart._releaseSharedBarStoreFileRefsCalls, 0, 'stash bar-store NOT used');
    assertRemoveCompleted(h, entry, 'B');
    note('stash-live-preferred', true);
});

test('stash-cleared: removeChart nulls panelWinStash/panelChartStash on entry', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h, 'B');
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    stashViaBridgeReady(h, entry, 'B');
    assert.ok(entry.panelWinStash);
    assert.ok(entry.panelChartStash);
    h.manager.removeChart('B');
    assert.equal(entry.panelWinStash, null, 'panelWinStash must be nulled');
    assert.equal(entry.panelChartStash, null, 'panelChartStash must be nulled');
    assertRemoveCompleted(h, entry, 'B');
    note('stash-cleared', true);
});

test('stash-never-stashed: no live handle, no stash ⇒ removeChart completes cleanly', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);
    const entry = addLoadedPanel(h, 'B');
    const probe = probeOf(entry);
    seedHostOmForPanel(h, probe.panelChart);
    entry.panelWinStash = null;
    entry.panelChartStash = null;
    detachFrame(entry);
    const om = h.hostOm;
    assert.doesNotThrow(() => h.manager.removeChart('B'));
    assertCut1Skipped(probe);
    assertCut2Skipped(om, probe.panelChart, h.hostChart);
    assertCut3Skipped(probe);
    assertCut4Skipped(probe);
    assertCut5Skipped(probe);
    assert.equal(probe.panelChart._releaseSharedBarStoreFileRefsCalls, 0);
    assertRemoveCompleted(h, entry, 'B');
    note('stash-never-stashed', true);
});

test('stash-flag-flip-per-call: truthy→absent restores stash fallback without reload', () => {
    const h = createHarness();
    clearAllFlags(h.sandbox);

    // First removal: stash kill-switch ON ⇒ detached path skips.
    const entryOff = addLoadedPanel(h, 'OFF');
    const probeOff = probeOf(entryOff);
    const omOff = seedHostOmForPanel(h, probeOff.panelChart);
    stashViaBridgeReady(h, entryOff, 'OFF');
    h.sandbox[STASH_FLAG] = true;
    detachFrame(entryOff);
    h.manager.removeChart('OFF');
    assertCut1Skipped(probeOff);
    assertCut5Skipped(probeOff);
    assert.equal(probeOff.panelChart._releaseSharedBarStoreFileRefsCalls, 0);

    // Second removal: kill-switch cleared mid-session ⇒ stash fallback works.
    delete h.sandbox[STASH_FLAG];
    const entryOn = addLoadedPanel(h, 'ON');
    const probeOn = probeOf(entryOn);
    const omOn = seedHostOmForPanel(h, probeOn.panelChart);
    stashViaBridgeReady(h, entryOn, 'ON');
    detachFrame(entryOn);
    h.manager.removeChart('ON');
    assertAllCutsRan(probeOn, omOn, h.hostChart);
    assert.equal(probeOn.panelChart._releaseSharedBarStoreFileRefsCalls, 1);
    assertRemoveCompleted(h, entryOn, 'ON');
    note('stash-flag-flip-per-call', true);
    void omOff;
});

test('stash-flag-polarity: falsy values keep stash ON (not === true sampling)', () => {
    const h = createHarness();
    for (const falsy of [false, 0, '', null, undefined]) {
        clearAllFlags(h.sandbox);
        h.sandbox[STASH_FLAG] = falsy;
        const id = `SF${String(falsy)}`;
        const entry = addLoadedPanel(h, id);
        const probe = probeOf(entry);
        const om = seedHostOmForPanel(h, probe.panelChart);
        stashViaBridgeReady(h, entry, id);
        detachFrame(entry);
        h.manager.removeChart(id);
        assertAllCutsRan(probe, om, h.hostChart);
        assert.equal(probe.panelChart._releaseSharedBarStoreFileRefsCalls, 1,
            `stash ON for falsy=${String(falsy)}`);
    }
    note('stash-flag-polarity', true);
});
