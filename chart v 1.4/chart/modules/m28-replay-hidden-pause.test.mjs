import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const CANONICAL = path.join(ROOT, 'chart v 1.4', 'chart', 'modules', 'replay-system.js');
const MIRROR = path.join(ROOT, 'homepage', 'public', 'chart', 'modules', 'replay-system.js');
const source = fs.readFileSync(CANONICAL, 'utf8');
const mirrorSource = fs.readFileSync(MIRROR, 'utf8');

const HIDDEN_SWITCH = '__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1';

function makeEnvironment({ kill = false, hidden = false } = {}) {
  const census = {
    targets: [],
    timers: new Map(),
    timerSeq: 0,
    rafSeq: 1000,
  };

  class FakeTarget {
    constructor(name) {
      this._name = name;
      this._listeners = new Map();
      census.targets.push(this);
    }

    addEventListener(type, listener, options) {
      if (!this._listeners.has(type)) this._listeners.set(type, new Set());
      this._listeners.get(type).add(listener);
      this._lastOptions = options;
    }

    removeEventListener(type, listener) {
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
    getBoundingClientRect() { return { left: 0, top: 0, width: 200, height: 40 }; }
    setPointerCapture() {}
    releasePointerCapture() {}
  }

  const document = new FakeTarget('document');
  document.readyState = 'complete';
  document.hidden = hidden;
  document.visibilityState = hidden ? 'hidden' : 'visible';
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
  const followButton = new FakeElement('follow-button', 'BUTTON');
  followButton.id = 'replayFollow';
  ids.set(toolbar.id, toolbar);
  ids.set(handle.id, handle);
  ids.set(replayButton.id, replayButton);
  ids.set(followButton.id, followButton);
  document.getElementById = (id) => ids.get(id) || null;
  document.querySelector = () => null;
  document.querySelectorAll = () => [];
  document.createElement = (tag) => new FakeElement(`created:${tag}:${census.targets.length}`, String(tag).toUpperCase());

  const window = new FakeTarget('window');
  window[HIDDEN_SWITCH] = kill;
  window.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1' });
  window.dispatchEvent = FakeTarget.prototype.dispatchEvent.bind(window);
  window.timezoneManager = {
    listeners: [],
    addListener(listener) { this.listeners.push(listener); },
    removeListener(listener) {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
    },
  };

  const schedule = (kind, callback, delay = 0) => {
    const handleValue = ++census.timerSeq;
    census.timers.set(handleValue, { kind, callback, delay, active: true, fires: 0 });
    return handleValue;
  };
  const clear = (_kind, handleValue) => {
    const entry = census.timers.get(handleValue);
    if (entry) entry.active = false;
  };

  census.activeIntervals = () => [...census.timers.values()].filter((entry) => entry.active && entry.kind === 'interval');
  census.fireInterval = (handleValue) => {
    const entry = census.timers.get(handleValue);
    assert.ok(entry && entry.active, `interval ${handleValue} must be active`);
    entry.fires += 1;
    entry.callback();
  };
  census.setHidden = (value) => {
    document.hidden = value;
    document.visibilityState = value ? 'hidden' : 'visible';
    document.dispatchEvent({ type: 'visibilitychange' });
  };

  const context = {
    window,
    document,
    console: { log() {}, warn() {}, error() {} },
    userStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
    setTimeout: (callback, delay, ...rest) => schedule('timeout', () => callback(...rest), delay),
    clearTimeout: (handleValue) => clear('timeout', handleValue),
    setInterval: (callback, delay, ...rest) => schedule('interval', () => callback(...rest), delay),
    clearInterval: (handleValue) => clear('interval', handleValue),
    requestAnimationFrame: (callback) => {
      const handleValue = ++census.rafSeq;
      census.timers.set(handleValue, { kind: 'raf', callback, active: true, fires: 0 });
      return handleValue;
    },
    cancelAnimationFrame: (handleValue) => clear('raf', handleValue),
    queueMicrotask: (callback) => callback(),
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

  return { context, census, document, window };
}

function loadRuntime(text = source, options = {}) {
  const env = makeEnvironment(options);
  const script = new vm.Script(`${text}\n;globalThis.__M28Runtime = ReplaySystem;`, {
    filename: 'replay-system.js',
  });
  const context = vm.createContext(env.context);
  script.runInContext(context);
  return { ...env, context, Runtime: context.__M28Runtime };
}

function makeChart() {
  return {
    replaySystem: null,
    rawData: [],
    data: [],
    currentTimeframe: '1m',
    scheduleRender() {},
    render() {},
    resampleData(data) { return data; },
    orderManager: {
      _refreshAllGuardsToCurrentCandle() {},
      orderService: {},
    },
  };
}

function makeLiveInstance({ text = source, kill = false, hidden = false } = {}) {
  const env = loadRuntime(text, { kill, hidden });
  const chart = makeChart();
  const instance = new env.Runtime(chart);
  chart.replaySystem = instance;
  chart.orderManager.replaySystem = instance;
  chart.orderManager.orderService.replaySystem = instance;
  instance.isActive = true;
  instance.isPlaying = true;
  instance.playbackMode = 'candle';
  instance.fullRawData = Array.from({ length: 20 }, (_, index) => ({
    t: 60_000 * index,
    c: 100 + index,
  }));
  instance.fullData = instance.fullRawData;
  instance.currentIndex = 3;
  instance.replayTimestamp = instance.fullRawData[instance.currentIndex].t;
  instance.getCandlePlaybackCadence = () => ({ intervalMs: 10, stepsPerTick: 1, orderMoneyPath: false });
  instance._shouldUseTickAnimation = () => false;
  instance.simpleStepForward = () => {
    instance.currentIndex += 1;
    instance.replayTimestamp = instance.fullRawData[instance.currentIndex].t;
  };
  instance.syncPlayPauseUI = () => {};
  instance.syncPlayPauseButtonVisuals = () => {};
  instance.showTickProgress = () => {};
  instance._flushReplayIndicatorRecalc = () => {};
  instance._flushReplayStateToSession = () => {};
  return { env, chart, instance };
}

function hiddenPauseOracle(text = source) {
  const { env, instance } = makeLiveInstance({ text });
  instance.startCandleByCandle(false);
  const firstInterval = instance.playInterval;
  assert.equal(env.census.activeIntervals().length, 1);
  env.census.fireInterval(firstInterval);
  assert.equal(instance.currentIndex, 4);

  env.census.setHidden(true);
  assert.equal(instance.playInterval, null);
  assert.equal(env.census.activeIntervals().length, 0);
  const hiddenIndex = instance.currentIndex;

  for (let i = 0; i < 5; i += 1) {
    const intervals = env.census.activeIntervals();
    assert.equal(intervals.length, 0);
  }
  assert.equal(instance.currentIndex, hiddenIndex);

  env.census.setHidden(false);
  assert.equal(instance.currentIndex, hiddenIndex);
  const resumedInterval = instance.playInterval;
  assert.ok(resumedInterval, 'visible replay resumes by installing a new interval');
  assert.equal(env.census.activeIntervals().length, 1);

  env.census.fireInterval(resumedInterval);
  assert.equal(instance.currentIndex, hiddenIndex + 1);
  env.census.fireInterval(resumedInterval);
  assert.equal(instance.currentIndex, hiddenIndex + 2);
}

function killSwitchOracle(text = source) {
  const { env, instance } = makeLiveInstance({ text, kill: true });
  instance.startCandleByCandle(false);
  const interval = instance.playInterval;
  env.census.setHidden(true);
  assert.equal(instance.playInterval, interval);
  assert.equal(env.census.activeIntervals().length, 1);
  env.census.fireInterval(interval);
  assert.equal(instance.currentIndex, 4);
}

function notPlayingOracle(text = source) {
  const { env, instance } = makeLiveInstance({ text });
  instance.isPlaying = false;
  env.census.setHidden(true);
  env.census.setHidden(false);
  assert.equal(instance.playInterval, null);
  assert.equal(instance.isPlaying, false);

  instance.isActive = false;
  instance.isPlaying = true;
  env.census.setHidden(true);
  env.census.setHidden(false);
  assert.equal(instance.playInterval, null);
}

function listenerDrainOracle(text = source) {
  const { env, instance } = makeLiveInstance({ text });
  assert.equal(env.document.listeners('visibilitychange').length, 1);
  const report = instance.destroy();
  assert.equal(report.state, 'destroyed');
  assert.equal(env.document.listeners('visibilitychange').length, 0);
}

function alreadyHiddenStartOracle(text = source) {
  const { env, instance } = makeLiveInstance({ text, hidden: true });
  instance.startCandleByCandle(true);
  assert.equal(instance.currentIndex, 3);
  assert.equal(instance.playInterval, null);
  assert.equal(env.census.activeIntervals().length, 0);

  env.census.setHidden(false);
  assert.equal(instance.currentIndex, 3);
  const interval = instance.playInterval;
  assert.ok(interval, 'visible replay starts cadence after already-hidden start');
  env.census.fireInterval(interval);
  assert.equal(instance.currentIndex, 4);
}

function replaceOnce(text, needle, replacement) {
  assert.equal(text.includes(needle), true, `mutation needle missing: ${needle}`);
  return text.replace(needle, replacement);
}

test('M28 replay system stays byte-identical to homepage mirror', () => {
  assert.equal(source, mirrorSource);
});

test('M28 RED: hidden document stops candle interval and resumes without skip or catch-up', () => {
  hiddenPauseOracle();
});

test('M28 hidden-pause kill switch keeps base run-while-hidden behavior', () => {
  killSwitchOracle();
});

test('M28 visibility changes do not start inactive or not-playing replay', () => {
  notPlayingOracle();
});

test('M28 visibility listener is drained by replay lifecycle destroy', () => {
  listenerDrainOracle();
});

test('M28 replay started while already hidden waits until visible', () => {
  alreadyHiddenStartOracle();
});

test('M28 mutation checks require passing unmutated oracles first', () => {
  hiddenPauseOracle();
  killSwitchOracle();
  notPlayingOracle();
  listenerDrainOracle();
  alreadyHiddenStartOracle();

  const noKillSwitch = replaceOnce(
    source,
    "    return typeof window === 'undefined'\n        || window.__TALARIA_DISABLE_REPLAY_HIDDEN_PAUSE_V1 !== true;",
    '    return true;',
  );
  assert.throws(() => killSwitchOracle(noKillSwitch));

  const neverResume = replaceOnce(
    source,
    '            this._resumeReplayFromHiddenPage();',
    '            return;',
  );
  assert.throws(() => hiddenPauseOracle(neverResume));

  const catchUpResume = replaceOnce(
    source,
    '        this.startCandleByCandle(false);',
    '        this.startCandleByCandle(true);',
  );
  assert.throws(() => hiddenPauseOracle(catchUpResume));
});
