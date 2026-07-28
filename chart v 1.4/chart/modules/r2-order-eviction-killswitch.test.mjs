import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const managerPath = join(__dirname, 'drawing-tools-manager.js');
const managerSource = readFileSync(managerPath, 'utf8');
const FLAG = '__TALARIA_DISABLE_M24_ORDER_EVICTION_SCOPE_V1';

class FakeNode {
    constructor(className, textValue = '') {
        this.className = className;
        this.textValue = textValue;
        this.removed = false;
    }

    remove() {
        this.removed = true;
    }
}

class FakeSelection {
    constructor(nodes) {
        this.nodes = nodes;
    }

    remove() {
        this.nodes.forEach((node) => node.remove());
        return this;
    }

    each(callback) {
        this.nodes.filter((node) => !node.removed).forEach((node) => callback.call(node));
        return this;
    }

    empty() {
        return this.nodes.filter((node) => !node.removed).length === 0;
    }

    attr(name) {
        if (name !== 'class') return undefined;
        return this.nodes.find((node) => !node.removed)?.className || '';
    }

    text() {
        return this.nodes.find((node) => !node.removed)?.textValue || '';
    }
}

class FakeSvg {
    constructor(nodes, options = {}) {
        this.nodes = nodes;
        this.options = options;
    }

    selectAll(selector) {
        return new FakeSelection(this.match(selector, true));
    }

    select(selector) {
        const node = this.match(selector, false)[0];
        return new FakeSelection(node ? [node] : []);
    }

    match(selector, bulk) {
        if (bulk && this.options.hideBoxTextFromBulk && selector === '.pending-order-price-text') {
            return this.nodes.filter((node) => !node.removed
                && hasClasses(node, ['pending-order-price-text'])
                && !hasClasses(node, ['pending-888']));
        }
        const classSelector = selector.match(/^(\.[A-Za-z0-9_-]+)+$/);
        if (classSelector) {
            const required = selector.split('.').filter(Boolean);
            return this.nodes.filter((node) => !node.removed && hasClasses(node, required));
        }
        const containsClass = selector.match(/^\[class\*="([^"]+)"\]$/);
        if (containsClass) {
            return this.nodes.filter((node) => !node.removed && node.className.includes(containsClass[1]));
        }
        return [];
    }
}

function hasClasses(node, required) {
    const classes = new Set(String(node.className || '').split(/\s+/).filter(Boolean));
    return required.every((name) => classes.has(name));
}

function loadManager(source = managerSource) {
    const sandbox = {
        module: { exports: {} },
        exports: {},
        require,
        console,
        setTimeout,
        clearTimeout,
        requestAnimationFrame: (callback) => setTimeout(callback, 0),
        cancelAnimationFrame: (handle) => clearTimeout(handle),
        window: {},
        document: { documentElement: { classList: { contains: () => false } } },
        d3: {
            select(node) {
                return new FakeSelection([node]);
            },
        },
    };
    vm.runInNewContext(source, sandbox, { filename: managerPath });
    sandbox.module.exports.__r2Sandbox = sandbox;
    return sandbox.module.exports;
}

function installRuntime(Manager, orderManager, flagMode) {
    const runtimeWindow = {
        chart: { orderManager },
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent() {},
        location: { search: '' },
    };
    if (flagMode === true || flagMode === false) {
        runtimeWindow[FLAG] = flagMode;
    } else {
        delete runtimeWindow[FLAG];
    }
    const runtimeD3 = {
        select(node) {
            return new FakeSelection([node]);
        },
    };
    const runtimeDocument = { documentElement: { classList: { contains: () => false } } };
    if (Manager.__r2Sandbox) {
        Manager.__r2Sandbox.window = runtimeWindow;
        Manager.__r2Sandbox.d3 = runtimeD3;
        Manager.__r2Sandbox.document = runtimeDocument;
    }
    global.window = runtimeWindow;
    global.d3 = runtimeD3;
    global.document = runtimeDocument;
}

