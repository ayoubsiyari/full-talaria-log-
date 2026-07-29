export const M6_REPLAY_LEAK_SIGNATURE = 'TALARIA_M6_REPLAY_LEAK_V1';
const M6_SCHEDULER_CENSUS_KEY = '__talariaM6SchedulerCensus';
const M6_WRAPPED_MARKER = '__talariaM6Wrapped';
const M6_ZERO_TOLERANCE_CHANNELS = [
  'pendingIntervals',
  'messageChannels',
  'broadcastChannels',
  'workers',
  'eventListeners',
];
const M6_SOAKED_TIMER_CHANNELS = [
  'pendingTimeouts',
  'pendingRafs',
];
const M6_SOUND_DEFECT_CHANNELS = [
  'pendingIntervals',
  'messageChannels',
  'broadcastChannels',
  'workers',
];
const M6_DEFAULT_WORKER_CREDIT_CYCLES = 5;
const M6_CALLBACK_OBSERVATION_MARGIN = 2;

function isObject(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function replayStateOf(value) {
  if (!isObject(value) || !Object.hasOwn(value, '_m20Q6LifecycleState')) return null;
  return String(value._m20Q6LifecycleState || '');
}

export function isLiveM20Q6ReplaySystem(value) {
  const state = replayStateOf(value);
  return state !== null && state !== 'destroyed';
}

function getContentWindow(frame) {
  try {
    return frame && frame.contentWindow ? frame.contentWindow : null;
  } catch (_) {
    return null;
  }
}

function collectReplaySystemsFromWindow(win, systems, seenObjects, seenWindows) {
  if (!isObject(win) || seenWindows.has(win)) return;
  seenWindows.add(win);

  const consider = (value) => {
    if (!isObject(value) || seenObjects.has(value)) return;
    seenObjects.add(value);
    if (replayStateOf(value) !== null) systems.push(value);
  };

  let chart = null;
  try { chart = win.chart || null; } catch (_) {}
  consider(chart);
  try { consider(chart && chart.replaySystem); } catch (_) {}

  for (const key of ['__harnessManager', '__multichartManagerRef']) {
    let manager = null;
    try { manager = win[key] || null; } catch (_) {}
    if (!manager || !manager.charts || typeof manager.charts.values !== 'function') continue;
    try {
      for (const entry of manager.charts.values()) {
        if (!entry) continue;
        try { collectReplaySystemsFromWindow(getContentWindow(entry.frame), systems, seenObjects, seenWindows); } catch (_) {}
        try { consider(entry.chart && entry.chart.replaySystem); } catch (_) {}
        try { consider(entry.bridge && entry.bridge.chart && entry.bridge.chart.replaySystem); } catch (_) {}
      }
    } catch (_) {}
  }

  let frames = [];
  try {
    frames = win.document ? Array.from(win.document.querySelectorAll('iframe')) : [];
  } catch (_) {}
  for (const frame of frames) {
    collectReplaySystemsFromWindow(getContentWindow(frame), systems, seenObjects, seenWindows);
  }
}

export function findM20Q6ReplaySystems(win) {
  const systems = [];
  collectReplaySystemsFromWindow(win, systems, new WeakSet(), new WeakSet());
  return systems;
}

export function countLiveM20Q6ReplaySystems(win) {
  return findM20Q6ReplaySystems(win).filter(isLiveM20Q6ReplaySystem).length;
}

export function connectedIframeCount(win) {
  try {
    return win && win.document ? win.document.querySelectorAll('iframe').length : 0;
  } catch (_) {
    return 0;
  }
}

function safeNow(win) {
  try {
    return win.performance && typeof win.performance.now === 'function'
      ? win.performance.now()
      : Date.now();
  } catch (_) {
    return Date.now();
  }
}

function censusState(win) {
  if (!isObject(win)) return null;
  try {
    return win[M6_SCHEDULER_CENSUS_KEY] || null;
  } catch (_) {
    return null;
  }
}

function addCensusError(state, message) {
  if (!state || !Array.isArray(state.errors) || !message) return;
  if (!state.errors.includes(message)) state.errors.push(message);
}

function markM6Wrapped(value) {
  if (!isObject(value)) return value;
  try {
    Object.defineProperty(value, M6_WRAPPED_MARKER, { value: true, configurable: true });
  } catch (_) {}
  return value;
}

function verifyWrapperValue(state, key, currentValue) {
  const expected = state?.wrappers?.[key];
  if (!expected) return;
  if (currentValue !== expected) {
    addCensusError(state, `wrapper-displaced:${key}`);
    return;
  }
  if (isObject(currentValue) && currentValue[M6_WRAPPED_MARKER] !== true) {
    addCensusError(state, `wrapper-unmarked:${key}`);
  }
}

function verifyCensusWrapperIdentity(win, state) {
  if (!isObject(win) || !state || !state.wrappers) return;
  for (const key of [
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'requestAnimationFrame',
    'cancelAnimationFrame',
  ]) {
    if (!state.wrappers[key]) continue;
    try {
      verifyWrapperValue(state, key, win[key]);
    } catch (error) {
      addCensusError(state, `wrapper-check:${key}:${String(error && error.message || error)}`);
    }
  }
  for (const key of ['MessageChannel', 'BroadcastChannel', 'Worker']) {
    try {
      verifyWrapperValue(state, key, win[key]);
    } catch (error) {
      addCensusError(state, `wrapper-check:${key}:${String(error && error.message || error)}`);
    }
  }
  try {
    const proto = win.EventTarget && win.EventTarget.prototype;
    if (proto) {
      verifyWrapperValue(state, 'EventTarget.prototype.addEventListener', proto.addEventListener);
      verifyWrapperValue(state, 'EventTarget.prototype.removeEventListener', proto.removeEventListener);
    }
  } catch (error) {
    addCensusError(state, `wrapper-check:EventTarget.prototype:${String(error && error.message || error)}`);
  }
}

export function installM6SchedulingCensus(win, label = 'window') {
  if (!isObject(win)) return null;
  try {
    if (win[M6_SCHEDULER_CENSUS_KEY]) {
      win[M6_SCHEDULER_CENSUS_KEY].label = label;
      return win[M6_SCHEDULER_CENSUS_KEY];
    }
  } catch (_) {
    return null;
  }

  const state = {
    label,
    installedAt: safeNow(win),
    timeouts: new Set(),
    intervals: new Set(),
    rafs: new Set(),
    listenerRegistrations: new Map(),
    listenerIndex: new WeakMap(),
    nextListenerId: 1,
    channels: new Set(),
    broadcastChannels: new Set(),
    workers: new Set(),
    timerCallbacks: 0,
    intervalCallbacks: 0,
    rafCallbacks: 0,
    wrappers: {},
    errors: [],
  };

  try {
    const originalSetTimeout = win.setTimeout && win.setTimeout.bind(win);
    const originalClearTimeout = win.clearTimeout && win.clearTimeout.bind(win);
    if (originalSetTimeout && originalClearTimeout) {
      state.wrappers.setTimeout = markM6Wrapped(function m6SetTimeout(fn, delay, ...args) {
        let handle;
        const wrapped = typeof fn === 'function'
          ? function m6TimeoutCallback(...callbackArgs) {
            state.timeouts.delete(handle);
            state.timerCallbacks += 1;
            return fn.apply(this, callbackArgs);
          }
          : fn;
        handle = originalSetTimeout(wrapped, delay, ...args);
        state.timeouts.add(handle);
        return handle;
      });
      state.wrappers.clearTimeout = markM6Wrapped(function m6ClearTimeout(handle) {
        state.timeouts.delete(handle);
        return originalClearTimeout(handle);
      });
      win.setTimeout = state.wrappers.setTimeout;
      win.clearTimeout = state.wrappers.clearTimeout;
    }
  } catch (error) {
    state.errors.push('timer-wrap:' + String(error && error.message || error));
  }

  try {
    const originalSetInterval = win.setInterval && win.setInterval.bind(win);
    const originalClearInterval = win.clearInterval && win.clearInterval.bind(win);
    if (originalSetInterval && originalClearInterval) {
      state.wrappers.setInterval = markM6Wrapped(function m6SetInterval(fn, delay, ...args) {
        const wrapped = typeof fn === 'function'
          ? function m6IntervalCallback(...callbackArgs) {
            state.intervalCallbacks += 1;
            return fn.apply(this, callbackArgs);
          }
          : fn;
        const handle = originalSetInterval(wrapped, delay, ...args);
        state.intervals.add(handle);
        return handle;
      });
      state.wrappers.clearInterval = markM6Wrapped(function m6ClearInterval(handle) {
        state.intervals.delete(handle);
        return originalClearInterval(handle);
      });
      win.setInterval = state.wrappers.setInterval;
      win.clearInterval = state.wrappers.clearInterval;
    }
  } catch (error) {
    state.errors.push('interval-wrap:' + String(error && error.message || error));
  }

  try {
    const originalRaf = win.requestAnimationFrame && win.requestAnimationFrame.bind(win);
    const originalCancelRaf = win.cancelAnimationFrame && win.cancelAnimationFrame.bind(win);
    if (originalRaf && originalCancelRaf) {
      state.wrappers.requestAnimationFrame = markM6Wrapped(function m6RequestAnimationFrame(fn) {
        let handle;
        handle = originalRaf(function m6RafCallback(ts) {
          state.rafs.delete(handle);
          state.rafCallbacks += 1;
          return fn(ts);
        });
        state.rafs.add(handle);
        return handle;
      });
      state.wrappers.cancelAnimationFrame = markM6Wrapped(function m6CancelAnimationFrame(handle) {
        state.rafs.delete(handle);
        return originalCancelRaf(handle);
      });
      win.requestAnimationFrame = state.wrappers.requestAnimationFrame;
      win.cancelAnimationFrame = state.wrappers.cancelAnimationFrame;
    }
  } catch (error) {
    state.errors.push('raf-wrap:' + String(error && error.message || error));
  }

  try {
    const proto = win.EventTarget && win.EventTarget.prototype;
    const originalAdd = proto && proto.addEventListener;
    const originalRemove = proto && proto.removeEventListener;
    if (proto && originalAdd && originalRemove && !originalAdd[M6_WRAPPED_MARKER]) {
      const captureOf = (options) => {
        if (options === true) return true;
        return !!(options && typeof options === 'object' && options.capture);
      };
      const onceOf = (options) => !!(options && typeof options === 'object' && options.once);
      const signalOf = (options) => (options && typeof options === 'object' ? options.signal : null);
      const listenerTypeKey = (type, capture) => `${String(type)}|${String(capture)}`;
      const listenerMapFor = (target, listener, create) => {
        if (!isObject(target) || !isObject(listener)) return null;
        let byListener = state.listenerIndex.get(target);
        if (!byListener && create) {
          byListener = new WeakMap();
          state.listenerIndex.set(target, byListener);
        }
        if (!byListener) return null;
        let byType = byListener.get(listener);
        if (!byType && create) {
          byType = new Map();
          byListener.set(listener, byType);
        }
        return byType || null;
      };
      const unregisterRecord = (record) => {
        if (!record || !record.active) return false;
        record.active = false;
        const byType = listenerMapFor(record.target, record.listener, false);
        const key = listenerTypeKey(record.type, record.capture);
        if (byType && byType.get(key) === record) byType.delete(key);
        state.listenerRegistrations.delete(record.id);
        if (record.signal && record.abortHandler) {
          try { originalRemove.call(record.signal, 'abort', record.abortHandler, false); } catch (_) {}
        }
        return true;
      };
      const invokeListener = (listener, thisArg, args) => {
        if (typeof listener === 'function') return listener.apply(thisArg, args);
        if (listener && typeof listener.handleEvent === 'function') return listener.handleEvent.apply(listener, args);
        return undefined;
      };
      const registerListener = (target, type, listener, options) => {
        if (!listener || !isObject(listener)) return null;
        const signal = signalOf(options);
        if (signal && signal.aborted) return null;
        const capture = captureOf(options);
        const key = listenerTypeKey(type, capture);
        const byType = listenerMapFor(target, listener, true);
        if (!byType) return null;
        const existing = byType.get(key);
        if (existing && existing.active) return existing;
        const record = {
          id: state.nextListenerId++,
          target,
          type: String(type),
          capture,
          listener,
          wrapped: listener,
          signal,
          abortHandler: null,
          active: true,
        };
        if (onceOf(options)) {
          record.wrapped = function m6OnceEventListener(...args) {
            unregisterRecord(record);
            return invokeListener(listener, this, args);
          };
        }
        if (signal && typeof signal.addEventListener === 'function') {
          record.abortHandler = () => unregisterRecord(record);
          try { originalAdd.call(signal, 'abort', record.abortHandler, { once: true }); } catch (_) {}
        }
        byType.set(key, record);
        state.listenerRegistrations.set(record.id, record);
        return record;
      };
      const findListener = (target, type, listener, options) => {
        const byType = listenerMapFor(target, listener, false);
        return byType ? byType.get(listenerTypeKey(type, captureOf(options))) || null : null;
      };
      state.wrappers['EventTarget.prototype.addEventListener'] = markM6Wrapped(function m6AddEventListener(type, listener, options) {
        const record = registerListener(this, type, listener, options);
        return originalAdd.call(this, type, record ? record.wrapped : listener, options);
      });
      state.wrappers['EventTarget.prototype.removeEventListener'] = markM6Wrapped(function m6RemoveEventListener(type, listener, options) {
        const record = findListener(this, type, listener, options);
        if (record) {
          unregisterRecord(record);
          return originalRemove.call(this, type, record.wrapped, options);
        }
        return originalRemove.call(this, type, listener, options);
      });
      proto.addEventListener = state.wrappers['EventTarget.prototype.addEventListener'];
      proto.removeEventListener = state.wrappers['EventTarget.prototype.removeEventListener'];
      Object.defineProperty(proto, '__talariaM6ListenerWrapped', { value: true, configurable: true });
    } else if (proto && originalAdd && originalRemove) {
      addCensusError(state, 'listener-wrap:prewrapped');
    }
  } catch (error) {
    state.errors.push('listener-wrap:' + String(error && error.message || error));
  }

  try {
    const OriginalMessageChannel = win.MessageChannel;
    if (typeof OriginalMessageChannel === 'function' && !OriginalMessageChannel.__talariaM6Wrapped) {
      function M6MessageChannel(...args) {
        const channel = new OriginalMessageChannel(...args);
        state.channels.add(channel);
        for (const port of [channel.port1, channel.port2]) {
          if (!port || port.__talariaM6CloseWrapped) continue;
          const originalClose = port.close && port.close.bind(port);
          if (originalClose) {
            port.close = function m6PortClose(...closeArgs) {
              state.channels.delete(channel);
              return originalClose(...closeArgs);
            };
            Object.defineProperty(port, '__talariaM6CloseWrapped', { value: true, configurable: true });
          }
        }
        return channel;
      }
      M6MessageChannel.prototype = OriginalMessageChannel.prototype;
      markM6Wrapped(M6MessageChannel);
      state.wrappers.MessageChannel = M6MessageChannel;
      win.MessageChannel = M6MessageChannel;
    } else if (typeof OriginalMessageChannel === 'function') {
      addCensusError(state, 'messagechannel-wrap:prewrapped');
    }
  } catch (error) {
    state.errors.push('messagechannel-wrap:' + String(error && error.message || error));
  }

  try {
    const OriginalBroadcastChannel = win.BroadcastChannel;
    if (typeof OriginalBroadcastChannel === 'function' && !OriginalBroadcastChannel.__talariaM6Wrapped) {
      function M6BroadcastChannel(...args) {
        const channel = new OriginalBroadcastChannel(...args);
        state.broadcastChannels.add(channel);
        const originalClose = channel.close && channel.close.bind(channel);
        if (originalClose) {
          channel.close = function m6BroadcastClose(...closeArgs) {
            state.broadcastChannels.delete(channel);
            return originalClose(...closeArgs);
          };
        }
        return channel;
      }
      M6BroadcastChannel.prototype = OriginalBroadcastChannel.prototype;
      markM6Wrapped(M6BroadcastChannel);
      state.wrappers.BroadcastChannel = M6BroadcastChannel;
      win.BroadcastChannel = M6BroadcastChannel;
    } else if (typeof OriginalBroadcastChannel === 'function') {
      addCensusError(state, 'broadcastchannel-wrap:prewrapped');
    }
  } catch (error) {
    state.errors.push('broadcastchannel-wrap:' + String(error && error.message || error));
  }

  try {
    const OriginalWorker = win.Worker;
    if (typeof OriginalWorker === 'function' && !OriginalWorker.__talariaM6Wrapped) {
      function M6Worker(...args) {
        const worker = new OriginalWorker(...args);
        state.workers.add(worker);
        const originalTerminate = worker.terminate && worker.terminate.bind(worker);
        if (originalTerminate) {
          worker.terminate = function m6WorkerTerminate(...terminateArgs) {
            state.workers.delete(worker);
            return originalTerminate(...terminateArgs);
          };
        }
        return worker;
      }
      M6Worker.prototype = OriginalWorker.prototype;
      markM6Wrapped(M6Worker);
      state.wrappers.Worker = M6Worker;
      win.Worker = M6Worker;
    } else if (typeof OriginalWorker === 'function') {
      addCensusError(state, 'worker-wrap:prewrapped');
    }
  } catch (error) {
    state.errors.push('worker-wrap:' + String(error && error.message || error));
  }

  try {
    win[M6_SCHEDULER_CENSUS_KEY] = state;
  } catch (_) {
    return null;
  }
  return state;
}

export function summarizeM6SchedulingCensus(win, label = 'window') {
  const state = censusState(win) || installM6SchedulingCensus(win, label);
  verifyCensusWrapperIdentity(win, state);
  const chart = (() => {
    try { return win && win.chart ? win.chart : null; } catch (_) { return null; }
  })();
  return {
    label: state ? state.label : label,
    installed: !!state,
    installedAt: state ? state.installedAt : null,
    pendingTimeouts: state ? state.timeouts.size : 0,
    pendingIntervals: state ? state.intervals.size : 0,
    pendingRafs: state ? state.rafs.size : 0,
    eventListeners: state ? state.listenerRegistrations.size : 0,
    messageChannels: state ? state.channels.size : 0,
    broadcastChannels: state ? state.broadcastChannels.size : 0,
    workers: state ? state.workers.size : 0,
    timerCallbacks: state ? state.timerCallbacks : 0,
    intervalCallbacks: state ? state.intervalCallbacks : 0,
    rafCallbacks: state ? state.rafCallbacks : 0,
    hasMultichartCmdBridge: !!(() => {
      try { return win && win.MultichartCmdBridge; } catch (_) { return null; }
    })(),
    hasMultichartBridge: !!(() => {
      try { return win && win.MultichartBridge; } catch (_) { return null; }
    })(),
    chartSyncBridgeInstalled: !!(chart && (chart.__multichartSyncBridgeInstalled || chart._multichartSyncBridgeInstalled)),
    errors: state ? state.errors.slice() : ['install-unavailable'],
  };
}

export function totalM6SchedulingResidue(census) {
  if (!census || typeof census !== 'object') return 0;
  return [
    'pendingTimeouts',
    'pendingIntervals',
    'pendingRafs',
    'eventListeners',
    'messageChannels',
    'broadcastChannels',
    'workers',
  ].reduce((sum, key) => sum + (Number(census[key]) || 0), 0);
}

export function aggregateM6SchedulingCensus(rows = []) {
  const windows = Array.isArray(rows) ? rows : [];
  const totals = {
    pendingTimeouts: 0,
    pendingIntervals: 0,
    pendingRafs: 0,
    eventListeners: 0,
    messageChannels: 0,
    broadcastChannels: 0,
    workers: 0,
    timerCallbacks: 0,
    intervalCallbacks: 0,
    rafCallbacks: 0,
    installedWindows: 0,
    windowCount: windows.length,
    errorCount: 0,
    errors: [],
    installedAtByLabel: {},
  };
  for (const row of windows) {
    if (row && row.installed) totals.installedWindows += 1;
    if (row && row.label && row.installedAt != null) {
      totals.installedAtByLabel[row.label] = row.installedAt;
    }
    for (const key of Object.keys(totals)) {
      if (key === 'installedWindows' || key === 'windowCount' || key === 'errors' || key === 'installedAtByLabel') continue;
      totals[key] += Number(row && row[key]) || 0;
    }
    const errors = Array.isArray(row && row.errors) ? row.errors.filter(Boolean) : [];
    totals.errorCount += errors.length;
    totals.errors.push(...errors.map((error) => `${row.label || 'window'}:${error}`));
  }
  totals.totalResidue = totalM6SchedulingResidue(totals);
  return totals;
}

export function countDetachedIframes(trackedIframes = []) {
  if (!Array.isArray(trackedIframes)) return 0;
  // Strong refs only. WeakRef would GC-hide detached panel documents and
  // turn M6-DETACHED-IFRAME-COUNT-NOT-GROWN into a soft pass.
  return trackedIframes.filter((frame) => frame && frame.isConnected === false).length;
}

function schedulerCensusInstrumented(totals) {
  return !!totals
    && Number(totals.installedWindows) >= 1
    && Number(totals.windowCount) >= 1
    && (!Array.isArray(totals.errors) || totals.errors.length === 0)
    && Number(totals.errorCount || 0) === 0;
}

function schedulingRows(snapshot) {
  return Array.isArray(snapshot?.schedulingCensus?.rows) ? snapshot.schedulingCensus.rows : [];
}

function schedulerEpochContinuity(baselineRows, finalRows) {
  const errors = [];
  const checked = [];
  const finalByLabel = new Map();
  for (const row of finalRows) {
    if (!row || !row.label || row.installedAt == null) continue;
    finalByLabel.set(row.label, row);
  }
  for (const baselineRow of baselineRows) {
    if (!baselineRow || !baselineRow.label || baselineRow.installed !== true) continue;
    const finalRow = finalByLabel.get(baselineRow.label);
    if (!finalRow || finalRow.installed !== true) {
      errors.push(`epoch-missing:${baselineRow.label}`);
      continue;
    }
    checked.push({
      label: baselineRow.label,
      baselineInstalledAt: baselineRow.installedAt,
      finalInstalledAt: finalRow.installedAt,
    });
    if (baselineRow.installedAt !== finalRow.installedAt) {
      errors.push(`epoch-reset:${baselineRow.label}:${baselineRow.installedAt}->${finalRow.installedAt}`);
    }
  }
  if (checked.length === 0) errors.push('epoch-unobserved');
  return {
    pass: errors.length === 0,
    checked,
    errors,
  };
}

function schedulerCallbackObservation(baselineRows, finalRows) {
  const finalByLabel = new Map();
  for (const row of finalRows) {
    if (row && row.label) finalByLabel.set(row.label, row);
  }
  const baselineByLabel = new Map();
  for (const row of baselineRows) {
    if (row && row.label) baselineByLabel.set(row.label, row);
  }
  const perWindow = [];
  const errors = [];
  for (const baselineRow of baselineRows) {
    if (!baselineRow || !baselineRow.label || baselineRow.installed !== true) continue;
    const finalRow = finalByLabel.get(baselineRow.label);
    if (!finalRow || finalRow.installed !== true) continue;
    const timerCallbackDelta = (Number(finalRow.timerCallbacks) || 0)
      - (Number(baselineRow.timerCallbacks) || 0);
    const rafCallbackDelta = (Number(finalRow.rafCallbacks) || 0)
      - (Number(baselineRow.rafCallbacks) || 0);
    const pass = timerCallbackDelta >= M6_CALLBACK_OBSERVATION_MARGIN
      || rafCallbackDelta >= M6_CALLBACK_OBSERVATION_MARGIN;
    perWindow.push({
      label: baselineRow.label,
      timerCallbackDelta,
      rafCallbackDelta,
      pass,
    });
    if (!pass) errors.push(`callback-unobserved:${baselineRow.label}`);
  }
  for (const finalRow of finalRows) {
    if (!finalRow || !finalRow.label || finalRow.installed !== true) continue;
    if (!baselineByLabel.has(finalRow.label)) errors.push(`callback-auto-installed:${finalRow.label}`);
  }
  const timerCallbackDelta = perWindow.reduce((sum, row) => sum + row.timerCallbackDelta, 0);
  const rafCallbackDelta = perWindow.reduce((sum, row) => sum + row.rafCallbackDelta, 0);
  return {
    timerCallbackDelta,
    rafCallbackDelta,
    margin: M6_CALLBACK_OBSERVATION_MARGIN,
    perWindow,
    errors,
    pass: perWindow.length > 0 && errors.length === 0,
  };
}

function schedulerChannelDeltas(baselineScheduler, finalScheduler) {
  const deltas = {};
  for (const key of [
    ...M6_ZERO_TOLERANCE_CHANNELS,
    ...M6_SOAKED_TIMER_CHANNELS,
  ]) {
    deltas[key] = (Number(finalScheduler && finalScheduler[key]) || 0)
      - (Number(baselineScheduler && baselineScheduler[key]) || 0);
  }
  return deltas;
}

function schedulerDeltaEvaluation(baselineScheduler, finalScheduler, { cycles = M6_DEFAULT_WORKER_CREDIT_CYCLES } = {}) {
  const deltas = schedulerChannelDeltas(baselineScheduler, finalScheduler);
  const zeroToleranceOk = M6_ZERO_TOLERANCE_CHANNELS.every((key) => deltas[key] <= 0);
  const soakedTimerOk = M6_SOAKED_TIMER_CHANNELS.every((key) => deltas[key] <= 0);
  const soundChannelRed = M6_SOUND_DEFECT_CHANNELS.some((key) => deltas[key] > 0);
  const workerCreditThreshold = Math.max(1, Number(cycles) || M6_DEFAULT_WORKER_CREDIT_CYCLES);
  const workerAttributableRed = deltas.workers >= workerCreditThreshold;
  const nonWorkerAttributableChannels = ['pendingIntervals', 'messageChannels', 'broadcastChannels']
    .filter((key) => deltas[key] > 0);
  const soundAttributableRed = nonWorkerAttributableChannels.length > 0 || workerAttributableRed;
  const attributableCreditChannels = [
    ...nonWorkerAttributableChannels,
    ...(workerAttributableRed ? ['workers'] : []),
  ];
  const workerOnlyRed = deltas.workers > 0 && nonWorkerAttributableChannels.length === 0;
  const workerResidueWithoutCredit = workerOnlyRed && !workerAttributableRed;
  const attributableCreditStatus = soundAttributableRed
    ? 'ATTRIBUTABLE'
    : workerResidueWithoutCredit
      ? 'WORKER-BELOW-THRESHOLD'
      : soundChannelRed
        ? 'NON_ATTRIBUTABLE'
        : 'NONE';
  return {
    deltas,
    zeroToleranceOk,
    soakedTimerOk,
    soundChannelRed,
    soundAttributableRed,
    attributableDefectCredit: soundAttributableRed,
    attributableCreditStatus,
    attributableCreditChannels,
    workerAttributableRed,
    workerCreditThreshold,
    workerOnlyRed,
    workerResidueWithoutCredit,
    pass: zeroToleranceOk && soakedTimerOk,
  };
}

export function assertM6ReplayLeakCounts({ baseline, final, mutant = false, workload = null, cycles = M6_DEFAULT_WORKER_CREDIT_CYCLES } = {}) {
  const workloadArmed = !workload || workload.armed === true;
  const baselineScheduler = baseline?.schedulingCensus?.totals || null;
  const finalScheduler = final?.schedulingCensus?.totals || null;
  const baselineRows = schedulingRows(baseline);
  const finalRows = schedulingRows(final);
  const baselineInstrumented = schedulerCensusInstrumented(baselineScheduler);
  const finalInstrumented = schedulerCensusInstrumented(finalScheduler);
  const schedulerEpochs = schedulerEpochContinuity(baselineRows, finalRows);
  const schedulerCallbacks = schedulerCallbackObservation(baselineRows, finalRows);
  const schedulerInstrumented = baselineInstrumented && finalInstrumented
    && schedulerEpochs.pass
    && schedulerCallbacks.pass;
  const schedulerDeltas = schedulerDeltaEvaluation(baselineScheduler, finalScheduler, { cycles });
  const baselineHeap = baseline?.heap || null;
  const finalHeap = final?.heap || null;
  const heapPresent = !!(baselineHeap || finalHeap);
  const heapInstrumented = !heapPresent || (
    baselineHeap?.metric === 'usedJSHeapSize'
    && baselineHeap?.forcedGcAttempted === true
    && finalHeap?.metric === 'usedJSHeapSize'
    && finalHeap?.forcedGcAttempted === true
  );
  const cells = [
    {
      name: 'M6-PO-WORKLOAD-ARMED',
      blocking: true,
      pass: workloadArmed,
      detail: workload
        ? `armed=${workload.armed}; panels=${workload.panels}; indicatorsOk=${workload.indicatorsOk}; orderOk=${workload.order && workload.order.ok}; stillPlaying=${workload.stillPlaying}`
        : 'workload missing (injected fixture may omit)',
    },
    {
      name: 'M6-HEAP-INSTRUMENT-USED-JS-HEAP',
      // Non-blocking until M26/FIX3 collapse-release cell owns the grade (po-cpu-ab).
      blocking: false,
      pass: heapInstrumented,
      detail: heapPresent
        ? `metric=usedJSHeapSize forcedGc; baseline=${baselineHeap?.usedJSHeapSize}; final=${finalHeap?.usedJSHeapSize}; footprintNonGrading=true`
        : 'heap samples absent (fixture); Task Manager footprint must not grade M26/FIX3',
      metrics: {
        baselineHeap,
        finalHeap,
        footprintNonGrading: true,
      },
    },
    {
      name: 'M6-REPLAY-LIVE-COUNT-RETURNS-TO-ONE',
      blocking: true,
      pass: final && final.liveReplaySystems === 1,
      detail: `baseline=${baseline?.liveReplaySystems}; final=${final?.liveReplaySystems}`,
    },
    {
      name: 'M6-DETACHED-IFRAME-COUNT-NOT-GROWN',
      blocking: true,
      // After return to single-chart: no connected iframe panels, and no
      // strongly-tracked detached panels still holding a live Q6 replay.
      pass: !!final
        && final.connectedIframes === 0
        && final.detachedTrackedIframes === 0,
      detail: `connected=${final?.connectedIframes}; detachedLive=${final?.detachedTrackedIframes}; baselineDetachedLive=${baseline?.detachedTrackedIframes}`,
    },
    {
      name: 'M6-SCHEDULER-CENSUS-INSTRUMENTED',
      blocking: true,
      pass: schedulerInstrumented,
      detail: `baselineInstalled=${baselineScheduler?.installedWindows}/${baselineScheduler?.windowCount}; finalInstalled=${finalScheduler?.installedWindows}/${finalScheduler?.windowCount}; callbackDeltas=timer:${schedulerCallbacks.timerCallbackDelta},raf:${schedulerCallbacks.rafCallbackDelta},margin:${schedulerCallbacks.margin}; callbackErrors=${schedulerCallbacks.errors.join(',') || 'none'}; epochErrors=${schedulerEpochs.errors.join(',') || 'none'}; baselineErrors=${(baselineScheduler?.errors || []).join(',') || 'none'}; finalErrors=${(finalScheduler?.errors || []).join(',') || 'none'}`,
      metrics: {
        baselineInstalledWindows: Number(baselineScheduler?.installedWindows) || 0,
        baselineWindowCount: Number(baselineScheduler?.windowCount) || 0,
        finalInstalledWindows: Number(finalScheduler?.installedWindows) || 0,
        finalWindowCount: Number(finalScheduler?.windowCount) || 0,
        baselineErrorCount: Number(baselineScheduler?.errorCount) || 0,
        finalErrorCount: Number(finalScheduler?.errorCount) || 0,
        callbackObservation: schedulerCallbacks,
        epochContinuity: schedulerEpochs,
      },
    },
    {
      name: 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE',
      blocking: true,
      pass: schedulerInstrumented && schedulerDeltas.pass,
      detail: `baselineTotal=${baselineScheduler?.totalResidue}; finalTotal=${finalScheduler?.totalResidue}; deltas=${JSON.stringify(schedulerDeltas.deltas)}; zeroToleranceOk=${schedulerDeltas.zeroToleranceOk}; soakedTimerOk=${schedulerDeltas.soakedTimerOk}; soundChannelRed=${schedulerDeltas.soundChannelRed}; attributableDefectCredit=${schedulerDeltas.attributableDefectCredit}; creditStatus=${schedulerDeltas.attributableCreditStatus}; workerCreditThreshold=${schedulerDeltas.workerCreditThreshold}`,
      metrics: schedulerDeltas,
    },
  ];

  if (mutant) {
    const acceptanceWentRed = cells
      .filter((cell) => cell.name !== 'M6-PO-WORKLOAD-ARMED')
      .some((cell) => cell.pass === false);
    cells.push({
      name: 'NC-M6-TEARDOWN-REVERSAL',
      blocking: true,
      pass: acceptanceWentRed && final && final.liveReplaySystems > 1,
      detail: `mutant live count=${final?.liveReplaySystems}; acceptanceWentRed=${acceptanceWentRed}`,
    });
  }

  return cells;
}

export function applyM6ReplayTeardownReversal(source) {
  const drainNeedle = `    function m20Q6DrainState(state, reason = 'destroy') {
        if (!state) {`;
  const drainReplacement = `    function m20Q6DrainState(state, reason = 'destroy') {
        return { enabled: true, state: 'mutant-teardown-reversal', reason, pending: 0, errors: [] };
        if (!state) {`;
  if (!source.includes(drainNeedle)) {
    throw new Error('M6 drain reversal target not found in replay-system.js');
  }

  const destroyNeedle = `        destroy() {
            if (this.chart && typeof this.chart._b70ShadowDisposeIndicatorGeneration === 'function') {
                this.chart._b70ShadowDisposeIndicatorGeneration();
            }
            return m20Q6DrainState(m20Q6States.get(this), 'destroy');
        }`;
  const destroyReplacement = `        destroy() {
            return { enabled: true, state: 'mutant-teardown-reversal', reason: 'NC-M6-TEARDOWN-REVERSAL', pending: 0, errors: [] };
        }`;
  if (!source.includes(destroyNeedle)) {
    throw new Error('M6 teardown reversal target not found in replay-system.js');
  }
  return source
    .replace(drainNeedle, drainReplacement)
    .replace(destroyNeedle, destroyReplacement);
}

