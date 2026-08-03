import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

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

const ROOT = findRoot(HERE);
const CANONICAL = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
const source = fs.readFileSync(CANONICAL, 'utf8');
const mirrorSource = fs.readFileSync(MIRROR, 'utf8');

const M27_SWITCH = '__TALARIA_DISABLE_M27_ENGINE_RELEASE_V1';

function makeEnvironment({ kill = false, readyState = 'complete' } = {}) {
  const census = {
    targets: [],
    timers: new Map(),
    timerSeq: 0,
    removeFaults: [],
  };

  class FakeTarget {
    constructor(name) {
      this._name = name;
      this._listeners = new Map();
      census.targets.push(this);
    }

    addEventListener(type, listener) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
    }

    removeEventListener(type, listener) {
      const fault = census.removeFaults.find((entry) => (
        entry.remaining > 0
        && (!entry.type || entry.type === type)
        && (!entry.target || entry.target === this._name)
      ));
      if (fault) {
        fault.remaining -= 1;
        throw fault.error;
      }
      this._listeners.get(type)?.delete(listener);
    }

    dispatchEvent(event) {
      const value = typeof event === 'string' ? { type: event } : event;
      value.target ||= this;
      for (const listener of [...(this._listeners.get(value.type) || [])]) {
        if (typeof listener === 'function') listener.call(this, value);
        else if (listener && typeof listener.handleEvent === 'function') listener.handleEvent(value);
      }
      return true;
    }

    listeners(type) {
      return [...(this._listeners.get(type) || [])];
    }
  }

  class FakeElement extends FakeTarget {
    constructor(name, tagName = 'DIV') {
      super(name);
      this.tagName = tagName;
      this.id = '';
      this.style = {};
      this.dataset = {};
      this.children = [];
      this.parentElement = null;
      this.innerHTML = '';
      this.className = '';
      this.classList = {
        add() {},
        remove() {},
        toggle() {},
        contains() { return false; },
      };
    }

    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    }

    remove() {
      this.removed = true;
      if (this.parentElement && Array.isArray(this.parentElement.children)) {
        this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
      }
      this.parentElement = null;
    }

    querySelector() { return null; }
    querySelectorAll() { return []; }
    closest() { return null; }
    contains(value) { return this.children.includes(value); }
    setAttribute() {}
    getBoundingClientRect() { return { left: 10, top: 20, width: 220, height: 44 }; }
    setPointerCapture() {}
    releasePointerCapture() {}
  }

  const document = new FakeTarget('document');
  document.readyState = readyState;
  document.visibilityState = 'visible';
  document.body = new FakeElement('body', 'BODY');
  document.documentElement = new FakeElement('html', 'HTML');
  document.body.contains = (value) => !value?.removed;
  const ids = new Map();
  const toolbar = new FakeElement('toolbar');
  toolbar.id = 'replayToolbar';
  const handle = new FakeElement('handle');
  handle.id = 'replayToolbarHandle';
  const replayButton = new FakeElement('replay-button', 'BUTTON');
  replayButton.id = 'replayModeBtn';
  ids.set(toolbar.id, toolbar);
  ids.set(handle.id, handle);
  ids.set(replayButton.id, replayButton);
  document.getElementById = (id) => ids.get(id) || null;
  document.querySelector = () => null;
  document.querySelectorAll = () => [];
  document.createElement = (tag) => new FakeElement(`created:${tag}:${census.targets.length}`, String(tag).toUpperCase());

  const window = new FakeTarget('window');
  window[M27_SWITCH] = kill;
  window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  window.dispatchEvent = FakeTarget.prototype.dispatchEvent.bind(window);
  window.timezoneManager = {
    listeners: [],
    addListener(listener) { this.listeners.push(listener); },
    removeListener(listener) {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    },
  };

  const schedule = (kind, callback) => {
    const handleValue = ++census.timerSeq;
    census.timers.set(handleValue, { kind, callback, active: true });
    return handleValue;
  };
  const clear = (_kind, handleValue) => {
    const entry = census.timers.get(handleValue);
    if (entry) entry.active = false;
  };

  const context = {
    window,
    document,
    console: { log() {}, warn() {}, error() {} },
    userStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout: (callback) => schedule('timeout', callback),
    clearTimeout: (handleValue) => clear('timeout', handleValue),
    setInterval: (callback) => schedule('interval', callback),
    clearInterval: (handleValue) => clear('interval', handleValue),
    requestAnimationFrame: (callback) => schedule('raf', callback),
    cancelAnimationFrame: (handleValue) => clear('raf', handleValue),
    queueMicrotask: (callback) => schedule('microtask', callback),
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
    },
    Date,
    Math,
    Intl,
    JSON,
    Map,
    Set,
    WeakMap,
    WeakSet,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    TypeError,
    AggregateError,
  };

  census.activeTimers = () => [...census.timers.values()].filter((entry) => entry.active).length;
  census.pushRemoveFault = ({ type = null, target = null, remaining = 1, error = new Error('remove-fault') } = {}) => {
    census.removeFaults.push({ type, target, remaining, error });
    return error;
  };
  census.makeClone = () => {
    const clone = new FakeElement('floating-clone');
    clone.id = 'replayToolbarClone';
    ids.set(clone.id, clone);
    document.body.appendChild(clone);
    return clone;
  };

  return { context, census, document, window };
}

