/**
 * Leak shot (c) — removeChart releases panel-held shared bar-store refs.
 *
 *   node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/multichart-prod/harness/leak-c-clearfile-on-remove.test.mjs"
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
const SWITCH = '__TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1';

function sha256File(filePath) {
    return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function note(name, pass, detail = '') {
    process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
}

class FakeFrame {
    constructor(chart, order) {
        this.chart = chart;
        this.order = order;
        this.removeCalls = 0;
        this.listeners = new Map();
        this.isConnected = true;
    }

    get contentWindow() {
        return { chart: this.chart };
    }

    removeEventListener(type, listener) {
        const set = this.listeners.get(type);
        if (set) set.delete(listener);
    }

    remove() {
        this.order.push('remove');
        this.removeCalls += 1;
        this.isConnected = false;
    }
}

function createHarness(source = fs.readFileSync(MANAGER_SRC, 'utf8')) {
    const logs = [];
    const sandbox = {
        console,
        document: {
            readyState: 'complete',
            visibilityState: 'visible',
            head: {
                appendChild() {},
            },
            createElement(tagName) {
                return {
                    tagName: String(tagName || '').toUpperCase(),
                    style: {},
                    setAttribute() {},
                    addEventListener() {},
                    removeEventListener() {},
                    remove() {},
                };
            },
            getElementById() {
                return null;
            },
        },
        URLSearchParams,
        MultichartGuards: {
            filterForbiddenFields(msg) {
                return { clean: msg, dropped: [] };
            },
        },
        addEventListener() {},
        removeEventListener() {},
        setTimeout() {
            return {};
        },
        clearTimeout() {},
        performance: { now: () => 0 },
    };
    sandbox.window = sandbox;
    sandbox.globalThis = sandbox;
    vm.runInNewContext(source, sandbox, { filename: MANAGER_SRC });
    const manager = new sandbox.MultichartManager({
        container: {},
        onLog(entry) { logs.push(entry); },
    });
    return { sandbox, manager, logs };
}

function makeStore() {
    const files = new Map();
    const calls = [];
    return {
        calls,
        retainFile(fileId, clientId) {
            const id = String(fileId);
            const owner = String(clientId);
            if (!files.has(id)) files.set(id, new Set());
            files.get(id).add(owner);
        },
        clearFile(fileId, clientId) {
            const id = String(fileId);
            const owner = String(clientId);
            calls.push({ fileId: id, clientId: owner });
            const refs = files.get(id);
            if (!refs) return;
            refs.delete(owner);
            if (refs.size === 0) files.delete(id);
        },
        has(fileId) {
            return files.has(String(fileId));
        },
        refCount(fileId) {
            const refs = files.get(String(fileId));
            return refs ? refs.size : 0;
        },
    };
}

function makePanelChart({ id, fileIds, store, order, throwOnRelease = false }) {
    const refs = new Set(fileIds);
    for (const fileId of refs) store.retainFile(fileId, id);
    return {
        replaySystem: {
            destroy() {
                order.push(`replay:${id}`);
            },
        },
        _releaseSharedBarStoreFileRefs() {
            order.push(`release:${id}`);
            if (throwOnRelease) throw new Error(`release failed ${id}`);
            for (const fileId of refs) store.clearFile(fileId, id);
            refs.clear();
        },
        _refs: refs,
    };
}

function addPanel(manager, id, chart, order) {
    const frame = new FakeFrame(chart, order);
    manager.charts.set(id, {
        id,
        frame,
        ready: true,
        state: { fileId: 'file-a' },
        _mcBrandSuppressionTimers: [],
        _mcBridgeReadyTimeouts: [],
        _mcFrameLoadListener: function noop() {},
        _mcFrameErrorListener: function noop() {},
        _mcPanelRemoved: false,
    });
    return frame;
}

test('provenance: manager mirror is byte-identical and switch contract is truthy absent-default', () => {
    const a = sha256File(MANAGER_SRC);
    const b = sha256File(MANAGER_MIRROR);
    note('mirror-byte-identical', a === b, `sha256=${a.slice(0, 16)}`);
    assert.equal(a, b, 'homepage mirror must be byte-identical to chart tree');

    const src = fs.readFileSync(MANAGER_SRC, 'utf8');
    assert.ok(src.includes(SWITCH), 'reserved clearFile-on-remove switch name present');
    assert.ok(src.includes(`global.${SWITCH}`), 'switch uses direct truthiness read');
    assert.ok(!new RegExp(
        `hasOwnProperty\\s*\\.\\s*call\\s*\\(\\s*global\\s*,\\s*['"]${SWITCH}['"]`,
    ).test(src),
        'switch must not disable on mere property presence');
    assert.ok(!new RegExp(`${SWITCH}[^\\n]*===\\s*false`).test(src), 'must not test switch as === false');
});

test('removeChart calls chart shared-bar-store release before replay destroy and iframe remove', () => {
    const h = createHarness();
    const store = makeStore();
    const order = [];
    const chart = makePanelChart({ id: 'client-B', fileIds: ['file-a'], store, order });
    addPanel(h.manager, 'B', chart, order);

    h.manager.removeChart('B');

    note('remove-calls-shared-store-release', store.calls.length === 1,
        `order=${order.join('>')}`);
    assert.deepEqual(store.calls, [{ fileId: 'file-a', clientId: 'client-B' }]);
    assert.deepEqual(order, ['release:client-B', 'replay:client-B', 'remove']);
    assert.equal(h.manager.charts.has('B'), false, 'panel entry deleted after teardown');
});

test('reference-counted store keeps shared file until the last removed panel releases it', () => {
    const h = createHarness();
    const store = makeStore();
    const order = [];
    const chartB = makePanelChart({ id: 'client-B', fileIds: ['file-a'], store, order });
    const chartC = makePanelChart({ id: 'client-C', fileIds: ['file-a'], store, order });
    addPanel(h.manager, 'B', chartB, order);
    addPanel(h.manager, 'C', chartC, order);

    h.manager.removeChart('B');
    assert.equal(store.has('file-a'), true, 'first release keeps shared file retained');
    assert.equal(store.refCount('file-a'), 1, 'one panel ref remains');

    h.manager.removeChart('C');

    note('last-panel-clearfile-drops-shared-file', !store.has('file-a'),
        `calls=${store.calls.length}`);
    assert.equal(store.has('file-a'), false, 'last release clears the file');
    assert.deepEqual(store.calls.map((c) => c.clientId), ['client-B', 'client-C']);
});

test('kill switch round trip: absent, false, undefined release; true skips; delete releases again', () => {
    const h = createHarness();
    const store = makeStore();
    const order = [];

    const run = (panelId, clientId) => {
        const chart = makePanelChart({ id: clientId, fileIds: [`file-${panelId}`], store, order });
        addPanel(h.manager, panelId, chart, order);
        h.manager.removeChart(panelId);
    };

    delete h.sandbox[SWITCH];
    run('B', 'client-B');
    h.sandbox[SWITCH] = false;
    run('C', 'client-C');
    h.sandbox[SWITCH] = undefined;
    run('D', 'client-D');
    h.sandbox[SWITCH] = true;
    run('E', 'client-E');
    delete h.sandbox[SWITCH];
    run('F', 'client-F');

    note('switch-round-trip-clearfile-on-remove', store.calls.length === 4,
        `clients=${store.calls.map((c) => c.clientId).join(',')}`);
    assert.deepEqual(store.calls.map((c) => c.clientId), [
        'client-B',
        'client-C',
        'client-D',
        'client-F',
    ]);
});

test('release failure is contained and teardown continues through replay, remove, and map delete', () => {
    const h = createHarness();
    const store = makeStore();
    const order = [];
    const chart = makePanelChart({
        id: 'client-B',
        fileIds: ['file-a'],
        store,
        order,
        throwOnRelease: true,
    });
    const frame = addPanel(h.manager, 'B', chart, order);

    assert.doesNotThrow(() => h.manager.removeChart('B'));

    note('release-throw-does-not-stop-teardown', frame.removeCalls === 1 && !h.manager.charts.has('B'),
        `order=${order.join('>')}`);
    assert.deepEqual(order, ['release:client-B', 'replay:client-B', 'remove']);
    assert.equal(frame.removeCalls, 1, 'iframe removed even when release throws');
    assert.equal(h.manager.charts.has('B'), false, 'map entry deleted even when release throws');
    assert.ok(h.logs.some((entry) => String(entry.text).includes('shared bar-store release failed')),
        'release failure is logged');
});

test('neuter-red: removing the release call makes the leak oracle fail', () => {
    const source = fs.readFileSync(MANAGER_SRC, 'utf8');
    const needle = 'panelChart._releaseSharedBarStoreFileRefs();';
    assert.ok(source.includes(needle), 'precondition: manager source contains release call');
    const neutered = source.replace(needle, '/* leak-c neutered: no shared-store release */');
    const h = createHarness(neutered);
    const store = makeStore();
    const order = [];
    const chart = makePanelChart({ id: 'client-B', fileIds: ['file-a'], store, order });
    addPanel(h.manager, 'B', chart, order);

    h.manager.removeChart('B');

    const failedAsExpected = store.has('file-a') && store.calls.length === 0;
    note('neuter-red-oracle-detects-missing-call', failedAsExpected,
        `retained=${store.has('file-a')} calls=${store.calls.length}`);
    assert.equal(failedAsExpected, true, 'mutated manager must leave the file retained');
});