function buildScenario(options = {}) {
    const entryPrice = 1.23456;
    const otherChart = { name: 'other-chart' };
    const nodes = [
        new FakeNode('order-line-pos1'),
        new FakeNode('sl-line-pos1'),
        new FakeNode('tp-line-pos1'),
        new FakeNode('entry-marker-pos1'),
        new FakeNode('pending-order-price-text pending-777', String(entryPrice)),
        new FakeNode('pending-777'),
        new FakeNode('pending-sl-777'),
        new FakeNode('pending-tp-777'),
        new FakeNode('orphan pending-777-extra'),
        new FakeNode('pending-order-price-box pending-888'),
        new FakeNode('pending-order-price-text pending-888', String(entryPrice)),
        new FakeNode('pending-888'),
        new FakeNode('orphan pending-888-extra'),
    ];
    const svg = new FakeSvg(nodes, options);
    const currentChart = { name: 'current-chart', svg };
    const pendingOrders = [
        { id: 'pend-other-chart-only', entryPrice },
        { id: 'pend-trailing', entryPrice },
        { id: '777', entryPrice },
        { id: '888', entryPrice },
    ];
    const orderManager = {
        chart: currentChart,
        pendingOrders,
        openPositions: [{ id: 'pos1', openPrice: entryPrice }],
        cancelled: [],
        cancelPendingOrder(id) {
            this.cancelled.push(id);
        },
        removePendingSLTPLines() {},
        updatePositionsPanel() {},
    };
    currentChart.orderManager = orderManager;
    orderManager.orderLines = [
        { orderId: 'pos1', isPending: false, chart: currentChart },
        { orderId: 'pos1', isPending: false, chart: otherChart },
        { orderId: 'pos-untouched', isPending: false, chart: otherChart },
        { orderId: 'pend-other-chart-only', isPending: true, chart: otherChart, line: new FakeNode('line-other') },
        { orderId: 'pend-trailing', isPending: true, chart: currentChart, line: new FakeNode('line-current') },
        { orderId: 'pend-trailing', isPending: true, chart: otherChart, line: new FakeNode('line-trailing-other') },
    ];
    return { entryPrice, currentChart, orderManager, nodes };
}

function runDelete(Manager, flagMode, options = {}) {
    const scenario = buildScenario(options);
    installRuntime(Manager, scenario.orderManager, flagMode);
    const drawing = {
        id: 'drawing-1',
        type: 'long-position',
        points: [{ y: scenario.entryPrice }],
        destroy() {
            this.destroyed = true;
        },
    };
    const manager = Object.create(Manager.prototype);
    Object.assign(manager, {
        chart: scenario.currentChart,
        drawings: [drawing],
        selectedDrawings: [],
        history: { recordDelete() {} },
        toolbar: { hide() {} },
        _clearShiftResizeAnchorPoints() {},
        _emitToolLifecycle() {},
        saveDrawings() {},
    });

    manager.deleteDrawing(drawing);

    return {
        remainingClasses: scenario.nodes
            .filter((node) => !node.removed)
            .map((node) => node.className)
            .sort(),
        orderLines: scenario.orderManager.orderLines
            .map((line) => `${line.orderId}:${line.isPending ? 'pending' : 'open'}:${line.chart?.name || 'none'}`)
            .sort(),
    };
}

function assertDefaultScoped(snapshot) {
    assert.equal(snapshot.remainingClasses.includes('entry-marker-pos1'), false);
    assert.equal(snapshot.remainingClasses.includes('order-line-pos1'), true);
    assert.equal(snapshot.remainingClasses.includes('sl-line-pos1'), true);
    assert.equal(snapshot.remainingClasses.includes('tp-line-pos1'), true);
    assert.equal(snapshot.remainingClasses.includes('orphan pending-777-extra'), true);
    assert.equal(snapshot.remainingClasses.includes('orphan pending-888-extra'), true);
    assert.deepEqual(snapshot.orderLines, [
        'pend-other-chart-only:pending:other-chart',
        'pend-trailing:pending:other-chart',
        'pos-untouched:open:other-chart',
        'pos1:open:other-chart',
    ]);
}

function assertLegacy(snapshot) {
    assert.equal(snapshot.remainingClasses.some((name) => name.includes('pos1')), false);
    assert.equal(snapshot.remainingClasses.includes('orphan pending-777-extra'), false);
    assert.equal(snapshot.remainingClasses.includes('orphan pending-888-extra'), false);
    assert.deepEqual(snapshot.orderLines, ['pos-untouched:open:other-chart']);
}

function assertWildcardBoxBranch(Manager) {
    const snapshot = runDelete(Manager, true, { hideBoxTextFromBulk: true });
    assert.equal(snapshot.remainingClasses.includes('orphan pending-888-extra'), false);
}

function assertMutationKilled(name, mutator, oracle) {
    const mutated = mutator(managerSource);
    assert.notEqual(mutated, managerSource, `${name} mutator must change the source`);
    const MutatedManager = loadManager(mutated);
    assert.throws(() => oracle(MutatedManager), undefined, `${name} mutant must be killed`);
}

test('unmutated product oracles pass before mutation score is meaningful', () => {
    const Manager = loadManager();
    assertDefaultScoped(runDelete(Manager, undefined));
    assertLegacy(runDelete(Manager, true));
    assertWildcardBoxBranch(Manager);
});