function loadRuntime(text, options = {}) {
  const env = makeEnvironment(options);
  const script = new vm.Script(`${text}\n;globalThis.__M27Runtime = ReplaySystem;`, {
    filename: 'replay-system.js',
  });
  const context = vm.createContext(env.context);
  script.runInContext(context);
  return { ...env, context, Runtime: context.__M27Runtime };
}

function makeChart({ orderManager = true, orderService = true } = {}) {
  const chart = {
    replaySystem: null,
    rawData: [{ t: 1, c: 10 }, { t: 2, c: 11 }],
    data: [],
    currentTimeframe: '1m',
    scheduleRender() {},
    resampleData(data) { return data; },
  };
  if (orderManager) {
    chart.orderManager = {};
    if (orderService) chart.orderManager.orderService = {};
  }
  return chart;
}

function makeLiveInstance({
  text = source,
  kill = false,
  orderManager = true,
  orderService = true,
  chart = makeChart({ orderManager, orderService }),
} = {}) {
  const env = loadRuntime(text, { kill });
  const instance = new env.Runtime(chart);
  chart.replaySystem = instance;
  if (chart.orderManager) chart.orderManager.replaySystem = instance;
  if (chart.orderManager?.orderService) chart.orderManager.orderService.replaySystem = instance;
  instance.fullData = [{ t: 1, c: 10 }];
  instance.fullRawData = [{ t: 1, c: 10 }];
  return { env, chart, instance };
}

function normalizeReport(report) {
  return {
    enabled: report.enabled,
    state: report.state,
    reason: report.reason,
    attempted: report.attempted,
    completed: report.completed,
    pending: report.pending,
    eventPending: report.eventPending,
    schedulerPending: report.schedulerPending,
    managerPending: report.managerPending,
    floatingPending: report.floatingPending,
    errors: report.errors,
  };
}

function replaceOnce(text, needle, replacement) {
  assert.equal(text.includes(needle), true, `mutation needle missing: ${needle}`);
  return text.replace(needle, replacement);
}

function cleanDrainReleaseOracle(text = source) {
  const { chart, instance } = makeLiveInstance({ text });
  const report = instance.destroy();
  assert.equal(report.state, 'destroyed');
  assert.equal(chart.replaySystem, null);
  assert.equal(chart.orderManager.replaySystem, null);
  assert.equal(chart.orderManager.orderService.replaySystem, null);
  assert.equal(instance.fullData, null);
  assert.equal(instance.fullRawData, null);
}

function identityOracle(text = source) {
  const { chart, instance } = makeLiveInstance({ text });
  const otherEngine = { name: 'other' };
  chart.orderManager.replaySystem = otherEngine;
  chart.orderManager.orderService.replaySystem = otherEngine;
  instance.destroy();
  assert.equal(chart.orderManager.replaySystem, otherEngine);
  assert.equal(chart.orderManager.orderService.replaySystem, otherEngine);
}

