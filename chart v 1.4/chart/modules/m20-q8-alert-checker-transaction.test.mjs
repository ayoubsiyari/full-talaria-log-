/**
 * M20-Q8 correction gate — alert state/checker transactional consistency.
 *
 * This suite executes the real AlertSystem prototype from both product trees
 * and the immutable parent snapshot. Evidence is opt-in:
 *
 *   M20_Q8_EVIDENCE=red|green|kill node --test --test-concurrency=1 \
 *     "chart v 1.4/chart/modules/m20-q8-alert-checker-transaction.test.mjs"
 *
 * Status: PENDING-FRESH-GPT-REVIEW (this suite does not self-accept).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const BASE_COMMIT = '5cd010bb8649fec301983c6ee964379e8d3be3f7';
const BASE_PRODUCT_SHA256 = 'fb17b18698a18605d9051183c7f867abb9cf77b353abb2df0baf34e01825093d';
const REJECTED_PRODUCT_SHA256 = '89ec4e7ba1b9cb13a54c1958c1166e43771d2aebede8a72421024fe45f315bc9';
const KILL_SWITCH = '__TALARIA_DISABLE_M20_Q8_ALERT_CHECKER_IDLE_V1';
const STATUS = 'PENDING-FRESH-GPT-REVIEW';
const EVIDENCE_MODE = String(process.env.M20_Q8_EVIDENCE || '').toLowerCase();
const ALLOWED_EVIDENCE_MODES = new Set(['red', 'green', 'kill']);

const thisDir = path.dirname(fileURLToPath(import.meta.url));

function isCanonicalRoot(candidate) {
    const markers = [
        'chart v 1.4/chart/modules/alert-system.js',
        'homepage/public/chart/modules/alert-system.js',
        'docs/plan3/PLAN3-BOARD.md',
        '.git'
    ];
    return markers.every((marker) => fs.existsSync(path.join(candidate, marker)));
}

function findCanonicalRoot(start) {
    let current = fs.realpathSync(start);
    for (;;) {
        if (isCanonicalRoot(current)) return current;
        const parent = path.dirname(current);
        if (parent === current) break;
        current = parent;
    }
    throw new Error(`M20-Q8 canonical repository root not found from ${start}`);
}

const REPO_ROOT = findCanonicalRoot(thisDir);
const CANONICAL_PRODUCT = path.join(REPO_ROOT, 'chart v 1.4/chart/modules/alert-system.js');
const HOMEPAGE_PRODUCT = path.join(REPO_ROOT, 'homepage/public/chart/modules/alert-system.js');
const PACKET_DIR = path.join(
    REPO_ROOT,
    'chart v 1.4/chart/modules/m20-q8-transaction-packet'
);
const REJECTED_FIXTURE = path.join(
    PACKET_DIR,
    'rejected-alert-system-89ec4e7b.fixture.js'
);
const EVIDENCE_DIR = path.join(PACKET_DIR, 'evidence');

function sha256(value) {
    return crypto.createHash('sha256').update(value).digest('hex');
}

function gitText(args) {
    return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        windowsHide: true
    }).trim();
}

function gitBytes(args) {
    return execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: null,
        windowsHide: true
    });
}

function gitPathIgnored(relativePath) {
    try {
        execFileSync('git', ['check-ignore', '--quiet', '--', relativePath], {
            cwd: REPO_ROOT,
            encoding: 'utf8',
            windowsHide: true,
            stdio: 'ignore'
        });
        return true;
    } catch (error) {
        if (error && error.status === 1) return false;
        throw error;
    }
}

const resolvedBaseCommit = gitText(['rev-parse', '--verify', `${BASE_COMMIT}^{commit}`]);
const baseCanonicalBytes = gitBytes(['show', `${BASE_COMMIT}:chart v 1.4/chart/modules/alert-system.js`]);
const baseHomepageBytes = gitBytes(['show', `${BASE_COMMIT}:homepage/public/chart/modules/alert-system.js`]);
const currentCanonicalBytes = fs.readFileSync(CANONICAL_PRODUCT);
const currentHomepageBytes = fs.readFileSync(HOMEPAGE_PRODUCT);
const rejectedBytes = fs.readFileSync(REJECTED_FIXTURE);
const baseSource = baseCanonicalBytes.toString('utf8');
const currentCanonicalSource = currentCanonicalBytes.toString('utf8');
const currentHomepageSource = currentHomepageBytes.toString('utf8');
const rejectedSource = rejectedBytes.toString('utf8');

const hashes = {
    baseCommit: resolvedBaseCommit,
    baseCanonicalSha256: sha256(baseCanonicalBytes),
    baseHomepageSha256: sha256(baseHomepageBytes),
    rejectedSha256: sha256(rejectedBytes),
    currentCanonicalSha256: sha256(currentCanonicalBytes),
    currentHomepageSha256: sha256(currentHomepageBytes)
};

const evidenceRows = [];
const captured = {
    immutableRed: null,
    rejectedRed: null,
    currentCore: {},
    currentFaults: {},
    timerFaults: {},
    ownership: {},
    stress: {},
    kill: {},
    switchGetterTrace: {}
};

function note(phase, name, pass, detail = '', measurements = undefined) {
    const row = {
        phase,
        name,
        pass: !!pass,
        detail: String(detail || '')
    };
    if (measurements !== undefined) row.measurements = measurements;
    evidenceRows.push(row);
    process.stdout.write(
        `${pass ? 'PASS' : 'FAIL'} [Q8:${phase}] ${name}${detail ? ` — ${detail}` : ''}\n`
    );
    return row;
}

function makeDocument() {
    const styleMarker = { id: 'alert-system-styles' };
    return {
        hidden: false,
        body: {
            style: {},
            appendChild() {}
        },
        head: {
            appendChild() {}
        },
        getElementById(id) {
            return id === 'alert-system-styles' ? styleMarker : null;
        },
        querySelector() {
            return null;
        },
        querySelectorAll() {
            return [];
        },
        createElement() {
            return {
                id: '',
                textContent: '',
                innerHTML: '',
                style: {},
                classList: {
                    add() {},
                    remove() {},
                    contains() { return false; }
                },
                addEventListener() {},
                appendChild() {},
                remove() {},
                setAttribute() {},
                querySelector() { return null; },
                querySelectorAll() { return []; }
            };
        },
        addEventListener() {},
        removeEventListener() {}
    };
}

function loadProduct(source, { kill = false, hidden = false } = {}) {
    let nextTimerId = 1;
    let confirmImpl = () => true;
    const activeTimers = new Map();
    const timerStats = {
        starts: 0,
        clears: 0,
        maxActive: 0,
        callbackErrors: []
    };
    const storage = {
        value: '[]',
        getCalls: 0,
        setCalls: 0,
        getFault: null,
        setFault: null,
        getItem() {
            this.getCalls += 1;
            if (this.getFault) throw this.getFault;
            return this.value;
        },
        setItem(_key, value) {
            this.setCalls += 1;
            if (this.setFault) throw this.setFault;
            this.value = value;
        }
    };
    const document = makeDocument();
    document.hidden = hidden;
    const quietConsole = {
        log() {},
        warn() {},
        error() {},
        info() {},
        debug() {}
    };
    const context = {
        window: {
            [KILL_SWITCH]: !!kill,
            AudioContext: class {},
            webkitAudioContext: class {}
        },
        document,
        userStorage: storage,
        Notification: undefined,
        confirm(...args) {
            return confirmImpl(...args);
        },
        setInterval(callback, delay) {
            const id = nextTimerId++;
            activeTimers.set(id, { callback, delay });
            timerStats.starts += 1;
            timerStats.maxActive = Math.max(timerStats.maxActive, activeTimers.size);
            return id;
        },
        clearInterval(id) {
            timerStats.clears += 1;
            activeTimers.delete(id);
        },
        setTimeout() {
            return 1;
        },
        clearTimeout() {},
        console: quietConsole
    };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(source, context, {
        filename: 'alert-system.js',
        displayErrors: true
    });
    const AlertSystem = context.window.AlertSystem;
    assert.equal(typeof AlertSystem, 'function', 'real AlertSystem class was not exported');

    return {
        AlertSystem,
        activeTimers,
        context,
        storage,
        timerStats,
        setConfirm(fn) {
            confirmImpl = fn;
        },
        runActiveTimers() {
            for (const { callback } of [...activeTimers.values()]) {
                try {
                    callback();
                } catch (error) {
                    timerStats.callbackErrors.push(error);
                }
            }
        },
        clearHarnessTimers() {
            activeTimers.clear();
        }
    };
}

function defaultAlert(id = 'existing') {
    return {
        id,
        symbol: 'TEST',
        price: 100,
        condition: 'crossing',
        message: 'test',
        expiration: 'every_time',
        active: true,
        triggered: false,
        triggeredCount: 0,
        lastTriggeredBar: null,
        color: '#ff9800',
        lineStyle: 'dashed',
        showPopup: true,
        playSound: true,
        createdAt: 1,
        upperPrice: null,
        lowerPrice: null
    };
}

function makeInstance(runtime, alerts = [], { start = false, bootstrap = true } = {}) {
    const proto = runtime.AlertSystem.prototype;
    const instance = Object.create(proto);
    instance.chart = {
        currentSymbol: 'TEST',
        data: [{ c: 100 }],
        showNotification() {},
        svg: {
            select() {
                return {
                    remove() {},
                    node() { return null; },
                    classed() { return this; }
                };
            }
        }
    };
    instance.alerts = alerts.map((alert) => ({ ...alert }));
    instance.storageKey = 'chart_alerts_q8_test';
    instance.isVisible = false;
    instance.alertSound = null;
    instance.checkInterval = null;
    instance.lastPrices = {};
    instance.conditions = {
        CROSSING: 'crossing',
        CROSSING_UP: 'crossing_up',
        CROSSING_DOWN: 'crossing_down',
        GREATER_THAN: 'greater_than',
        LESS_THAN: 'less_than',
        ENTERING_CHANNEL: 'entering_channel',
        EXITING_CHANNEL: 'exiting_channel'
    };
    instance.expirations = {
        ONCE: 'once',
        EVERY_TIME: 'every_time',
        ONCE_PER_BAR: 'once_per_bar'
    };
    instance.renderAlertLines = () => {};
    instance.refreshAlertsList = () => {};
    instance.updateBadge = () => {};

    assert.equal(instance.createAlert, proto.createAlert, 'createAlert must be the real product method');
    assert.equal(instance.deleteAlert, proto.deleteAlert, 'deleteAlert must be the real product method');
    assert.equal(instance.clearAllAlerts, proto.clearAllAlerts, 'clearAllAlerts must be the real product method');
    assert.equal(instance.startAlertChecker, proto.startAlertChecker, 'startAlertChecker must be real product');
    assert.equal(instance.destroy, proto.destroy, 'destroy must be the real product method');

    // Production installs Q8 transaction ownership from the existing init-time
    // start call. Immutable RED receives the same call but has no installer.
    if (start || bootstrap) instance.startAlertChecker();
    return instance;
}

function captureCall(fn) {
    try {
        return { value: fn(), error: null };
    } catch (error) {
        return { value: undefined, error };
    }
}

function invariantMeasurement(instance, runtime) {
    const alertCount = instance.alerts.length;
    const expectedIntervals = alertCount > 0 ? 1 : 0;
    const intervalCount = runtime.activeTimers.size;
    const handleIsLive = expectedIntervals === 0
        ? instance.checkInterval == null
        : instance.checkInterval != null && runtime.activeTimers.has(instance.checkInterval);
    return {
        alertCount,
        expectedIntervals,
        intervalCount,
        checkInterval: instance.checkInterval == null ? null : instance.checkInterval,
        handleIsLive,
        invariant: intervalCount === expectedIntervals && handleIsLive
    };
}

function installFaultableSideEffects(instance) {
    const state = {
        stage: null,
        error: null,
        trace: []
    };
    const invoke = (name) => {
        state.trace.push(name);
        if (state.stage === name) throw state.error;
    };
    instance.saveAlerts = () => invoke('persistence');
    instance.renderAlertLines = () => invoke('render');
    instance.refreshAlertsList = () => invoke('list');
    instance.updateBadge = () => invoke('badge');
    instance.chart.showNotification = () => invoke('notification');
    return state;
}

function cleanupInstance(instance, runtime) {
    captureCall(() => instance.destroy());
    const remaining = runtime.activeTimers.size;
    runtime.clearHarnessTimers();
    return remaining;
}

function runCoreThrowScenarios(source, { kill = false } = {}) {
    const results = {};

    {
        const runtime = loadProduct(source, { kill });
        const instance = makeInstance(runtime);
        const fault = installFaultableSideEffects(instance);
        const sentinel = new Error('Q8 create render fault');
        fault.stage = 'render';
        fault.error = sentinel;
        const outcome = captureCall(() => instance.createAlert({ price: 101 }));
        results.createRender = {
            ...invariantMeasurement(instance, runtime),
            sameError: outcome.error === sentinel,
            trace: [...fault.trace]
        };
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source, { kill });
        const instance = makeInstance(runtime, [defaultAlert('delete-me')], { start: true });
        const fault = installFaultableSideEffects(instance);
        const sentinel = new Error('Q8 delete render fault');
        fault.stage = 'render';
        fault.error = sentinel;
        const outcome = captureCall(() => instance.deleteAlert('delete-me'));
        results.deleteRender = {
            ...invariantMeasurement(instance, runtime),
            sameError: outcome.error === sentinel,
            trace: [...fault.trace]
        };
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source, { kill });
        const instance = makeInstance(runtime, [defaultAlert('clear-me')], { start: true });
        const fault = installFaultableSideEffects(instance);
        const sentinel = new Error('Q8 clear render fault');
        fault.stage = 'render';
        fault.error = sentinel;
        const outcome = captureCall(() => instance.clearAllAlerts());
        results.clearRender = {
            ...invariantMeasurement(instance, runtime),
            sameError: outcome.error === sentinel,
            trace: [...fault.trace]
        };
        cleanupInstance(instance, runtime);
    }

    return results;
}

function runFaultMatrix(source) {
    const rows = [];

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const sentinel = new Error('Q8 create pre-mutation option fault');
        const options = {};
        Object.defineProperty(options, 'symbol', {
            get() {
                throw sentinel;
            }
        });
        const outcome = captureCall(() => instance.createAlert(options));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'create-before-mutation',
            pass: outcome.error === sentinel && measurement.invariant,
            sameError: outcome.error === sentinel,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const sentinel = new Error('Q8 create mutates-then-throws fault');
        Object.defineProperty(instance.alerts, 'push', {
            configurable: true,
            value(...items) {
                Array.prototype.push.apply(this, items);
                throw sentinel;
            }
        });
        const priorHandle = instance.checkInterval;
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        const outcome = captureCall(() => instance.createAlert({ price: 101.5 }));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'create-partial-mutation-rolls-back',
            pass: outcome.error === sentinel
                && measurement.alertCount === 0
                && measurement.invariant
                && instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            sameError: outcome.error === sentinel,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    for (const stage of ['persistence', 'render', 'list', 'badge', 'notification']) {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const fault = installFaultableSideEffects(instance);
        const sentinel = new Error(`Q8 create ${stage} fault`);
        fault.stage = stage;
        fault.error = sentinel;
        const outcome = captureCall(() => instance.createAlert({ price: 102 }));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: `create-after-mutation-${stage}`,
            pass: outcome.error === sentinel && measurement.invariant,
            sameError: outcome.error === sentinel,
            trace: [...fault.trace],
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const sentinel = new Error('Q8 storage setItem fault');
        runtime.storage.setFault = sentinel;
        const outcome = captureCall(() => instance.createAlert({ price: 103 }));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'create-storage-failure-preserves-swallow-contract',
            pass: outcome.error == null
                && runtime.storage.setCalls === 1
                && measurement.invariant,
            outwardError: outcome.error ? outcome.error.message : null,
            storageSetCalls: runtime.storage.setCalls,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('proxy-delete')], { start: true });
        const sentinel = new Error('Q8 delete pre-mutation find fault');
        instance.alerts = new Proxy(instance.alerts, {
            get(target, property, receiver) {
                if (property === 'findIndex') throw sentinel;
                return Reflect.get(target, property, receiver);
            }
        });
        const outcome = captureCall(() => instance.deleteAlert('proxy-delete'));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'delete-before-mutation',
            pass: outcome.error === sentinel && measurement.invariant,
            sameError: outcome.error === sentinel,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('mid-delete')], { start: true });
        const sentinel = new Error('Q8 delete mutates-then-throws fault');
        Object.defineProperty(instance.alerts, 'splice', {
            configurable: true,
            value(...args) {
                Array.prototype.splice.apply(this, args);
                throw sentinel;
            }
        });
        const priorHandle = instance.checkInterval;
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        const outcome = captureCall(() => instance.deleteAlert('mid-delete'));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'delete-partial-mutation-rolls-back',
            pass: outcome.error === sentinel
                && measurement.alertCount === 1
                && measurement.invariant
                && instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            sameError: outcome.error === sentinel,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    for (const stage of ['persistence', 'render', 'list', 'badge', 'notification']) {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert(`delete-${stage}`)], { start: true });
        const fault = installFaultableSideEffects(instance);
        const sentinel = new Error(`Q8 delete ${stage} fault`);
        fault.stage = stage;
        fault.error = sentinel;
        const outcome = captureCall(() => instance.deleteAlert(`delete-${stage}`));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: `delete-after-mutation-${stage}`,
            pass: outcome.error === sentinel && measurement.invariant,
            sameError: outcome.error === sentinel,
            trace: [...fault.trace],
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('confirm-clear')], { start: true });
        const sentinel = new Error('Q8 clear confirm fault');
        runtime.setConfirm(() => {
            throw sentinel;
        });
        const outcome = captureCall(() => instance.clearAllAlerts());
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'clear-before-mutation-confirm',
            pass: outcome.error === sentinel && measurement.invariant,
            sameError: outcome.error === sentinel,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('mid-clear')], { start: true });
        const sentinel = new Error('Q8 clear mutates-then-throws fault');
        let injected = false;
        const proxy = new Proxy(instance, {
            set(target, property, value, receiver) {
                const committed = Reflect.set(target, property, value, receiver);
                if (property === 'alerts' && !injected) {
                    injected = true;
                    throw sentinel;
                }
                return committed;
            }
        });
        const priorHandle = instance.checkInterval;
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        const outcome = captureCall(() => proxy.clearAllAlerts());
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'clear-partial-mutation-rolls-back',
            pass: outcome.error === sentinel
                && measurement.alertCount === 1
                && measurement.invariant
                && instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            sameError: outcome.error === sentinel,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    for (const stage of ['persistence', 'render', 'list', 'badge']) {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert(`clear-${stage}`)], { start: true });
        const fault = installFaultableSideEffects(instance);
        const sentinel = new Error(`Q8 clear ${stage} fault`);
        fault.stage = stage;
        fault.error = sentinel;
        const outcome = captureCall(() => instance.clearAllAlerts());
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: `clear-after-mutation-${stage}`,
            pass: outcome.error === sentinel && measurement.invariant,
            sameError: outcome.error === sentinel,
            trace: [...fault.trace],
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('confirm-false')], { start: true });
        runtime.setConfirm(() => false);
        const outcome = captureCall(() => instance.clearAllAlerts());
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'clear-cancel-keeps-state-and-checker',
            pass: outcome.error == null
                && measurement.alertCount === 1
                && measurement.invariant,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    return rows;
}

function runStressLifecycle(source) {
    const runtime = loadProduct(source);
    const instance = makeInstance(runtime);
    const fault = installFaultableSideEffects(instance);
    const failureStages = ['persistence', 'render', 'list', 'badge', 'notification'];
    const failures = [];

    for (let cycle = 0; cycle < 100; cycle += 1) {
        let sentinel = new Error(`Q8 repeated create fault ${cycle}`);
        fault.stage = failureStages[cycle % failureStages.length];
        fault.error = sentinel;
        fault.trace.length = 0;
        let outcome = captureCall(() => instance.createAlert({ price: 100 + cycle }));
        let measurement = invariantMeasurement(instance, runtime);
        if (outcome.error !== sentinel || !measurement.invariant || measurement.alertCount !== 1) {
            failures.push({ cycle, operation: 'create', measurement });
        }

        const createdId = instance.alerts[0].id;
        sentinel = new Error(`Q8 repeated delete fault ${cycle}`);
        fault.stage = failureStages[(cycle + 2) % failureStages.length];
        fault.error = sentinel;
        fault.trace.length = 0;
        outcome = captureCall(() => instance.deleteAlert(createdId));
        measurement = invariantMeasurement(instance, runtime);
        if (outcome.error !== sentinel || !measurement.invariant || measurement.alertCount !== 0) {
            failures.push({ cycle, operation: 'delete', measurement });
        }
    }

    fault.stage = null;
    fault.error = null;
    const first = instance.createAlert({ price: 201 });
    const second = instance.createAlert({ price: 202 });
    const third = instance.createAlert({ price: 203 });
    const rapidMeasurements = [invariantMeasurement(instance, runtime)];
    instance.deleteAlert(second.id);
    rapidMeasurements.push(invariantMeasurement(instance, runtime));
    instance.createAlert({ price: 204 });
    rapidMeasurements.push(invariantMeasurement(instance, runtime));
    instance.deleteAlert(first.id);
    instance.deleteAlert(third.id);
    rapidMeasurements.push(invariantMeasurement(instance, runtime));
    instance.clearAllAlerts();
    rapidMeasurements.push(invariantMeasurement(instance, runtime));

    const survivor = instance.createAlert({ price: 205 });
    const beforeDestroy = invariantMeasurement(instance, runtime);
    instance.destroy();
    const afterDestroy = invariantMeasurement(instance, runtime);

    instance.loadAlerts = () => {};
    instance.setupUI = () => {};
    instance.setupEventListeners = () => {};
    instance.initAlertSound = () => {};
    instance.alerts = [{ ...survivor }];
    instance.init();
    const afterReinit = invariantMeasurement(instance, runtime);
    instance.init();
    const afterSecondReinit = invariantMeasurement(instance, runtime);

    runtime.context.document.hidden = true;
    let hiddenChecks = 0;
    instance.checkAlerts = () => {
        hiddenChecks += 1;
    };
    runtime.runActiveTimers();
    const hiddenMeasurement = invariantMeasurement(instance, runtime);

    instance.alerts = [];
    instance.destroy();
    instance.init();
    const zeroAlertReinit = invariantMeasurement(instance, runtime);
    instance.destroy();
    const finalActiveTimers = runtime.activeTimers.size;

    return {
        cycles: 100,
        failures,
        maxActiveTimers: runtime.timerStats.maxActive,
        timerStarts: runtime.timerStats.starts,
        timerClears: runtime.timerStats.clears,
        rapidInvariant: rapidMeasurements.every((measurement) => measurement.invariant),
        rapidMeasurements,
        beforeDestroy,
        afterDestroy,
        afterReinit,
        afterSecondReinit,
        hiddenChecks,
        hiddenMeasurement,
        zeroAlertReinit,
        callbackErrors: runtime.timerStats.callbackErrors.length,
        finalActiveTimers
    };
}

function runLegacyTrace(source) {
    const runtime = loadProduct(source, { kill: true });
    const instance = makeInstance(runtime, [], { bootstrap: false });
    const fault = installFaultableSideEffects(instance);

    instance.startAlertChecker();
    const zeroAlertStart = invariantMeasurement(instance, runtime);
    instance.startAlertChecker();
    instance.startAlertChecker();
    const afterRestarts = invariantMeasurement(instance, runtime);

    const sentinel = new Error('Q8 legacy render fault');
    fault.stage = 'render';
    fault.error = sentinel;
    const createOutcome = captureCall(() => instance.createAlert({ price: 301 }));
    const afterCreateThrow = {
        ...invariantMeasurement(instance, runtime),
        sameError: createOutcome.error === sentinel,
        trace: [...fault.trace]
    };

    instance.destroy();
    const afterAmplifiedDestroy = invariantMeasurement(instance, runtime);
    const leakedBeforeHarnessCleanup = runtime.activeTimers.size;
    runtime.clearHarnessTimers();

    const stableRuntime = loadProduct(source, { kill: true });
    const stableInstance = makeInstance(stableRuntime, [], { bootstrap: false });
    const stableFault = installFaultableSideEffects(stableInstance);
    stableInstance.startAlertChecker();
    stableInstance.createAlert({ price: 302 });
    const afterSuccessfulCreate = invariantMeasurement(stableInstance, stableRuntime);
    const id = stableInstance.alerts[0].id;
    stableInstance.deleteAlert(id);
    const afterSuccessfulDelete = invariantMeasurement(stableInstance, stableRuntime);
    stableInstance.destroy();
    const afterStableDestroy = invariantMeasurement(stableInstance, stableRuntime);
    const stableTrace = [...stableFault.trace];
    stableRuntime.clearHarnessTimers();

    return {
        zeroAlertStart,
        afterRestarts,
        afterCreateThrow,
        afterAmplifiedDestroy,
        leakedBeforeHarnessCleanup,
        timerStats: {
            starts: runtime.timerStats.starts,
            clears: runtime.timerStats.clears,
            maxActive: runtime.timerStats.maxActive
        },
        successfulMutationPath: {
            afterSuccessfulCreate,
            afterSuccessfulDelete,
            afterStableDestroy,
            trace: stableTrace
        }
    };
}

function installTimerFault(runtime, { target, timing, persistent = false }) {
    const originalSet = runtime.context.setInterval;
    const originalClear = runtime.context.clearInterval;
    const error = new Error(`Q8 ${target} ${timing} timer fault`);
    const events = [];
    let remaining = persistent ? Number.POSITIVE_INFINITY : 1;

    runtime.context.setInterval = (callback, delay) => {
        events.push('set:call');
        if (target === 'set' && remaining > 0 && timing === 'before') {
            remaining -= 1;
            events.push('set:throw-before');
            throw error;
        }
        const handle = originalSet(callback, delay);
        events.push(`set:effect:${handle}`);
        if (target === 'set' && remaining > 0 && timing === 'after') {
            remaining -= 1;
            events.push('set:throw-after');
            throw error;
        }
        return handle;
    };
    runtime.context.clearInterval = (handle) => {
        events.push(`clear:call:${handle}`);
        if (target === 'clear' && remaining > 0 && timing === 'before') {
            remaining -= 1;
            events.push('clear:throw-before');
            throw error;
        }
        originalClear(handle);
        events.push(`clear:effect:${handle}`);
        if (target === 'clear' && remaining > 0 && timing === 'after') {
            remaining -= 1;
            events.push('clear:throw-after');
            throw error;
        }
    };

    return {
        error,
        events,
        restore() {
            runtime.context.setInterval = originalSet;
            runtime.context.clearInterval = originalClear;
        }
    };
}

function runTimerFaultTransactions(source) {
    const rows = [];

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const primary = new Error('Q8 primary create render failure');
        instance.renderAlertLines = () => { throw primary; };
        const timerFault = installTimerFault(runtime, {
            target: 'set',
            timing: 'before',
            persistent: true
        });
        const outcome = captureCall(() => instance.createAlert({ price: 401 }));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'primary-create-error-survives-start-failure',
            pass: outcome.error === primary
                && measurement.alertCount === 0
                && measurement.intervalCount === 0
                && instance.checkInterval == null,
            samePrimary: outcome.error === primary,
            timerEvents: [...timerFault.events],
            ...measurement
        });
        timerFault.restore();
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const primary = new Error('Q8 primary survives hostile diagnostics');
        instance.renderAlertLines = () => { throw primary; };
        runtime.context.console.error = () => {
            throw new Error('Q8 diagnostic sink failure');
        };
        const timerFault = installTimerFault(runtime, {
            target: 'set',
            timing: 'before',
            persistent: true
        });
        const outcome = captureCall(() => instance.createAlert({ price: 401.5 }));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'secondary-diagnostic-failure-never-masks-primary',
            pass: outcome.error === primary
                && measurement.alertCount === 0
                && measurement.intervalCount === 0
                && instance.checkInterval == null,
            samePrimary: outcome.error === primary,
            timerEvents: [...timerFault.events],
            ...measurement
        });
        timerFault.restore();
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const timerFault = installTimerFault(runtime, {
            target: 'set',
            timing: 'before',
            persistent: true
        });
        const outcome = captureCall(() => instance.createAlert({ price: 402 }));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'start-only-failure-rolls-back-and-escapes',
            pass: outcome.error === timerFault.error
                && measurement.alertCount === 0
                && measurement.intervalCount === 0
                && instance.checkInterval == null,
            sameTimerError: outcome.error === timerFault.error,
            timerEvents: [...timerFault.events],
            ...measurement
        });
        timerFault.restore();
        cleanupInstance(instance, runtime);
    }

    for (const timing of ['before', 'after']) {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert(`delete-${timing}`)], { start: true });
        const priorHandle = instance.checkInterval;
        const primary = new Error(`Q8 primary delete render ${timing}`);
        instance.renderAlertLines = () => { throw primary; };
        const timerFault = installTimerFault(runtime, {
            target: 'clear',
            timing,
            persistent: false
        });
        const outcome = captureCall(() => instance.deleteAlert(`delete-${timing}`));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: `primary-delete-error-survives-stop-${timing}-effect`,
            pass: outcome.error === primary
                && measurement.alertCount === 0
                && measurement.intervalCount === 0
                && instance.checkInterval == null
                && priorHandle != null,
            samePrimary: outcome.error === primary,
            priorHandle,
            timerEvents: [...timerFault.events],
            ...measurement
        });
        timerFault.restore();
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('rollback-delete')], { start: true });
        const priorHandle = instance.checkInterval;
        const primary = new Error('Q8 primary delete render persistent stop fault');
        instance.renderAlertLines = () => { throw primary; };
        const timerFault = installTimerFault(runtime, {
            target: 'clear',
            timing: 'before',
            persistent: true
        });
        const outcome = captureCall(() => instance.deleteAlert('rollback-delete'));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'persistent-stop-failure-restores-prior-state-ownership',
            pass: outcome.error === primary
                && measurement.alertCount === 1
                && measurement.intervalCount === 1
                && instance.checkInterval === priorHandle
                && runtime.activeTimers.has(priorHandle),
            samePrimary: outcome.error === primary,
            priorHandle,
            timerEvents: [...timerFault.events],
            ...measurement
        });
        timerFault.restore();
        cleanupInstance(instance, runtime);
    }

    return rows;
}

function dropAllOwnedTimers(instance, runtime) {
    for (const handle of [...runtime.activeTimers.keys()]) {
        runtime.context.clearInterval(handle);
    }
    if (
        instance._m20Q8CheckerHandles
        && typeof instance._m20Q8CheckerHandles.clear === 'function'
    ) {
        instance._m20Q8CheckerHandles.clear();
    }
    instance.checkInterval = null;
}

function runMutationAndOwnershipMatrix(source) {
    const rows = [];

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('partial-update')], { start: true });
        const priorHandle = instance.checkInterval;
        const sentinel = new Error('Q8 partial Object.assign failure');
        const updates = { price: 777 };
        Object.defineProperty(updates, 'message', {
            enumerable: true,
            get() { throw sentinel; }
        });
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        const outcome = captureCall(() => instance.updateAlert('partial-update', updates));
        rows.push({
            name: 'update-partial-property-write-rolls-back-without-reconcile',
            pass: outcome.error === sentinel
                && instance.alerts[0].price === 100
                && instance.alerts[0].message === 'test'
                && instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            sameError: outcome.error === sentinel,
            price: instance.alerts[0].price,
            message: instance.alerts[0].message,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('partial-toggle')], { start: true });
        const alert = instance.alerts[0];
        const sentinel = new Error('Q8 partial toggle setter failure');
        Object.defineProperty(alert, '_activeValue', {
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(alert, 'active', {
            configurable: true,
            enumerable: true,
            get() { return this._activeValue; },
            set(value) {
                this._activeValue = value;
                throw sentinel;
            }
        });
        const priorHandle = instance.checkInterval;
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        const outcome = captureCall(() => instance.toggleAlert('partial-toggle'));
        rows.push({
            name: 'toggle-partial-setter-rolls-back-without-reconcile',
            pass: outcome.error === sentinel
                && alert.active === true
                && alert._activeValue === true
                && instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            sameError: outcome.error === sentinel,
            active: alert.active,
            backing: alert._activeValue,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const sentinel = new Error('Q8 partial save failure');
        instance.saveAlerts = () => {
            instance.alerts[instance.alerts.length - 1].message = 'partial-save-write';
            throw sentinel;
        };
        const outcome = captureCall(() => instance.createAlert({ price: 403 }));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'save-partial-state-write-restores-committed-mutation-shape',
            pass: outcome.error === sentinel
                && measurement.invariant
                && measurement.alertCount === 1
                && instance.alerts[0].message === 'Price crossing 403',
            sameError: outcome.error === sentinel,
            message: instance.alerts[0] && instance.alerts[0].message,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    for (const scenario of [
        { name: 'toggle-disable', operation: 'toggle', initialActive: true },
        { name: 'toggle-enable', operation: 'toggle', initialActive: false },
        { name: 'update', operation: 'update', initialActive: true }
    ]) {
        const runtime = loadProduct(source);
        const alert = defaultAlert(`${scenario.name}-stale`);
        alert.active = scenario.initialActive;
        const instance = makeInstance(runtime, [alert], { start: true });
        dropAllOwnedTimers(instance, runtime);
        const starts = runtime.timerStats.starts;
        const primary = new Error(`Q8 ${scenario.name} render failure`);
        instance.renderAlertLines = () => { throw primary; };
        const outcome = captureCall(() => {
            if (scenario.operation === 'toggle') instance.toggleAlert(`${scenario.name}-stale`);
            else instance.updateAlert(`${scenario.name}-stale`, { price: 404 });
        });
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: `${scenario.name}-render-failure-reconciles-committed-mutation`,
            pass: outcome.error === primary
                && measurement.invariant
                && measurement.alertCount === 1
                && runtime.timerStats.starts - starts === 1
                && (
                    scenario.operation !== 'toggle'
                    || instance.alerts[0].active === !scenario.initialActive
                ),
            samePrimary: outcome.error === primary,
            active: instance.alerts[0].active,
            startDelta: runtime.timerStats.starts - starts,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('same-update')], { start: true });
        const priorHandle = instance.checkInterval;
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        instance.updateAlert('same-update', { price: 100 });
        rows.push({
            name: 'same-value-update-does-not-reconcile-or-replace-handle',
            pass: instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        let firstHandle = null;
        for (let index = 0; index < 50; index += 1) {
            instance.createAlert({ price: 500 + index });
            if (index === 0) firstHandle = instance.checkInterval;
        }
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'fifty-adds-start-once-with-zero-clear-churn',
            pass: measurement.invariant
                && measurement.alertCount === 50
                && runtime.timerStats.starts - starts === 1
                && runtime.timerStats.clears - clears === 0
                && instance.checkInterval === firstHandle,
            firstHandle,
            handleStable: instance.checkInterval === firstHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime);
        let depth = 0;
        instance.renderAlertLines = () => {
            if (depth === 0) {
                depth += 1;
                instance.createAlert({ price: 602 });
                depth -= 1;
            }
        };
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        instance.createAlert({ price: 601 });
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'nested-create-create-starts-once',
            pass: measurement.invariant
                && measurement.alertCount === 2
                && runtime.timerStats.starts - starts === 1
                && runtime.timerStats.clears - clears === 0,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('nested-delete')], { start: true });
        const priorHandle = instance.checkInterval;
        let depth = 0;
        instance.renderAlertLines = () => {
            if (depth === 0) {
                depth += 1;
                instance.createAlert({ price: 603 });
                depth -= 1;
            }
        };
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        instance.deleteAlert('nested-delete');
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'nested-delete-create-keeps-prior-live-handle',
            pass: measurement.invariant
                && measurement.alertCount === 1
                && instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            priorHandle,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('nested-toggle-update')], { start: true });
        const priorHandle = instance.checkInterval;
        const sentinel = new Error('Q8 nested toggle/update render failure');
        let renderCalls = 0;
        instance.renderAlertLines = () => {
            renderCalls += 1;
            if (renderCalls === 1) {
                instance.updateAlert('nested-toggle-update', { price: 909 });
                return;
            }
            throw sentinel;
        };
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        const outcome = captureCall(() => instance.toggleAlert('nested-toggle-update'));
        const measurement = invariantMeasurement(instance, runtime);
        rows.push({
            name: 'nested-toggle-update-preserves-inner-error-and-live-handle',
            pass: outcome.error === sentinel
                && measurement.invariant
                && instance.alerts[0].active === false
                && instance.alerts[0].price === 909
                && instance.checkInterval === priorHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears === clears,
            sameError: outcome.error === sentinel,
            active: instance.alerts[0].active,
            price: instance.alerts[0].price,
            handleStable: instance.checkInterval === priorHandle,
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears,
            ...measurement
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('ledger')], { start: true });
        const primaryHandle = instance.checkInterval;
        const hasLedger = instance._m20Q8CheckerHandles
            && typeof instance._m20Q8CheckerHandles.add === 'function';
        const ledger = hasLedger
            ? instance._m20Q8CheckerHandles
            : new Set([primaryHandle]);
        if (!hasLedger) {
            instance._m20Q8CheckerHandles = ledger;
        }
        const untrackedHandle = runtime.context.setInterval(() => {}, 500);
        instance.checkInterval = untrackedHandle;
        const starts = runtime.timerStats.starts;
        const clears = runtime.timerStats.clears;
        instance.updateAlert('ledger', { price: 405 });
        rows.push({
            name: 'untracked-active-primary-is-cleared-and-owned-handle-restored',
            pass: runtime.activeTimers.size === 1
                && runtime.activeTimers.has(primaryHandle)
                && instance.checkInterval === primaryHandle
                && runtime.timerStats.starts === starts
                && runtime.timerStats.clears - clears === 1,
            primaryHandle,
            untrackedHandle,
            active: [...runtime.activeTimers.keys()],
            startDelta: runtime.timerStats.starts - starts,
            clearDelta: runtime.timerStats.clears - clears
        });

        const extraHandle = runtime.context.setInterval(() => {}, 500);
        ledger.add(extraHandle);
        const extraStarts = runtime.timerStats.starts;
        const extraClears = runtime.timerStats.clears;
        instance.updateAlert('ledger', { price: 406 });
        rows.push({
            name: 'manager-ledger-clears-secondary-owned-handle-only',
            pass: runtime.activeTimers.size === 1
                && runtime.activeTimers.has(primaryHandle)
                && instance.checkInterval === primaryHandle
                && runtime.timerStats.starts === extraStarts
                && runtime.timerStats.clears - extraClears === 1,
            primaryHandle,
            extraHandle,
            active: [...runtime.activeTimers.keys()],
            startDelta: runtime.timerStats.starts - extraStarts,
            clearDelta: runtime.timerStats.clears - extraClears
        });

        instance.checkInterval = 987654;
        const staleStarts = runtime.timerStats.starts;
        const staleClears = runtime.timerStats.clears;
        instance.updateAlert('ledger', { message: 'stale pointer repair' });
        rows.push({
            name: 'stale-primary-handle-rebinds-to-owned-live-handle',
            pass: instance.checkInterval === primaryHandle
                && runtime.activeTimers.size === 1
                && runtime.activeTimers.has(primaryHandle)
                && runtime.timerStats.starts === staleStarts
                && runtime.timerStats.clears - staleClears === 1,
            primaryHandle,
            currentHandle: instance.checkInterval,
            active: [...runtime.activeTimers.keys()],
            startDelta: runtime.timerStats.starts - staleStarts,
            clearDelta: runtime.timerStats.clears - staleClears
        });
        cleanupInstance(instance, runtime);
    }

    {
        const runtime = loadProduct(source);
        const first = makeInstance(runtime);
        const second = makeInstance(runtime);
        first.createAlert({ price: 701 });
        second.createAlert({ price: 702 });
        const secondHandle = second.checkInterval;
        first.deleteAlert(first.alerts[0].id);
        rows.push({
            name: 'manager-instances-keep-isolated-timer-ownership',
            pass: runtime.activeTimers.size === 1
                && runtime.activeTimers.has(secondHandle)
                && second.checkInterval === secondHandle
                && second.alerts.length === 1,
            active: [...runtime.activeTimers.keys()],
            secondHandle,
            secondStable: second.checkInterval === secondHandle
        });
        cleanupInstance(first, runtime);
        cleanupInstance(second, runtime);
    }

    {
        const runtime = loadProduct(source);
        const instance = makeInstance(runtime, [defaultAlert('callback')], { start: true });
        const sentinel = new Error('Q8 checker callback failure');
        const priorHandle = instance.checkInterval;
        instance.checkAlerts = () => { throw sentinel; };
        runtime.runActiveTimers();
        rows.push({
            name: 'checker-callback-fault-remains-outward-to-timer-host',
            pass: runtime.timerStats.callbackErrors.length === 1
                && runtime.timerStats.callbackErrors[0] === sentinel
                && instance.checkInterval === priorHandle
                && runtime.activeTimers.has(priorHandle),
            callbackErrors: runtime.timerStats.callbackErrors.length,
            sameError: runtime.timerStats.callbackErrors[0] === sentinel,
            handleStable: instance.checkInterval === priorHandle
        });
        cleanupInstance(instance, runtime);
    }

    return rows;
}

function runSwitchGetterTrace(source) {
    const scenarios = [
        { name: 'start-zero', alerts: [], invoke: (instance) => instance.startAlertChecker() },
        { name: 'create-success', alerts: [], invoke: (instance) => instance.createAlert({ price: 801 }) },
        { name: 'create-render-throw', alerts: [], fault: 'render', invoke: (instance) => instance.createAlert({ price: 802 }) },
        { name: 'update-success', alerts: [defaultAlert('u')], invoke: (instance) => instance.updateAlert('u', { price: 803 }) },
        { name: 'toggle-success', alerts: [defaultAlert('t')], invoke: (instance) => instance.toggleAlert('t') },
        { name: 'delete-success', alerts: [defaultAlert('d')], invoke: (instance) => instance.deleteAlert('d') },
        { name: 'delete-render-throw', alerts: [defaultAlert('dr')], fault: 'render', invoke: (instance) => instance.deleteAlert('dr') },
        { name: 'clear-success', alerts: [defaultAlert('c')], invoke: (instance) => instance.clearAllAlerts() },
        { name: 'clear-render-throw', alerts: [defaultAlert('cr')], fault: 'render', invoke: (instance) => instance.clearAllAlerts() }
    ];

    return scenarios.map((scenario) => {
        const runtime = loadProduct(source, { kill: true });
        const events = [];
        Object.defineProperty(runtime.context.window, KILL_SWITCH, {
            configurable: true,
            get() {
                events.push('switch:get');
                return true;
            },
            set(value) {
                events.push(`switch:set:${String(value)}`);
            }
        });
        const originalSet = runtime.context.setInterval;
        const originalClear = runtime.context.clearInterval;
        runtime.context.setInterval = (callback, delay) => {
            events.push(`timer:set:${delay}`);
            const handle = originalSet(callback, delay);
            events.push(`timer:set-result:${handle}`);
            return handle;
        };
        runtime.context.clearInterval = (handle) => {
            events.push(`timer:clear:${handle}`);
            originalClear(handle);
        };
        runtime.context.console.log = () => events.push('console:log');
        runtime.context.console.warn = () => events.push('console:warn');
        runtime.context.console.error = () => events.push('console:error');

        const raw = makeInstance(runtime, scenario.alerts, { bootstrap: false });
        const trackedAlerts = raw.alerts.map((alert) => new Proxy(alert, {
            set(target, property, value, receiver) {
                events.push(`alert:set:${String(property)}:${String(value)}`);
                return Reflect.set(target, property, value, receiver);
            }
        }));
        raw.alerts = new Proxy(trackedAlerts, {
            get(target, property, receiver) {
                if (property === 'push' || property === 'splice') {
                    return (...args) => {
                        events.push(`array:${String(property)}:before:${target.length}`);
                        const result = Array.prototype[property].apply(target, args);
                        events.push(`array:${String(property)}:after:${target.length}`);
                        return result;
                    };
                }
                return Reflect.get(target, property, receiver);
            }
        });
        const instance = new Proxy(raw, {
            set(target, property, value, receiver) {
                if (property === 'checkInterval' || property === 'alerts') {
                    const rendered = property === 'alerts'
                        ? `array(${value && value.length})`
                        : String(value);
                    events.push(`instance:set:${String(property)}:${rendered}`);
                }
                return Reflect.set(target, property, value, receiver);
            }
        });
        const sentinel = new Error(`Q8 trace ${scenario.name}`);
        const sideEffect = (name) => {
            events.push(name);
            if (scenario.fault === name) throw sentinel;
        };
        instance.saveAlerts = () => sideEffect('save');
        instance.renderAlertLines = () => sideEffect('render');
        instance.refreshAlertsList = () => sideEffect('list');
        instance.updateBadge = () => sideEffect('badge');
        instance.chart.showNotification = () => sideEffect('notification');

        const outcome = captureCall(() => scenario.invoke(instance));
        const normalizedReturn = outcome.error
            ? 'throw'
            : outcome.value === undefined
                ? 'undefined'
                : raw.alerts.includes(outcome.value)
                    ? 'alert'
                    : typeof outcome.value;
        const result = {
            name: scenario.name,
            events,
            error: outcome.error === sentinel
                ? 'sentinel'
                : outcome.error
                    ? `${outcome.error.name}:${outcome.error.message}`
                    : null,
            normalizedReturn,
            alertCount: raw.alerts.length,
            activeValues: raw.alerts.map((alert) => alert.active),
            prices: raw.alerts.map((alert) => alert.price),
            checkInterval: raw.checkInterval == null ? null : raw.checkInterval,
            activeTimers: [...runtime.activeTimers.keys()]
        };
        runtime.clearHarnessTimers();
        return result;
    });
}

test('Q8 provenance: exact immutable parent and current dual-tree product bytes', () => {
    const checks = {
        exactCommit: resolvedBaseCommit === BASE_COMMIT,
        immutableCanonicalHash: hashes.baseCanonicalSha256 === BASE_PRODUCT_SHA256,
        immutableHomepageHash: hashes.baseHomepageSha256 === BASE_PRODUCT_SHA256,
        immutableTreeParity: baseCanonicalBytes.equals(baseHomepageBytes),
        rejectedFixtureHash: hashes.rejectedSha256 === REJECTED_PRODUCT_SHA256,
        currentTreeParity: currentCanonicalBytes.equals(currentHomepageBytes),
        statusPendingFreshReview: STATUS === 'PENDING-FRESH-GPT-REVIEW',
        canonicalEvidenceRoot: EVIDENCE_DIR === path.join(PACKET_DIR, 'evidence'),
        packetScopeIsNotIgnored: !gitPathIgnored(
            'chart v 1.4/chart/modules/m20-q8-transaction-packet'
        )
    };
    for (const [name, pass] of Object.entries(checks)) {
        note('provenance', name, pass, pass ? 'bound' : 'mismatch');
    }
    assert.ok(Object.values(checks).every(Boolean), `Q8 provenance failure: ${JSON.stringify(hashes)}`);
});

test('Q8 canonical root resolver rejects the homepage shadow root', () => {
    const homepageShadow = path.join(REPO_ROOT, 'homepage');
    const checks = {
        exactRepositoryRoot: fs.realpathSync(REPO_ROOT) === fs.realpathSync(
            gitText(['rev-parse', '--show-toplevel'])
        ),
        homepageShadowRejected: !isCanonicalRoot(homepageShadow),
        canonicalProductResolved: fs.realpathSync(CANONICAL_PRODUCT)
            === fs.realpathSync(path.join(REPO_ROOT, 'chart v 1.4/chart/modules/alert-system.js')),
        homepageProductResolved: fs.realpathSync(HOMEPAGE_PRODUCT)
            === fs.realpathSync(path.join(REPO_ROOT, 'homepage/public/chart/modules/alert-system.js'))
    };
    for (const [name, pass] of Object.entries(checks)) {
        note('provenance', `root-${name}`, pass, pass ? 'bound' : 'mismatch');
    }
    assert.ok(Object.values(checks).every(Boolean), `Q8 canonical root failure: ${JSON.stringify(checks)}`);
});

test('Q8 immutable parent reproduces create/delete/clear state-checker RED', () => {
    const result = runCoreThrowScenarios(baseSource);
    captured.immutableRed = result;
    const expectations = {
        createRender: {
            alertCount: 1,
            intervalCount: 0,
            sameError: true,
            invariant: false
        },
        deleteRender: {
            alertCount: 0,
            intervalCount: 1,
            sameError: true,
            invariant: false
        },
        clearRender: {
            alertCount: 0,
            intervalCount: 1,
            sameError: true,
            invariant: false
        }
    };
    const failures = [];
    for (const [name, expected] of Object.entries(expectations)) {
        const actual = result[name];
        const reproduced = Object.entries(expected).every(([key, value]) => actual[key] === value);
        note(
            'immutable-red',
            name,
            reproduced,
            `alerts=${actual.alertCount} intervals=${actual.intervalCount} invariant=${actual.invariant}`,
            actual
        );
        if (!reproduced) failures.push({ name, expected, actual });
    }
    assert.deepEqual(failures, [], `immutable RED did not reproduce exactly: ${JSON.stringify(failures)}`);
});

test('Q8 rejected 89ec4e7b snapshot replays every binding RED family', () => {
    const faultRows = runFaultMatrix(rejectedSource);
    const timerRows = runTimerFaultTransactions(rejectedSource);
    const ownershipRows = runMutationAndOwnershipMatrix(rejectedSource);
    const immutableSwitch = runSwitchGetterTrace(baseSource);
    const rejectedSwitch = runSwitchGetterTrace(rejectedSource);
    const observed = [
        ...faultRows.filter((row) => !row.pass).map((row) => `fault:${row.name}`),
        ...timerRows.filter((row) => !row.pass).map((row) => `timer:${row.name}`),
        ...ownershipRows.filter((row) => !row.pass).map((row) => `ownership:${row.name}`)
    ];
    if (JSON.stringify(rejectedSwitch) !== JSON.stringify(immutableSwitch)) {
        observed.push('kill:switch-getter-full-trace-drift');
    }
    const expected = [
        'fault:create-partial-mutation-rolls-back',
        'fault:delete-partial-mutation-rolls-back',
        'fault:clear-partial-mutation-rolls-back',
        'timer:primary-create-error-survives-start-failure',
        'timer:secondary-diagnostic-failure-never-masks-primary',
        'timer:start-only-failure-rolls-back-and-escapes',
        'timer:primary-delete-error-survives-stop-before-effect',
        'timer:primary-delete-error-survives-stop-after-effect',
        'timer:persistent-stop-failure-restores-prior-state-ownership',
        'ownership:update-partial-property-write-rolls-back-without-reconcile',
        'ownership:toggle-partial-setter-rolls-back-without-reconcile',
        'ownership:save-partial-state-write-restores-committed-mutation-shape',
        'ownership:toggle-disable-render-failure-reconciles-committed-mutation',
        'ownership:toggle-enable-render-failure-reconciles-committed-mutation',
        'ownership:update-render-failure-reconciles-committed-mutation',
        'ownership:fifty-adds-start-once-with-zero-clear-churn',
        'ownership:nested-create-create-starts-once',
        'ownership:nested-delete-create-keeps-prior-live-handle',
        'ownership:untracked-active-primary-is-cleared-and-owned-handle-restored',
        'ownership:manager-ledger-clears-secondary-owned-handle-only',
        'ownership:stale-primary-handle-rebinds-to-owned-live-handle',
        'kill:switch-getter-full-trace-drift'
    ].sort();
    observed.sort();
    captured.rejectedRed = {
        snapshotSha256: hashes.rejectedSha256,
        expectedFailures: expected,
        observedFailures: observed
    };
    for (const name of expected) {
        note(
            'rejected-red',
            name,
            observed.includes(name),
            observed.includes(name) ? 'binding RED reproduced' : 'missing'
        );
    }
    assert.deepEqual(observed, expected, 'rejected Q8 RED family changed or failed to replay');
});

test('Q8 current product closes create/delete/clear throw-path inconsistency', () => {
    const sources = {
        canonical: currentCanonicalSource,
        homepage: currentHomepageSource
    };
    const failures = [];
    for (const [tree, source] of Object.entries(sources)) {
        const result = runCoreThrowScenarios(source);
        captured.currentCore[tree] = result;
        for (const [name, actual] of Object.entries(result)) {
            const pass = actual.invariant && actual.sameError;
            note(
                'green',
                `${tree}-${name}`,
                pass,
                `alerts=${actual.alertCount} intervals=${actual.intervalCount} sameError=${actual.sameError}`,
                actual
            );
            if (!pass) failures.push({ tree, name, actual });
        }
    }
    assert.deepEqual(failures, [], `current Q8 core invariant failures: ${JSON.stringify(failures)}`);
});

test('Q8 current actual methods preserve invariant across injected fault matrix', () => {
    const failures = [];
    for (const [tree, source] of Object.entries({
        canonical: currentCanonicalSource,
        homepage: currentHomepageSource
    })) {
        const rows = runFaultMatrix(source);
        captured.currentFaults[tree] = rows;
        for (const row of rows) {
            note(
                'green',
                `${tree}-${row.name}`,
                row.pass,
                `alerts=${row.alertCount} intervals=${row.intervalCount} sameError=${row.sameError ?? 'n/a'}`,
                row
            );
            if (!row.pass) failures.push({ tree, ...row });
        }
    }
    assert.deepEqual(failures, [], `Q8 fault matrix failures: ${JSON.stringify(failures)}`);
});

test('Q8 preserves primary errors across start/stop faults or rolls back', () => {
    const failures = [];
    for (const [tree, source] of Object.entries({
        canonical: currentCanonicalSource,
        homepage: currentHomepageSource
    })) {
        const rows = runTimerFaultTransactions(source);
        captured.timerFaults[tree] = rows;
        for (const row of rows) {
            note(
                'green',
                `${tree}-${row.name}`,
                row.pass,
                `alerts=${row.alertCount} intervals=${row.intervalCount}`,
                row
            );
            if (!row.pass) failures.push({ tree, ...row });
        }
    }
    assert.deepEqual(failures, [], `Q8 timer transaction failures: ${JSON.stringify(failures)}`);
});

test('Q8 update/toggle, ownership, reentrancy, and no-churn contracts', () => {
    const failures = [];
    for (const [tree, source] of Object.entries({
        canonical: currentCanonicalSource,
        homepage: currentHomepageSource
    })) {
        const rows = runMutationAndOwnershipMatrix(source);
        captured.ownership[tree] = rows;
        for (const row of rows) {
            note(
                'green',
                `${tree}-${row.name}`,
                row.pass,
                `starts=${row.startDelta ?? 'n/a'} clears=${row.clearDelta ?? 'n/a'}`,
                row
            );
            if (!row.pass) failures.push({ tree, ...row });
        }
    }
    assert.deepEqual(failures, [], `Q8 ownership/mutation failures: ${JSON.stringify(failures)}`);
});

test('Q8 current survives 100 failure cycles, rapid order, destroy/reinit, and hidden ticks', () => {
    const failures = [];
    for (const [tree, source] of Object.entries({
        canonical: currentCanonicalSource,
        homepage: currentHomepageSource
    })) {
        const result = runStressLifecycle(source);
        captured.stress[tree] = result;
        const pass = result.failures.length === 0
            && result.maxActiveTimers === 1
            && result.rapidInvariant
            && result.beforeDestroy.invariant
            && result.afterDestroy.intervalCount === 0
            && result.afterReinit.invariant
            && result.afterReinit.intervalCount === 1
            && result.afterSecondReinit.invariant
            && result.afterSecondReinit.intervalCount === 1
            && result.hiddenChecks === 1
            && result.hiddenMeasurement.invariant
            && result.zeroAlertReinit.invariant
            && result.zeroAlertReinit.intervalCount === 0
            && result.callbackErrors === 0
            && result.finalActiveTimers === 0;
        note(
            'green',
            `${tree}-stress-lifecycle`,
            pass,
            `cycles=${result.cycles} max=${result.maxActiveTimers} final=${result.finalActiveTimers}`,
            result
        );
        if (!pass) failures.push({ tree, result });
    }
    assert.deepEqual(failures, [], `Q8 stress/lifecycle failures: ${JSON.stringify(failures)}`);
});

test('Q8 switch-OFF is exact immutable behavior including restart amplification', () => {
    const immutable = runLegacyTrace(baseSource);
    const canonical = runLegacyTrace(currentCanonicalSource);
    const homepage = runLegacyTrace(currentHomepageSource);
    captured.kill = { immutable, canonical, homepage };

    const canonicalExact = JSON.stringify(canonical) === JSON.stringify(immutable);
    const homepageExact = JSON.stringify(homepage) === JSON.stringify(immutable);
    note('kill', 'canonical-exact-immutable-trace', canonicalExact, '', canonical);
    note('kill', 'homepage-exact-immutable-trace', homepageExact, '', homepage);

    const legacyDiscriminators = {
        'zero-alert-always-on':
            immutable.zeroAlertStart.alertCount === 0
            && immutable.zeroAlertStart.intervalCount === 1,
        'restart-amplifies':
            immutable.afterRestarts.intervalCount === 3
            && immutable.timerStats.starts === 3
            && immutable.timerStats.clears === 1,
        'mutation-hook-does-not-amplify':
            immutable.successfulMutationPath.afterSuccessfulCreate.intervalCount === 1,
        'zero-after-delete-remains-on':
            immutable.successfulMutationPath.afterSuccessfulDelete.alertCount === 0
            && immutable.successfulMutationPath.afterSuccessfulDelete.intervalCount === 1,
        'amplified-destroy-retains-legacy-orphans':
            immutable.afterAmplifiedDestroy.intervalCount === 2
            && immutable.leakedBeforeHarnessCleanup === 2
    };
    for (const [name, pass] of Object.entries(legacyDiscriminators)) {
        note('kill', name, pass, pass ? 'legacy RED reproduced' : 'legacy drift', immutable);
    }

    assert.equal(canonicalExact, true, 'canonical kill path drifted from immutable parent');
    assert.equal(homepageExact, true, 'homepage kill path drifted from immutable parent');
    assert.ok(Object.values(legacyDiscriminators).every(Boolean), 'kill discrimination did not reproduce');
});

test('Q8 switch-OFF getter reads, writes, returns, exceptions, and timers are exact', () => {
    const immutable = runSwitchGetterTrace(baseSource);
    const canonical = runSwitchGetterTrace(currentCanonicalSource);
    const homepage = runSwitchGetterTrace(currentHomepageSource);
    captured.switchGetterTrace = { immutable, canonical, homepage };
    const canonicalExact = JSON.stringify(canonical) === JSON.stringify(immutable);
    const homepageExact = JSON.stringify(homepage) === JSON.stringify(immutable);
    note(
        'kill',
        'canonical-switch-getter-full-trace-exact',
        canonicalExact,
        canonicalExact ? 'exact' : 'drift',
        { immutable, current: canonical }
    );
    note(
        'kill',
        'homepage-switch-getter-full-trace-exact',
        homepageExact,
        homepageExact ? 'exact' : 'drift',
        { immutable, current: homepage }
    );
    assert.equal(canonicalExact, true, 'canonical switch getter/operation trace drifted');
    assert.equal(homepageExact, true, 'homepage switch getter/operation trace drifted');
});

test('Q8 opt-in evidence writer uses canonical atomic output', {
    skip: !ALLOWED_EVIDENCE_MODES.has(EVIDENCE_MODE)
}, () => {
    const selectedPhases = EVIDENCE_MODE === 'red'
        ? new Set(['provenance', 'immutable-red', 'rejected-red'])
        : EVIDENCE_MODE === 'green'
            ? new Set(['provenance', 'green'])
            : new Set(['provenance', 'kill']);
    const rows = evidenceRows.filter((row) => selectedPhases.has(row.phase));
    const failed = rows.filter((row) => !row.pass);
    const verdict = EVIDENCE_MODE === 'green'
        ? (failed.length === 0 ? 'GREEN' : 'FAIL')
        : (failed.length === 0 ? 'RED' : 'FAIL-DISCRIMINATION');
    const payload = {
        schema: 1,
        ticket: 'M20-Q8-ALERT-CHECKER-TRANSACTION',
        date: '2026-07-24',
        mode: EVIDENCE_MODE,
        status: STATUS,
        acceptanceClaimed: false,
        verdict,
        killSwitch: KILL_SWITCH,
        provenance: {
            repositoryRoot: REPO_ROOT,
            headCommit: gitText(['rev-parse', 'HEAD']),
            immutableCommit: BASE_COMMIT,
            immutableProductSha256: BASE_PRODUCT_SHA256,
            rejectedProductSha256: REJECTED_PRODUCT_SHA256,
            currentCanonicalSha256: hashes.currentCanonicalSha256,
            currentHomepageSha256: hashes.currentHomepageSha256,
            dualTreeParity: currentCanonicalBytes.equals(currentHomepageBytes)
        },
        summary: {
            total: rows.length,
            pass: rows.length - failed.length,
            fail: failed.length,
            immutableInvariantViolations: captured.immutableRed
                ? Object.values(captured.immutableRed).filter((row) => !row.invariant).length
                : null,
            rejectedBindingFailures: captured.rejectedRed
                ? captured.rejectedRed.observedFailures.length
                : null,
            killLegacyInvariantViolations: captured.kill.immutable
                ? [
                    captured.kill.immutable.zeroAlertStart,
                    captured.kill.immutable.afterRestarts,
                    captured.kill.immutable.successfulMutationPath.afterSuccessfulDelete,
                    captured.kill.immutable.afterAmplifiedDestroy
                ].filter((row) => !row.invariant).length
                : null
        },
        rows,
        measurements: captured
    };

    assert.equal(failed.length, 0, `refusing to write failed Q8 ${EVIDENCE_MODE} evidence`);
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    assert.equal(fs.realpathSync(EVIDENCE_DIR), fs.realpathSync(path.join(PACKET_DIR, 'evidence')));
    assert.equal(
        gitPathIgnored('chart v 1.4/chart/modules/m20-q8-transaction-packet'),
        false,
        'Q8 accepting packet must remain in normal nonignored scope'
    );
    const output = path.join(
        EVIDENCE_DIR,
        `W4-Q8-ALERT-CHECKER-TRANSACTION-20260724-${EVIDENCE_MODE}.json`
    );
    const temporary = `${output}.tmp-${process.pid}-${Date.now()}`;
    try {
        fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, {
            encoding: 'utf8',
            flag: 'wx'
        });
        fs.renameSync(temporary, output);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
    process.stdout.write(`Wrote canonical atomic Q8 evidence ${output} verdict=${verdict}\n`);
});