test('default production path uses current scoped behavior when the property is absent', () => {
    const Manager = loadManager();
    assertDefaultScoped(runDelete(Manager, undefined));
});

test('runtime flag restores 3962ef6d3^ order-line eviction behavior exactly', () => {
    const Manager = loadManager();
    assertLegacy(runDelete(Manager, true));
});

test('runtime sampling supports ON to OFF flips in one loaded page', () => {
    const Manager = loadManager();
    assertLegacy(runDelete(Manager, true));
    assertDefaultScoped(runDelete(Manager, false));
});

test('mutation guards kill flag-read and branch-specific reversions', () => {
    const legacyOracle = (Manager) => assertLegacy(runDelete(Manager, true));
    const defaultOracle = (Manager) => assertDefaultScoped(runDelete(Manager, undefined));
    const boxOracle = (Manager) => assertWildcardBoxBranch(Manager);

    assertMutationKilled(
        'flag read deleted',
        (source) => source.replace(
            `const evictLegacy = window.${FLAG} === true;`,
            'const evictLegacy = false;',
        ),
        legacyOracle,
    );
    assertMutationKilled(
        'flag read inverted',
        (source) => source.replace(
            `const evictLegacy = window.${FLAG} === true;`,
            `const evictLegacy = window.${FLAG} !== true;`,
        ),
        defaultOracle,
    );
    assertMutationKilled(
        'defaulting inverted',
        (source) => source.replace(
            `const evictLegacy = window.${FLAG} === true;`,
            `const evictLegacy = window.${FLAG} !== false;`,
        ),
        defaultOracle,
    );
    assertMutationKilled(
        'open-position visual selectors left scoped',
        (source) => source.replace(
            `if (evictLegacy) {
                                orderManager.chart.svg.selectAll(\`.order-line-\${order.id}\`).remove();
                                orderManager.chart.svg.selectAll(\`.sl-line-\${order.id}\`).remove();
                                orderManager.chart.svg.selectAll(\`.tp-line-\${order.id}\`).remove();
                                orderManager.chart.svg.selectAll(\`.entry-marker-\${order.id}\`).remove();
                            } else {
                                ch.svg.selectAll(\`.entry-marker-\${order.id}\`).remove();
                            }`,
            'ch.svg.selectAll(`.entry-marker-${order.id}`).remove();',
        ),
        legacyOracle,
    );
    assertMutationKilled(
        'open-position orderLines filter left scoped',
        (source) => source.replace(
            `if (evictLegacy) {
                                    orderManager.orderLines = orderManager.orderLines.filter(l => l.orderId !== order.id);
                                } else {
                                    orderManager.orderLines = orderManager.orderLines.filter(l =>
                                        !(l.orderId === order.id && !l.isPending && (l.chart || orderManager.chart) === ch)
                                    );
                                }`,
            `orderManager.orderLines = orderManager.orderLines.filter(l =>
                                    !(l.orderId === order.id && !l.isPending && (l.chart || orderManager.chart) === ch)
                                );`,
        ),
        legacyOracle,
    );
    assertMutationKilled(
        'pending orderLines early chart return left scoped',
        (source) => source.replace(
            'if (!evictLegacy && (l.chart || orderManager.chart) !== ch) return false;',
            'if ((l.chart || orderManager.chart) !== ch) return false;',
        ),
        legacyOracle,
    );
    assertMutationKilled(
        'pending orderLines trailing chart clause left scoped',
        (source) => source.replace(
            '!removedIds.includes(l.orderId) || !l.isPending || (!evictLegacy && (l.chart || orderManager.chart) !== ch)',
            '!removedIds.includes(l.orderId) || !l.isPending || (l.chart || orderManager.chart) !== ch',
        ),
        legacyOracle,
    );
    assertMutationKilled(
        'price-text wildcard sweep left removed',
        (source) => source.replace(
            `if (evictLegacy) {
                                        svg.selectAll(\`[class*="pending-\${orderId}"]\`).remove();
                                    }`,
            'if (evictLegacy) {}',
        ),
        legacyOracle,
    );
    assertMutationKilled(
        'price-box wildcard sweep left removed',
        (source) => {
            const firstRemoved = source.replace(
                `if (evictLegacy) {
                                        svg.selectAll(\`[class*="pending-\${orderId}"]\`).remove();
                                    }`,
                'if (evictLegacy) {}',
            );
            return firstRemoved.replace(
                `if (evictLegacy) {
                                            svg.selectAll(\`[class*="pending-\${orderId}"]\`).remove();
                                        }`,
                'if (evictLegacy) {}',
            );
        },
        boxOracle,
    );
});