function killSwitchOracle(text = source) {
  const { chart, instance } = makeLiveInstance({ text, kill: true });
  const fullData = instance.fullData;
  const fullRawData = instance.fullRawData;
  const report = instance.destroy();
  assert.equal(report.state, 'destroyed');
  assert.equal(chart.replaySystem, null);
  assert.equal(chart.orderManager.replaySystem, instance);
  assert.equal(chart.orderManager.orderService.replaySystem, instance);
  assert.equal(instance.fullData, fullData);
  assert.equal(instance.fullRawData, fullRawData);
}

function partialDrainOracle(text = source) {
  const { env, chart, instance } = makeLiveInstance({ text });
  instance.makeCloneDraggable(env.census.makeClone());
  env.census.pushRemoveFault({ type: 'mousemove', remaining: 1, error: new Error('partial-drain') });
  assert.throws(() => instance.destroy());
  assert.equal(instance._m20Q6LifecycleState, 'destroy-pending');
  assert.equal(chart.replaySystem, instance);
  assert.equal(chart.orderManager.replaySystem, instance);
  assert.equal(chart.orderManager.orderService.replaySystem, instance);
  assert.notEqual(instance.fullData, null);
  assert.notEqual(instance.fullRawData, null);
}

test('M27 clean drain releases order retainers and replay data without changing report shape', () => {
  assert.equal(source, mirrorSource);
  const { instance } = makeLiveInstance();

  const report = instance.destroy();

  assert.deepEqual(Object.keys(normalizeReport(report)), [
    'enabled',
    'state',
    'reason',
    'attempted',
    'completed',
    'pending',
    'eventPending',
    'schedulerPending',
    'managerPending',
    'floatingPending',
    'errors',
  ]);
  cleanDrainReleaseOracle();
});

test('M27 release is identity checked and tolerates missing owners', () => {
  identityOracle();
  assert.doesNotThrow(() => makeLiveInstance({ orderManager: false }).instance.destroy());
  assert.doesNotThrow(() => makeLiveInstance({ orderService: false }).instance.destroy());
  const env = loadRuntime(source);
  const noChart = new env.Runtime(null);
  noChart.fullData = [{ t: 1 }];
  noChart.fullRawData = [{ t: 1 }];
  assert.doesNotThrow(() => noChart.destroy());
  assert.equal(noChart.fullData, null);
  assert.equal(noChart.fullRawData, null);
});

test('M27 kill switch keeps base retaining behavior', () => {
  killSwitchOracle();
});

test('M27 partial drain path does not release retained engine references', () => {
  partialDrainOracle();
});

test('M27 mutation check kills identity, pending-path, and kill-switch mutants', () => {
  identityOracle();
  killSwitchOracle();
  partialDrainOracle();

  const noIdentity = replaceOnce(
    replaceOnce(
      source,
      'if (orderManager && orderManager.replaySystem === instance) {',
      'if (orderManager) {',
    ),
    'if (orderService && orderService.replaySystem === instance) {',
    'if (orderService) {',
  );
  assert.throws(() => identityOracle(noIdentity));

  const pendingRelease = replaceOnce(
    source,
    "        } else {\n            state.phase = 'destroy-pending';",
    "        } else {\n            const orderManager = state.chart && state.chart.orderManager;\n            if (orderManager && orderManager.replaySystem === instance) orderManager.replaySystem = null;\n            const orderService = orderManager && orderManager.orderService;\n            if (orderService && orderService.replaySystem === instance) orderService.replaySystem = null;\n            instance.fullData = null;\n            instance.fullRawData = null;\n            state.phase = 'destroy-pending';",
  );
  assert.throws(() => partialDrainOracle(pendingRelease));

  const noKillSwitch = replaceOnce(
    source,
    'if (_m27EngineReleaseV1Enabled()) {',
    'if (true) {',
  );
  assert.throws(() => killSwitchOracle(noKillSwitch));
});
