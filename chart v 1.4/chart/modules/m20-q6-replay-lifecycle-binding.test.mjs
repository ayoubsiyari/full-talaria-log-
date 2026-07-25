import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const EXACT_Q6_COMMIT = '2f0ce7831e2aa74cf86e2263f50b5a023ecab932';
const EXACT_REPLAY_SHA256 = 'a8c4b32dac9b86eeeb928450d60d2838d456759d8451629d54ab3c47c029ebfe';
const REVIEWED_Q6_CORE_SHA256 = '12eb6525ff4af6d520ac2abd6f47b294b00320f6d36bb1852760899ebf20d5c6';
const Q6_SWITCH = '__TALARIA_DISABLE_M20_Q6_REPLAY_FLOAT_LISTENER_TEARDOWN_V1';
const EVIDENCE_MODE = String(process.env.M20_Q6_LIFECYCLE_EVIDENCE || '').trim().toLowerCase();

function findRoot(start) {
  let cursor = path.resolve(start);
  for (;;) {
    const replay = path.join(cursor, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
    const mirror = path.join(cursor, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
    if (fs.existsSync(path.join(cursor, '.git')) && fs.existsSync(replay) && fs.existsSync(mirror)) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error(`Q6 repository root not found from ${start}`);
    cursor = parent;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = findRoot(HERE);
const CANONICAL = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
const THIS_TEST = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'm20-q6-replay-lifecycle-binding.test.mjs');
const MIRROR_TEST = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'm20-q6-replay-lifecycle-binding.test.mjs');
const EVIDENCE_DIR = path.join(ROOT, 'docs', 'plan3', 'evidence');
const REPORT = path.join(ROOT, 'docs', 'plan3', 'M20-Q6-REPLAY-LIFECYCLE-CORRECTION-20260724.md');
const MANIFEST = path.join(EVIDENCE_DIR, 'W4-Q6-LIFECYCLE-V2-20260724-MANIFEST.json');
const EVIDENCE_FILES = ['red', 'current', 'kill'].map((mode) => path.join(
  EVIDENCE_DIR,
  `W4-Q6-LIFECYCLE-V2-20260724-${mode}.json`,
));
const source = fs.readFileSync(CANONICAL, 'utf8');
const mirrorSource = fs.readFileSync(MIRROR, 'utf8');
const exactSource = execFileSync(
  'git',
  ['show', `${EXACT_Q6_COMMIT}:chart v 1.4/chart/modules/replay-system.js`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);
const exactMirrorSource = execFileSync(
  'git',
  ['show', `${EXACT_Q6_COMMIT}:homepage/public/chart/modules/replay-system.js`],
  { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function methodSource(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(
    `^    ${escaped}\\s*\\([^]*?(?=^    (?:async\\s+)?[A-Za-z_$][\\w$]*\\s*\\(|^})`,
    'm',
  ));
  assert.ok(match, `method ${name} missing`);
  return match[0];
}

function reviewedCoreHash(text) {
  return sha256([
    '_m20Q6ReplayFloatListenerTeardownEnabled',
    '_teardownFloatingCloneDocListeners',
    '_removeFloatingReplayToolbarClone',
    'addCloseButtonToClone',
    'makeCloneDraggable',
  ].map((name) => `${name}\n${methodSource(text, name).replace(/\r\n/g, '\n')}`).join('\n---\n'));
}

function makeEnvironment({ kill = false, accessorSwitch = false, readyState = 'complete' } = {}) {
  const census = {
    addCalls: [],
    removeCalls: [],
    effectOrdinal: 0,
    addFault: null,
    removeFaults: [],
    targets: [],
    timers: new Map(),
    timerSeq: 0,
    clearFaults: [],
    timezoneAdds: 0,
    timezoneRemoves: 0,
  };

  class FakeTarget {
    constructor(name) {
      this._name = name;
      this._listeners = new Map();
      census.targets.push(this);
    }

    addEventListener(type, listener, options) {
      census.effectOrdinal += 1;
      const ordinal = census.effectOrdinal;
      census.addCalls.push({ target: this._name, type, listener, options, ordinal });
      const fault = census.addFault;
      if (fault && fault.ordinal === ordinal && fault.stage !== 'after') throw fault.error;
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
      if (fault && fault.ordinal === ordinal && fault.stage === 'after') throw fault.error;
    }

    removeEventListener(type, listener) {
      census.removeCalls.push({ target: this._name, type, listener });
      const fault = census.removeFaults.find((entry) => (
        entry.remaining > 0
        && (!entry.type || entry.type === type)
        && (!entry.target || entry.target === this._name)
      ));
      if (fault) {
        fault.remaining -= 1;
        throw fault.error;
      }
      const set = this._listeners.get(type);
      if (set) set.delete(listener);
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
  if (accessorSwitch) {
    let reads = 0;
    Object.defineProperty(window, Q6_SWITCH, {
      configurable: true,
      get() {
        reads += 1;
        return true;
      },
    });
    window.getSwitchReads = () => reads;
  } else {
    window[Q6_SWITCH] = kill;
    window.getSwitchReads = () => 0;
  }
  window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  window.dispatchEvent = FakeTarget.prototype.dispatchEvent.bind(window);

  const timezoneManager = {
    listeners: [],
    removeFaults: 0,
    addListener(listener) {
      census.timezoneAdds += 1;
      this.listeners.push(listener);
    },
    removeListener(listener) {
      census.timezoneRemoves += 1;
      if (this.removeFaults > 0) {
        this.removeFaults -= 1;
        throw new Error('timezone-remove-fault');
      }
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    },
  };
  window.timezoneManager = timezoneManager;

  const schedule = (kind, callback) => {
    const handleValue = ++census.timerSeq;
    census.timers.set(handleValue, { kind, callback, active: true });
    return handleValue;
  };
  const clear = (kind, handleValue) => {
    const fault = census.clearFaults.find((entry) => entry.remaining > 0 && (!entry.kind || entry.kind === kind));
    if (fault) {
      fault.remaining -= 1;
      throw fault.error;
    }
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

  census.listenerCount = () => census.targets.reduce(
    (sum, target) => sum + [...target._listeners.values()].reduce((n, set) => n + set.size, 0),
    0,
  );
  census.count = (type) => census.targets.reduce(
    (sum, target) => sum + (target._listeners.get(type)?.size || 0),
    0,
  );
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

  return {
    context,
    census,
    document,
    window,
    timezoneManager,
    elements: { toolbar, handle, replayButton },
  };
}

function loadRuntime(text, options = {}) {
  const env = makeEnvironment(options);
  const script = new vm.Script(`${text}\n;globalThis.__Q6Runtime = ReplaySystem;`, {
    filename: 'replay-system.js',
  });
  const context = vm.createContext(env.context);
  script.runInContext(context);
  return { ...env, context, Runtime: context.__Q6Runtime };
}

function makeChart() {
  return {
    replaySystem: null,
    rawData: [],
    data: [],
    currentTimeframe: '1m',
    scheduleRender() {},
    resampleData(data) { return data; },
  };
}

function capture(fn) {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return { value: undefined, error };
  }
}

function evidenceRow(name, pass, detail = '', target = 'binding', applicable = true) {
  return {
    q: 'Q6',
    target,
    name,
    applicable,
    pass: applicable ? !!pass : null,
    detail: String(detail || ''),
  };
}

function buildImmutableRedRows() {
  const rows = [];
  const accessor = loadRuntime(exactSource, { accessorSwitch: true, readyState: 'loading' });
  const accessorInstance = new accessor.Runtime(makeChart());
  const accessorOwn = Object.keys(accessorInstance).filter((key) => (
    /m20Q6|Lifecycle|floatingCloneDocListener/i.test(key)
  ));
  const forbiddenLifecyclePrototypeKeys = new Set([
    'destroy',
    'dispose',
    '_m20Q6CreateCleanupError',
    '_m20Q6RecordSuppressedCleanupError',
    '_m20Q6ClaimReplayLifecycleOwner',
    '_registerFloatingCloneDocListenerPair',
  ]);
  const accessorPrototype = Object.getOwnPropertyNames(accessor.Runtime.prototype)
    .filter((key) => forbiddenLifecyclePrototypeKeys.has(key));
  const accessorConstructorReads = accessor.window.getSwitchReads();
  const accessorMakeReturn = accessorInstance.makeCloneDraggable(accessor.census.makeClone());
  const accessorTeardownReturn = accessorInstance._teardownFloatingCloneDocListeners();

  const retry = loadRuntime(exactSource, { readyState: 'loading' });
  const retryInstance = new retry.Runtime(makeChart());
  retryInstance.makeCloneDraggable(retry.census.makeClone());
  retry.census.pushRemoveFault({
    type: 'mousemove',
    remaining: 1,
    error: new Error('immutable-move-remove-fault'),
  });
  const firstTeardown = capture(() => retryInstance._teardownFloatingCloneDocListeners());
  const afterFirst = {
    move: retry.census.count('mousemove'),
    up: retry.census.count('mouseup'),
    ledger: Array.isArray(retryInstance._floatingCloneDocListenerTeardowns)
      ? retryInstance._floatingCloneDocListenerTeardowns.length
      : 0,
  };
  retryInstance._teardownFloatingCloneDocListeners();
  const afterRetry = {
    move: retry.census.count('mousemove'),
    up: retry.census.count('mouseup'),
    ledger: retryInstance._floatingCloneDocListenerTeardowns.length,
  };

  const stop = loadRuntime(exactSource, { readyState: 'loading' });
  const stopInstance = new stop.Runtime(makeChart());
  stopInstance.makeCloneDraggable(stop.census.makeClone());
  const stopPrimary = new Error('immutable-stop-fault');
  const stopTrace = [];
  stopInstance._flushReplayStateToSession = () => stopTrace.push('flush');
  stopInstance.stop = () => { stopTrace.push('stop'); throw stopPrimary; };
  const stopResult = capture(() => stopInstance.exitReplayMode());

  const replacement = loadRuntime(exactSource, { readyState: 'loading' });
  const replacementChart = makeChart();
  const old = new replacement.Runtime(replacementChart);
  replacementChart.replaySystem = old;
  old.makeCloneDraggable(replacement.census.makeClone());
  const next = new replacement.Runtime(replacementChart);
  replacementChart.replaySystem = next;

  const setup = loadRuntime(exactSource, { readyState: 'complete' });
  const setupInstance = new setup.Runtime(makeChart());
  let retainedHits = 0;
  setupInstance.handleReplayButtonClick = () => { retainedHits += 1; };
  const retained = setup.elements.replayButton.listeners('click')[0];
  if (retained) retained.call(setup.elements.replayButton, {
    type: 'click',
    target: setup.elements.replayButton,
  });

  const constructorFault = loadRuntime(exactSource, { readyState: 'complete' });
  const constructorPrimary = new Error('immutable-constructor-add-fault');
  constructorFault.census.addFault = { ordinal: 2, stage: 'after', error: constructorPrimary };
  const constructorResult = capture(() => new constructorFault.Runtime(makeChart()));

  const passRows = [
    ['exact-replay-sha256-bound', sha256(exactSource) === EXACT_REPLAY_SHA256, sha256(exactSource)],
    ['exact-reviewed-core-bound', reviewedCoreHash(exactSource) === REVIEWED_Q6_CORE_SHA256, reviewedCoreHash(exactSource)],
    ['exact-mirror-object-bound', exactMirrorSource === exactSource, sha256(exactMirrorSource)],
    ['immutable-destroy-absent', typeof accessorInstance.destroy === 'undefined'],
    ['immutable-dispose-absent', typeof accessorInstance.dispose === 'undefined'],
    ['immutable-lifecycle-own-keys-absent', accessorOwn.length === 0, accessorOwn.join(',')],
    ['immutable-lifecycle-prototype-delta-absent', accessorPrototype.length === 0, accessorPrototype.join(',')],
    ['immutable-constructor-switch-getter-unread', accessorConstructorReads === 0,
      `constructorReads=${accessorConstructorReads}`],
    ['immutable-make-return-undefined', accessorMakeReturn === undefined],
    ['immutable-teardown-return-undefined', accessorTeardownReturn === undefined],
    ['immutable-method-getter-read-count', accessor.window.getSwitchReads() === 3, accessor.window.getSwitchReads()],
    ['immutable-constructor-dom-ready-listener', accessor.census.count('DOMContentLoaded') === 1],
    ['immutable-float-pair-installs', afterFirst.move === 1 && afterFirst.up === 1],
    ['immutable-pop-before-invoke-reproduced', afterFirst.ledger === 0, JSON.stringify(afterFirst)],
    ['immutable-first-remove-leaves-move', afterFirst.move === 1],
    ['immutable-first-remove-leaves-up', afterFirst.up === 1],
    ['immutable-retry-cannot-recover', afterRetry.move === 1 && afterRetry.up === 1, JSON.stringify(afterRetry)],
    ['immutable-stop-error-identity', stopResult.error === stopPrimary],
    ['immutable-stop-trace-stops-before-cleanup', stopTrace.join(',') === 'flush,stop', stopTrace.join(',')],
    ['immutable-stop-leaves-float-pair', stop.census.count('mousemove') === 1 && stop.census.count('mouseup') === 1],
    ['immutable-replacement-owner-gap', replacement.census.count('mousemove') === 1
      && typeof old.destroy === 'undefined'],
    ['immutable-page-hooks-absent', setup.window.listeners('pagehide').length === 0
      && setup.window.listeners('beforeunload').length === 0],
    ['immutable-constructor-fault-retains-effects', constructorResult.error === constructorPrimary
      && constructorFault.census.listenerCount() > 0 && retainedHits === 1],
  ];
  for (const [name, pass, detail] of passRows) rows.push(evidenceRow(name, pass, detail, 'immutable'));

  const causalFailures = [
    ['desired-remover-retains-ledger', afterFirst.ledger === 1, JSON.stringify(afterFirst)],
    ['desired-remover-retry-flat', afterRetry.move === 0 && afterRetry.up === 0, JSON.stringify(afterRetry)],
    ['desired-stop-finally-flat', stop.census.count('mousemove') === 0 && stop.census.count('mouseup') === 0],
    ['desired-destroy-endpoint', typeof setupInstance.destroy === 'function'],
    ['desired-dispose-endpoint', typeof setupInstance.dispose === 'function'],
    ['desired-playback-timers-drained', setup.census.activeTimers() === 0, setup.census.activeTimers()],
    ['desired-ui-listeners-drained', setup.census.listenerCount() === 0, setup.census.listenerCount()],
    ['desired-timezone-owner-drained', setup.timezoneManager.listeners.length === 0,
      setup.timezoneManager.listeners.length],
    ['desired-replacement-retires-old', typeof old._m20Q6LifecycleState === 'string'
      && old._m20Q6LifecycleState === 'destroyed'],
    ['desired-page-lifecycle-owner', setup.window.listeners('pagehide').length === 1
      && setup.window.listeners('beforeunload').length === 1],
    ['desired-retained-callback-inert', retainedHits === 0, retainedHits],
    ['desired-constructor-first-registration-rollback', false, 'immutable has no transaction owner'],
    ['desired-constructor-middle-last-rollback', constructorFault.census.listenerCount() === 0,
      constructorFault.census.listenerCount()],
    ['desired-constructor-cleanup-retry-owner', false, 'immutable has no retry registry'],
  ];
  for (const [name, pass, detail] of causalFailures) rows.push(evidenceRow(name, pass, detail, 'desired'));
  return rows;
}

function buildOffParityRows() {
  const exact = loadRuntime(exactSource, { accessorSwitch: true, readyState: 'loading' });
  const current = loadRuntime(source, { accessorSwitch: true, readyState: 'loading' });
  const exactInstance = new exact.Runtime(makeChart());
  const currentInstance = new current.Runtime(makeChart());
  const lifecycleOwn = (instance) => Object.keys(instance).filter((key) => (
    /m20Q6|Lifecycle|floatingCloneDocListener/i.test(key)
  )).sort();
  const forbidden = new Set([
    'destroy',
    'dispose',
    '_m20Q6CreateCleanupError',
    '_m20Q6RecordSuppressedCleanupError',
    '_m20Q6ClaimReplayLifecycleOwner',
    '_registerFloatingCloneDocListenerPair',
  ]);
  const lifecycleProto = (Runtime) => Object.getOwnPropertyNames(Runtime.prototype)
    .filter((key) => forbidden.has(key)).sort();
  const constructorReads = [exact.window.getSwitchReads(), current.window.getSwitchReads()];
  const exactReturn = exactInstance.makeCloneDraggable(exact.census.makeClone());
  const currentReturn = currentInstance.makeCloneDraggable(current.census.makeClone());
  const exactTeardown = exactInstance._teardownFloatingCloneDocListeners();
  const currentTeardown = currentInstance._teardownFloatingCloneDocListeners();

  const traceStop = (instance) => {
    const primary = new Error('off-stop');
    const trace = [];
    instance._flushReplayStateToSession = () => trace.push('flush');
    instance.stop = () => { trace.push('stop'); throw primary; };
    instance._removeFloatingReplayToolbarClone = () => trace.push('cleanup');
    instance._invalidatePlayheadPrefixes = () => trace.push('q9');
    instance.isActive = true;
    const result = capture(() => instance.exitReplayMode());
    return { primary, trace, result };
  };
  const exactStop = traceStop(exactInstance);
  const currentStop = traceStop(currentInstance);
  const exactAdds = exact.census.addCalls.map(({ target, type }) => `${target}:${type}`);
  const currentAdds = current.census.addCalls.map(({ target, type }) => `${target}:${type}`);
  const exactProto = Object.getOwnPropertyNames(exact.Runtime.prototype);
  const currentProto = Object.getOwnPropertyNames(current.Runtime.prototype);

  const values = [
    ['off-exact-commit-bound', sha256(exactSource) === EXACT_REPLAY_SHA256, sha256(exactSource)],
    ['off-reviewed-core-bound', reviewedCoreHash(source) === REVIEWED_Q6_CORE_SHA256, reviewedCoreHash(source)],
    ['off-product-mirror-byte-parity', source === mirrorSource, sha256(source)],
    ['off-destroy-absent', typeof currentInstance.destroy === typeof exactInstance.destroy],
    ['off-dispose-absent', typeof currentInstance.dispose === typeof exactInstance.dispose],
    ['off-lifecycle-own-key-parity', JSON.stringify(lifecycleOwn(currentInstance))
      === JSON.stringify(lifecycleOwn(exactInstance))],
    ['off-lifecycle-prototype-key-parity', JSON.stringify(lifecycleProto(current.Runtime))
      === JSON.stringify(lifecycleProto(exact.Runtime))],
    ['off-constructor-getter-read-parity', constructorReads[0] === 0 && constructorReads[1] === 0,
      constructorReads.join('/')],
    ['off-make-return-parity', currentReturn === exactReturn && currentReturn === undefined],
    ['off-teardown-return-parity', currentTeardown === exactTeardown && currentTeardown === undefined],
    ['off-method-getter-read-parity', current.window.getSwitchReads() === exact.window.getSwitchReads(),
      `${current.window.getSwitchReads()}/${exact.window.getSwitchReads()}`],
    ['off-constructor-listener-trace-parity', currentAdds[0] === exactAdds[0], `${currentAdds[0]}/${exactAdds[0]}`],
    ['off-float-install-trace-parity', currentAdds.slice(-3).join('|') === exactAdds.slice(-3).join('|')],
    ['off-mousemove-census-parity', current.census.count('mousemove') === exact.census.count('mousemove')],
    ['off-mouseup-census-parity', current.census.count('mouseup') === exact.census.count('mouseup')],
    ['off-stop-error-identity', currentStop.result.error === currentStop.primary],
    ['off-stop-exception-class-parity', currentStop.result.error?.name === exactStop.result.error?.name],
    ['off-stop-side-effect-order-parity', currentStop.trace.join(',') === exactStop.trace.join(','),
      `${currentStop.trace.join(',')}/${exactStop.trace.join(',')}`],
    ['off-stop-no-switch-reread', current.window.getSwitchReads() === exact.window.getSwitchReads()],
    ['off-pagehide-not-installed', current.window.listeners('pagehide').length === 0],
    ['off-beforeunload-not-installed', current.window.listeners('beforeunload').length === 0],
    ['off-no-fix-runtime-subclass-surface', current.Runtime.prototype.constructor === current.Runtime
      && lifecycleProto(current.Runtime).length === 0],
    ['off-current-extra-prototype-keys-are-non-q6', currentProto
      .filter((key) => !exactProto.includes(key))
      .every((key) => !forbidden.has(key))],
  ];
  return values.map(([name, pass, detail]) => evidenceRow(name, pass, detail, 'off-parity'));
}

function buildCurrentDesiredRows() {
  const rows = [];

  const retry = loadRuntime(source, { readyState: 'loading' });
  const retryChart = makeChart();
  const retryInstance = new retry.Runtime(retryChart);
  retryChart.replaySystem = retryInstance;
  retryInstance.makeCloneDraggable(retry.census.makeClone());
  retry.census.pushRemoveFault({ type: 'mousemove', remaining: 1, error: new Error('desired-move-fault') });
  const first = capture(() => retryInstance._teardownFloatingCloneDocListeners());
  const retained = retryInstance._floatingCloneDocListenerTeardowns.length === 1
    && retry.census.count('mousemove') === 1
    && retry.census.count('mouseup') === 0
    && first.error?.name === 'AggregateError';
  const retried = retryInstance._teardownFloatingCloneDocListeners();
  const retryFlat = retried.pending === 0
    && retry.census.count('mousemove') === 0
    && retry.census.count('mouseup') === 0;
  retryInstance.destroy();

  const stop = loadRuntime(source, { readyState: 'loading' });
  const stopChart = makeChart();
  const stopInstance = new stop.Runtime(stopChart);
  stopChart.replaySystem = stopInstance;
  stopInstance.makeCloneDraggable(stop.census.makeClone());
  const primary = new Error('desired-stop-fault');
  stopInstance._flushReplayStateToSession = () => {};
  stopInstance.stop = () => { throw primary; };
  const stopResult = capture(() => stopInstance.exitReplayMode());
  const stopFlat = stopResult.error === primary
    && stop.census.count('mousemove') === 0
    && stop.census.count('mouseup') === 0;
  stopInstance.destroy();

  const full = loadRuntime(source, { readyState: 'complete' });
  const fullChart = makeChart();
  const fullInstance = new full.Runtime(fullChart);
  fullChart.replaySystem = fullInstance;
  let retainedHits = 0;
  fullInstance.handleReplayButtonClick = () => { retainedHits += 1; };
  const retainedCallback = full.elements.replayButton.listeners('click')[0];
  fullInstance.isActive = true;
  fullInstance._replayUserOwnsViewport = () => false;
  fullInstance.scheduleReplayFollowOnceLayoutSettled();
  const pageOwned = full.window.listeners('pagehide').length === 1
    && full.window.listeners('beforeunload').length === 1;
  const fullReport = fullInstance.destroy();
  if (retainedCallback) retainedCallback({ type: 'click', target: full.elements.replayButton });

  const replacement = loadRuntime(source, { readyState: 'complete' });
  const replacementChart = makeChart();
  const old = new replacement.Runtime(replacementChart);
  replacementChart.replaySystem = old;
  const next = new replacement.Runtime(replacementChart);
  replacementChart.replaySystem = next;
  const replacementClosed = old._m20Q6LifecycleState === 'destroyed';
  next.destroy();

  const registrationProbe = loadRuntime(source, { readyState: 'complete' });
  const probe = new registrationProbe.Runtime(makeChart());
  const lastOrdinal = registrationProbe.census.addCalls.length;
  probe.destroy();
  const rollbackResults = [];
  for (const ordinal of [1, Math.ceil(lastOrdinal / 2), lastOrdinal]) {
    const env = loadRuntime(source, { readyState: 'complete' });
    const error = new Error(`desired-add-${ordinal}`);
    env.census.addFault = { ordinal, stage: 'after', error };
    const result = capture(() => new env.Runtime(makeChart()));
    rollbackResults.push({
      ordinal,
      pass: result.error === error
        && env.census.listenerCount() === 0
        && env.census.activeTimers() === 0
        && env.timezoneManager.listeners.length === 0,
    });
  }

  const cleanupRetry = loadRuntime(source, { readyState: 'complete' });
  const cleanupChart = makeChart();
  const cleanupInstance = new cleanupRetry.Runtime(cleanupChart);
  cleanupChart.replaySystem = cleanupInstance;
  cleanupRetry.census.pushRemoveFault({
    type: 'click',
    target: 'replay-button',
    remaining: 1,
    error: new Error('desired-cleanup-retry'),
  });
  const cleanupFirst = capture(() => cleanupInstance.destroy());
  const cleanupSecond = cleanupInstance.destroy();

  const values = [
    ['desired-remover-retains-ledger', retained, first.error?.name],
    ['desired-remover-retry-flat', retryFlat, JSON.stringify(retried)],
    ['desired-stop-finally-flat', stopFlat, stopResult.error?.message],
    ['desired-destroy-endpoint', typeof fullInstance.destroy === 'function'],
    ['desired-dispose-endpoint', typeof fullInstance.dispose === 'function'],
    ['desired-playback-timers-drained', full.census.activeTimers() === 0, full.census.activeTimers()],
    ['desired-ui-listeners-drained', full.census.listenerCount() === 0, full.census.listenerCount()],
    ['desired-timezone-owner-drained', full.timezoneManager.listeners.length === 0,
      full.timezoneManager.listeners.length],
    ['desired-replacement-retires-old', replacementClosed],
    ['desired-page-lifecycle-owner', pageOwned],
    ['desired-retained-callback-inert', retainedHits === 0, retainedHits],
    ['desired-constructor-first-registration-rollback', rollbackResults[0]?.pass,
      JSON.stringify(rollbackResults[0])],
    ['desired-constructor-middle-last-rollback', rollbackResults.slice(1).every((entry) => entry.pass),
      JSON.stringify(rollbackResults.slice(1))],
    ['desired-constructor-cleanup-retry-owner', cleanupFirst.error?.name === 'AggregateError'
      && cleanupSecond.state === 'destroyed' && cleanupChart.replaySystem === null],
  ];
  assert.equal(fullReport.state, 'destroyed');
  return values.map(([name, pass, detail]) => evidenceRow(name, pass, detail, 'current'));
}

test('Q6 immutable superseding RED is exactly 23 pass / 14 causal failures', () => {
  const rows = buildImmutableRedRows();
  const applicable = rows.filter((row) => row.applicable);
  assert.equal(applicable.length, 37);
  assert.equal(
    applicable.filter((row) => row.pass).length,
    23,
    JSON.stringify(applicable.filter((row) => !row.pass).map((row) => row.name)),
  );
  assert.equal(
    applicable.filter((row) => !row.pass).length,
    14,
    JSON.stringify(applicable.filter((row) => row.pass).map((row) => row.name)),
  );
});

test('Q6 current and kill evidence rows discriminate without accepting divergence', () => {
  const off = buildOffParityRows();
  const desired = buildCurrentDesiredRows();
  assert.equal(off.length, 23);
  assert.equal(off.every((row) => row.pass), true,
    JSON.stringify(off.filter((row) => !row.pass).map((row) => row.name)));
  assert.equal(desired.length, 14);
  assert.equal(desired.every((row) => row.pass), true,
    JSON.stringify(desired.filter((row) => !row.pass).map((row) => row.name)));
});

test('Q6 OFF binding matches immutable lifecycle surface and traces', () => {
  const exact = loadRuntime(exactSource, { accessorSwitch: true, readyState: 'loading' });
  const current = loadRuntime(source, { accessorSwitch: true, readyState: 'loading' });
  const exactChart = makeChart();
  const currentChart = makeChart();
  const exactInstance = new exact.Runtime(exactChart);
  const currentInstance = new current.Runtime(currentChart);

  const lifecycleOwn = (value) => Object.keys(value).filter((key) => (
    /m20Q6|Lifecycle|floatingCloneDocListener/i.test(key)
  )).sort();
  const lifecyclePrototype = (Runtime) => Object.getOwnPropertyNames(Runtime.prototype).filter((key) => (
    /destroy|dispose|m20Q6Create|m20Q6Claim|registerFloating/i.test(key)
  )).sort();

  assert.deepEqual(lifecycleOwn(currentInstance), lifecycleOwn(exactInstance));
  assert.deepEqual(lifecyclePrototype(current.Runtime), lifecyclePrototype(exact.Runtime));
  assert.equal(typeof currentInstance.destroy, 'undefined');
  assert.equal(typeof currentInstance.dispose, 'undefined');
  assert.equal(current.window.getSwitchReads(), 0);
  assert.equal(exact.window.getSwitchReads(), 0);

  const exactClone = exact.census.makeClone();
  const currentClone = current.census.makeClone();
  assert.equal(exactInstance.makeCloneDraggable(exactClone), undefined);
  assert.equal(currentInstance.makeCloneDraggable(currentClone), undefined);
  assert.equal(current.window.getSwitchReads(), exact.window.getSwitchReads());
  assert.deepEqual(
    current.census.addCalls.map(({ target, type }) => [target, type]),
    exact.census.addCalls.map(({ target, type }) => [target, type]),
  );
  assert.equal(currentInstance._teardownFloatingCloneDocListeners(), undefined);
  assert.equal(exactInstance._teardownFloatingCloneDocListeners(), undefined);

  const stopError = new Error('stop-fault');
  const traceExit = (instance) => {
    const trace = [];
    instance._flushReplayStateToSession = () => trace.push('flush');
    instance.stop = () => { trace.push('stop'); throw stopError; };
    instance._removeFloatingReplayToolbarClone = () => trace.push('float-cleanup');
    instance._invalidatePlayheadPrefixes = () => trace.push('q9');
    instance.isActive = true;
    const result = capture(() => instance.exitReplayMode());
    return { trace, result };
  };
  const exactExit = traceExit(exactInstance);
  const currentExit = traceExit(currentInstance);
  assert.deepEqual(currentExit.trace, exactExit.trace);
  assert.equal(currentExit.result.error, stopError);
  assert.equal(exactExit.result.error, stopError);
});

test('Q6 ON floating remover keeps partial ownership and retries independently', () => {
  for (const faultType of ['mousemove', 'mouseup']) {
    const env = loadRuntime(source, { readyState: 'loading' });
    const chart = makeChart();
    const instance = new env.Runtime(chart);
    chart.replaySystem = instance;
    instance.makeCloneDraggable(env.census.makeClone());
    const fault = env.census.pushRemoveFault({
      type: faultType,
      remaining: 1,
      error: new Error(`${faultType}-remove-fault`),
    });
    const first = capture(() => instance._teardownFloatingCloneDocListeners());
    assert.equal(first.error?.name, 'AggregateError');
    assert.equal(first.error?.errors?.[0], fault);
    assert.equal(instance._floatingCloneDocListenerTeardowns.length, 1);
    assert.equal(env.census.count(faultType), 1);
    assert.equal(env.census.count(faultType === 'mousemove' ? 'mouseup' : 'mousemove'), 0);
    const retry = instance._teardownFloatingCloneDocListeners();
    assert.equal(retry.pending, 0);
    assert.equal(instance._floatingCloneDocListenerTeardowns.length, 0);
    assert.equal(env.census.count('mousemove'), 0);
    assert.equal(env.census.count('mouseup'), 0);
    instance.destroy();
  }
});

test('Q6 ON drains timers, events, manager ownership, float pairs, and page hooks', () => {
  const env = loadRuntime(source, { readyState: 'complete' });
  const chart = makeChart();
  const instance = new env.Runtime(chart);
  chart.replaySystem = instance;

  let retainedHits = 0;
  instance.handleReplayButtonClick = () => { retainedHits += 1; };
  const retained = env.elements.replayButton.listeners('click')[0];
  instance._attachReplayFollowViewportListeners();
  instance.makeCloneDraggable(env.census.makeClone());
  instance.isActive = true;
  instance._replayUserOwnsViewport = () => false;
  instance.scheduleReplayFollowOnceLayoutSettled();
  instance.tickInterval = env.context.setTimeout(() => { retainedHits += 1; }, 1);
  instance._nextCandleTimer = env.context.setTimeout(() => { retainedHits += 1; }, 1);
  instance.playInterval = env.context.setInterval(() => { retainedHits += 1; }, 1);
  instance._playStartRaf1 = env.context.requestAnimationFrame(() => { retainedHits += 1; });
  instance._tfChangeRestoreTimer = env.context.setTimeout(() => { retainedHits += 1; }, 1);

  assert.ok(env.census.listenerCount() > 0);
  assert.ok(env.census.activeTimers() > 0);
  assert.equal(env.timezoneManager.listeners.length, 1);
  const report = instance.destroy();
  assert.equal(report.state, 'destroyed');
  assert.equal(env.census.listenerCount(), 0);
  assert.equal(env.census.activeTimers(), 0);
  assert.equal(env.timezoneManager.listeners.length, 0);
  assert.equal(chart.replaySystem, null);
  if (retained) retained({ type: 'click', target: env.elements.replayButton });
  assert.equal(retainedHits, 0);
  assert.equal(instance.destroy(), report);
  assert.equal(instance.dispose(), report);
});

test('Q6 ON close and stop-throw exits preserve primaries while draining float ownership', () => {
  const closeEnv = loadRuntime(source, { readyState: 'loading' });
  const closeChart = makeChart();
  const closeInstance = new closeEnv.Runtime(closeChart);
  closeChart.replaySystem = closeInstance;
  const clone = closeEnv.census.makeClone();
  closeInstance.addCloseButtonToClone(clone);
  const closeButton = clone.children.find((child) => child.className === 'replay-clone-close-btn');
  const closePrimary = new Error('close-primary');
  const closeResult = capture(() => closeButton.dispatchEvent({
    type: 'click',
    target: closeButton,
    stopPropagation() { throw closePrimary; },
  }));
  assert.equal(closeResult.error, closePrimary);
  assert.equal(closeEnv.census.count('mousemove'), 0);
  assert.equal(closeEnv.census.count('mouseup'), 0);
  assert.equal(closeButton.listeners('click').length, 0);
  assert.equal(closeButton.listeners('mouseenter').length, 0);
  assert.equal(closeButton.listeners('mouseleave').length, 0);
  assert.equal(clone.listeners('mousedown').length, 0);
  closeInstance.destroy();

  const exitEnv = loadRuntime(source, { readyState: 'loading' });
  const exitChart = makeChart();
  const exitInstance = new exitEnv.Runtime(exitChart);
  exitChart.replaySystem = exitInstance;
  exitInstance.makeCloneDraggable(exitEnv.census.makeClone());
  const stopPrimary = new Error('stop-primary');
  exitInstance._flushReplayStateToSession = () => {};
  exitInstance.stop = () => { throw stopPrimary; };
  const exitResult = capture(() => exitInstance.exitReplayMode());
  assert.equal(exitResult.error, stopPrimary);
  assert.equal(exitEnv.census.count('mousemove'), 0);
  assert.equal(exitEnv.census.count('mouseup'), 0);
  exitInstance.destroy();
});

test('Q6 ON one hundred float cycles remain census-flat', () => {
  const env = loadRuntime(source, { readyState: 'loading' });
  const chart = makeChart();
  const instance = new env.Runtime(chart);
  chart.replaySystem = instance;
  for (let index = 0; index < 100; index += 1) {
    instance.makeCloneDraggable(env.census.makeClone());
    instance._removeFloatingReplayToolbarClone();
  }
  assert.equal(env.census.count('mousemove'), 0);
  assert.equal(env.census.count('mouseup'), 0);
  assert.equal(instance._floatingCloneDocListenerTeardowns.length, 0);
  instance.destroy();
});

test('Q6 ON replacement and page lifecycle retire the prior owner', () => {
  const env = loadRuntime(source, { readyState: 'complete' });
  const chart = makeChart();
  const first = new env.Runtime(chart);
  chart.replaySystem = first;
  first.makeCloneDraggable(env.census.makeClone());
  const before = env.census.listenerCount();
  const second = new env.Runtime(chart);
  chart.replaySystem = second;
  assert.equal(first._m20Q6LifecycleState, 'destroyed');
  assert.ok(env.census.listenerCount() <= before);
  env.window.dispatchEvent({ type: 'pagehide' });
  assert.equal(second._m20Q6LifecycleState, 'destroyed');
  assert.equal(env.census.listenerCount(), 0);
  assert.equal(env.census.activeTimers(), 0);
  assert.equal(env.timezoneManager.listeners.length, 0);
});

test('Q6 ON constructor first/middle/last registration faults roll back immediately', () => {
  const baseline = loadRuntime(source, { readyState: 'complete' });
  const baselineInstance = new baseline.Runtime(makeChart());
  const registrationCount = baseline.census.addCalls.length;
  baselineInstance.destroy();
  assert.ok(registrationCount >= 6);

  const ordinals = [1, Math.ceil(registrationCount / 2), registrationCount];
  for (const ordinal of ordinals) {
    const env = loadRuntime(source, { readyState: 'complete' });
    const primary = new Error(`add-fault-${ordinal}`);
    env.census.addFault = { ordinal, stage: 'after', error: primary };
    const result = capture(() => new env.Runtime(makeChart()));
    assert.equal(result.error, primary);
    assert.equal(env.census.listenerCount(), 0, `ordinal ${ordinal} listeners`);
    assert.equal(env.census.activeTimers(), 0, `ordinal ${ordinal} timers`);
    assert.equal(env.timezoneManager.listeners.length, 0, `ordinal ${ordinal} timezone`);
  }
});

test('Q6 ON constructor cleanup failures retain registry ownership for later retry', () => {
  const baseline = loadRuntime(source, { readyState: 'complete' });
  const baselineInstance = new baseline.Runtime(makeChart());
  const middle = Math.ceil(baseline.census.addCalls.length / 2);
  const failedCall = baseline.census.addCalls.find((entry) => entry.ordinal === middle);
  baselineInstance.destroy();

  const env = loadRuntime(source, { readyState: 'complete' });
  const chart = makeChart();
  const primary = new Error('constructor-middle-registration-fault');
  env.census.addFault = { ordinal: middle, stage: 'after', error: primary };
  env.census.pushRemoveFault({
    type: failedCall.type,
    target: failedCall.target,
    remaining: 2,
    error: new Error('constructor-rollback-remove-fault'),
  });
  const failed = capture(() => new env.Runtime(chart));
  assert.equal(failed.error, primary);
  assert.equal(failed.error?.m20Q6CleanupError?.name, 'AggregateError');
  assert.ok(env.census.listenerCount() > 0);

  env.census.addFault = null;
  const replacement = new env.Runtime(chart);
  chart.replaySystem = replacement;
  assert.equal(env.census.count(failedCall.type) >= 1, true);
  replacement.destroy();
  assert.equal(env.census.listenerCount(), 0);
  assert.equal(env.census.activeTimers(), 0);
  assert.equal(env.timezoneManager.listeners.length, 0);
});

test('Q6 ON failed replacement leaves old callbacks inert and retry-owned', () => {
  const env = loadRuntime(source, { readyState: 'complete' });
  const chart = makeChart();
  const old = new env.Runtime(chart);
  chart.replaySystem = old;
  let hits = 0;
  old.handleReplayButtonClick = () => { hits += 1; };
  const retained = env.elements.replayButton.listeners('click')[0];
  env.census.pushRemoveFault({
    type: 'click',
    target: 'replay-button',
    remaining: 1,
    error: new Error('replacement-remove-fault'),
  });
  const failed = capture(() => new env.Runtime(chart));
  assert.equal(failed.error?.name, 'AggregateError');
  assert.equal(old._m20Q6LifecycleState, 'destroy-pending');
  retained({ type: 'click', target: env.elements.replayButton });
  assert.equal(hits, 0);
  const next = new env.Runtime(chart);
  chart.replaySystem = next;
  assert.equal(old._m20Q6LifecycleState, 'destroyed');
  next.destroy();
  assert.equal(env.census.listenerCount(), 0);
});

test('Q6 ON cleanup aggregates independent failures and remains retry-owned', () => {
  const env = loadRuntime(source, { readyState: 'complete' });
  const chart = makeChart();
  const instance = new env.Runtime(chart);
  chart.replaySystem = instance;
  instance.makeCloneDraggable(env.census.makeClone());
  env.census.pushRemoveFault({ type: 'mousemove', remaining: 1, error: new Error('move-remove') });
  env.timezoneManager.removeFaults = 1;
  env.census.clearFaults.push({ kind: 'interval', remaining: 1, error: new Error('interval-clear') });

  const first = capture(() => instance.destroy());
  assert.equal(first.error?.name, 'AggregateError');
  assert.ok(first.error.errors.length >= 3);
  assert.equal(instance._m20Q6LifecycleState, 'destroy-pending');
  assert.equal(chart.replaySystem, instance);
  const second = instance.destroy();
  assert.equal(second.state, 'destroyed');
  assert.equal(env.census.listenerCount(), 0);
  assert.equal(env.census.activeTimers(), 0);
  assert.equal(env.timezoneManager.listeners.length, 0);
});

test('Q6 exact/current binding hashes and mirror bytes', () => {
  assert.equal(sha256(exactSource), EXACT_REPLAY_SHA256);
  assert.equal(sha256(exactMirrorSource), EXACT_REPLAY_SHA256);
  assert.equal(exactSource, exactMirrorSource);
  assert.equal(reviewedCoreHash(exactSource), REVIEWED_Q6_CORE_SHA256);
  assert.equal(reviewedCoreHash(source), REVIEWED_Q6_CORE_SHA256);
  assert.equal(source, mirrorSource);
  if (fs.existsSync(MIRROR_TEST)) {
    assert.equal(fs.readFileSync(THIS_TEST, 'utf8'), fs.readFileSync(MIRROR_TEST, 'utf8'));
    assert.equal(sha256(fs.readFileSync(THIS_TEST)), sha256(fs.readFileSync(MIRROR_TEST)));
  }
});

function writeJsonAtomic(file, payload) {
  const canonicalRoot = fs.realpathSync(ROOT);
  const resolved = path.resolve(file);
  const evidenceRoot = path.resolve(EVIDENCE_DIR);
  assert.equal(
    fs.realpathSync(findRoot(EVIDENCE_DIR)),
    canonicalRoot,
    'Q6 evidence root is not under the canonical repository',
  );
  assert.equal(
    resolved === evidenceRoot || resolved.startsWith(`${evidenceRoot}${path.sep}`),
    true,
    `refusing Q6 shadow write: ${resolved}`,
  );
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const temporary = `${resolved}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    fs.renameSync(temporary, resolved);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function gitText(args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (allowFailure) return '';
    throw error;
  }
}

function q9HeadAddedBlocks(relativePath) {
  const patch = gitText(['show', '--format=', '--unified=0', 'HEAD', '--', relativePath]);
  const blocks = [];
  let block = [];
  const flush = () => {
    if (block.length) blocks.push(`${block.join('\n')}\n`);
    block = [];
  };
  for (const line of patch.split('\n')) {
    if (line.startsWith('+++')) continue;
    if (line.startsWith('+')) block.push(line.slice(1));
    else flush();
  }
  flush();
  return blocks;
}

function manifestFileInfo(file) {
  const relative = path.relative(ROOT, file).replaceAll('\\', '/');
  const exists = fs.existsSync(file);
  const status = gitText(['status', '--short', '--ignored', '--', relative], { allowFailure: true });
  const tracked = !!gitText(['ls-files', '--', relative], { allowFailure: true });
  const headBytes = tracked
    ? execFileSync('git', ['show', `HEAD:${relative}`], {
      cwd: ROOT,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    : null;
  let classification = 'absent';
  if (exists && status.startsWith('!!')) classification = 'ignored-generated';
  else if (exists && status.startsWith('??')) classification = 'untracked-worktree';
  else if (exists && tracked && status) classification = 'tracked-modified';
  else if (exists && tracked) classification = 'tracked-head-identical';
  else if (exists) classification = 'present-unclassified';
  return {
    path: relative,
    exists,
    classification,
    gitStatus: status || null,
    trackedAtHead: tracked,
    headBlobSha256: headBytes ? sha256(headBytes) : null,
    workingSha256: exists ? sha256(fs.readFileSync(file)) : null,
    sourceCommitScope: tracked ? 'HEAD_BASE_PLUS_WORKTREE_DIFF' : 'WORKTREE_ONLY_UNCOMMITTED',
  };
}

function buildManifestPayload() {
  const head = gitText(['rev-parse', 'HEAD']);
  const headTree = gitText(['rev-parse', 'HEAD^{tree}']);
  const q9Canonical = q9HeadAddedBlocks('chart v 1.4/chart/modules/replay-system.js');
  const q9Mirror = q9HeadAddedBlocks('homepage/public/chart/modules/replay-system.js');
  const q9Hash = sha256(q9Canonical.join('\n---Q9-HUNK---\n'));
  const q9MirrorHash = sha256(q9Mirror.join('\n---Q9-HUNK---\n'));
  const scopeFiles = [
    CANONICAL,
    MIRROR,
    THIS_TEST,
    MIRROR_TEST,
    path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'm20-q6-replay-float-listeners.test.mjs'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'm20-q6-replay-float-listeners.test.mjs'),
    path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'm20-q6-replay-lifecycle-strong.test.mjs'),
    path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'm20-q6-replay-lifecycle-strong.test.mjs'),
  ];
  const artifactFiles = [REPORT, ...EVIDENCE_FILES];
  return {
    schema: 'talaria.m20.q6.lifecycle-manifest.v2',
    stamp: 'PENDING-FRESH-GPT-REVIEW',
    generatedAt: new Date().toISOString(),
    repositoryRoot: fs.realpathSync(ROOT),
    headCommit: head,
    headTree,
    exactQ6Commit: EXACT_Q6_COMMIT,
    exactReplaySha256: EXACT_REPLAY_SHA256,
    reviewedExactQ6CoreSha256: REVIEWED_Q6_CORE_SHA256,
    scope: {
      authority: 'current HEAD baseline plus the explicitly listed worktree files',
      files: scopeFiles.map(manifestFileInfo),
      exclusions: [
        'chart.js',
        'Q9 product hunks',
        'chart-indicators-full.js',
        'order/alert/timezone/favorites managers',
        'M19/M21/multichart/bridge lanes',
      ],
      borrowedManifest: null,
      q9ManifestBorrowed: false,
    },
    product: {
      canonicalSha256: sha256(fs.readFileSync(CANONICAL)),
      mirrorSha256: sha256(fs.readFileSync(MIRROR)),
      byteIdentical: fs.readFileSync(CANONICAL, 'utf8') === fs.readFileSync(MIRROR, 'utf8'),
      immutableOffCoreSha256: reviewedCoreHash(source),
    },
    q9Guard: {
      headAddedBlockCount: q9Canonical.length,
      canonicalHeadAddedHunksSha256: q9Hash,
      mirrorHeadAddedHunksSha256: q9MirrorHash,
      hashesEqual: q9Hash === q9MirrorHash,
      canonicalCurrentContainsEveryHeadBlock: q9Canonical.every((block) => source.includes(block.trimEnd())),
      mirrorCurrentContainsEveryHeadBlock: q9Mirror.every((block) => mirrorSource.includes(block.trimEnd())),
    },
    generatedArtifacts: artifactFiles.map(manifestFileInfo),
    docsClassification: {
      repositoryRule: gitText([
        'check-ignore',
        '-v',
        '--',
        path.relative(ROOT, REPORT).replaceAll('\\', '/'),
      ], { allowFailure: true }) || null,
      report: manifestFileInfo(REPORT).classification,
      evidence: 'ignored-generated',
      statement: 'Report/evidence/manifest are local ignored artifacts, not committed HEAD sources.',
    },
    runtime: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
    },
  };
}

test.after(() => {
  if (!EVIDENCE_MODE) return;
  assert.match(EVIDENCE_MODE, /^(red|current|kill|manifest)$/);

  if (EVIDENCE_MODE !== 'manifest') {
    const offRows = EVIDENCE_MODE === 'red' ? [] : buildOffParityRows();
    const desiredRows = EVIDENCE_MODE === 'red'
      ? []
      : (EVIDENCE_MODE === 'current'
        ? buildCurrentDesiredRows()
        : buildImmutableRedRows().filter((row) => row.target === 'desired').map((row) => ({
          ...row,
          applicable: false,
          pass: null,
          detail: 'excluded in kill mode; immutable OFF parity is the acceptance contract',
        })));
    const rows = EVIDENCE_MODE === 'red'
      ? buildImmutableRedRows()
      : [...offRows, ...desiredRows];
    const applicable = rows.filter((row) => row.applicable);
    const pass = applicable.filter((row) => row.pass).length;
    const fail = applicable.filter((row) => !row.pass).length;
    const excluded = rows.length - applicable.length;
    if (EVIDENCE_MODE === 'red') {
      assert.deepEqual({ pass, fail, excluded }, { pass: 23, fail: 14, excluded: 0 });
    } else {
      assert.equal(fail, 0, JSON.stringify(rows.filter((row) => row.applicable && !row.pass)));
    }
    const verdict = EVIDENCE_MODE === 'red'
      ? 'RED-23-14'
      : (EVIDENCE_MODE === 'kill' ? 'GREEN-KILL-EXACT' : 'GREEN');
    const payload = {
      schema: 'talaria.m20.q6.lifecycle-evidence.v2',
      stamp: 'PENDING-FRESH-GPT-REVIEW',
      generatedAt: new Date().toISOString(),
      mode: EVIDENCE_MODE,
      verdict,
      exactQ6Commit: EXACT_Q6_COMMIT,
      headCommit: gitText(['rev-parse', 'HEAD']),
      repositoryRoot: fs.realpathSync(ROOT),
      killSwitch: Q6_SWITCH,
      product: {
        exactReplaySha256: EXACT_REPLAY_SHA256,
        reviewedExactQ6CoreSha256: REVIEWED_Q6_CORE_SHA256,
        currentCanonicalSha256: sha256(fs.readFileSync(CANONICAL)),
        currentMirrorSha256: sha256(fs.readFileSync(MIRROR)),
        currentMirrorsByteIdentical: source === mirrorSource,
      },
      tests: {
        canonicalHarnessSha256: sha256(fs.readFileSync(THIS_TEST)),
        mirrorEntrypointSha256: sha256(fs.readFileSync(MIRROR_TEST)),
      },
      summary: {
        totalRows: rows.length,
        applicable: applicable.length,
        pass,
        fail,
        excluded,
      },
      rows,
    };
    writeJsonAtomic(
      path.join(EVIDENCE_DIR, `W4-Q6-LIFECYCLE-V2-20260724-${EVIDENCE_MODE}.json`),
      payload,
    );
  }

  writeJsonAtomic(MANIFEST, buildManifestPayload());
});
