export const M6_REPLAY_LEAK_SIGNATURE = 'TALARIA_M6_REPLAY_LEAK_V1';
export const M6_SCHEDULER_CENSUS_EPSILON = 2;
const M6_SCHEDULER_CENSUS_KEY = '__talariaM6SchedulerCensus';

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
    listenerTotal: 0,
    listenerKeys: new Map(),
    channels: new Set(),
    broadcastChannels: new Set(),
    workers: new Set(),
    timerCallbacks: 0,
    intervalCallbacks: 0,
    rafCallbacks: 0,
    errors: [],
  };

  try {
    const originalSetTimeout = win.setTimeout && win.setTimeout.bind(win);
    const originalClearTimeout = win.clearTimeout && win.clearTimeout.bind(win);
    if (originalSetTimeout && originalClearTimeout) {
      win.setTimeout = function m6SetTimeout(fn, delay, ...args) {
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
      };
      win.clearTimeout = function m6ClearTimeout(handle) {
        state.timeouts.delete(handle);
        return originalClearTimeout(handle);
      };
    }
  } catch (error) {
    state.errors.push('timer-wrap:' + String(error && error.message || error));
  }

  try {
    const originalSetInterval = win.setInterval && win.setInterval.bind(win);
    const originalClearInterval = win.clearInterval && win.clearInterval.bind(win);
    if (originalSetInterval && originalClearInterval) {
      win.setInterval = function m6SetInterval(fn, delay, ...args) {
        const wrapped = typeof fn === 'function'
          ? function m6IntervalCallback(...callbackArgs) {
            state.intervalCallbacks += 1;
            return fn.apply(this, callbackArgs);
          }
          : fn;
        const handle = originalSetInterval(wrapped, delay, ...args);
        state.intervals.add(handle);
        return handle;
      };
      win.clearInterval = function m6ClearInterval(handle) {
        state.intervals.delete(handle);
        return originalClearInterval(handle);
      };
    }
  } catch (error) {
    state.errors.push('interval-wrap:' + String(error && error.message || error));
  }

  try {
    const originalRaf = win.requestAnimationFrame && win.requestAnimationFrame.bind(win);
    const originalCancelRaf = win.cancelAnimationFrame && win.cancelAnimationFrame.bind(win);
    if (originalRaf && originalCancelRaf) {
      win.requestAnimationFrame = function m6RequestAnimationFrame(fn) {
        let handle;
        handle = originalRaf(function m6RafCallback(ts) {
          state.rafs.delete(handle);
          state.rafCallbacks += 1;
          return fn(ts);
        });
        state.rafs.add(handle);
        return handle;
      };
      win.cancelAnimationFrame = function m6CancelAnimationFrame(handle) {
        state.rafs.delete(handle);
        return originalCancelRaf(handle);
      };
    }
  } catch (error) {
    state.errors.push('raf-wrap:' + String(error && error.message || error));
  }

  try {
    const proto = win.EventTarget && win.EventTarget.prototype;
    const originalAdd = proto && proto.addEventListener;
    const originalRemove = proto && proto.removeEventListener;
    if (proto && originalAdd && originalRemove && !proto.__talariaM6ListenerWrapped) {
      proto.addEventListener = function m6AddEventListener(type, listener, options) {
        if (listener) {
          const key = `${String(type)}|${String(!!(options && options.capture))}`;
          state.listenerKeys.set(key, (state.listenerKeys.get(key) || 0) + 1);
          state.listenerTotal += 1;
        }
        return originalAdd.call(this, type, listener, options);
      };
      proto.removeEventListener = function m6RemoveEventListener(type, listener, options) {
        if (listener) {
          const key = `${String(type)}|${String(!!(options && options.capture))}`;
          const count = state.listenerKeys.get(key) || 0;
          if (count > 1) state.listenerKeys.set(key, count - 1);
          else state.listenerKeys.delete(key);
          state.listenerTotal = Math.max(0, state.listenerTotal - 1);
        }
        return originalRemove.call(this, type, listener, options);
      };
      Object.defineProperty(proto, '__talariaM6ListenerWrapped', { value: true, configurable: true });
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
      Object.defineProperty(M6MessageChannel, '__talariaM6Wrapped', { value: true, configurable: true });
      win.MessageChannel = M6MessageChannel;
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
      Object.defineProperty(M6BroadcastChannel, '__talariaM6Wrapped', { value: true, configurable: true });
      win.BroadcastChannel = M6BroadcastChannel;
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
      Object.defineProperty(M6Worker, '__talariaM6Wrapped', { value: true, configurable: true });
      win.Worker = M6Worker;
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
  const chart = (() => {
    try { return win && win.chart ? win.chart : null; } catch (_) { return null; }
  })();
  return {
    label: state ? state.label : label,
    installed: !!state,
    pendingTimeouts: state ? state.timeouts.size : 0,
    pendingIntervals: state ? state.intervals.size : 0,
    pendingRafs: state ? state.rafs.size : 0,
    eventListeners: state ? state.listenerTotal : 0,
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
  };
  for (const row of windows) {
    if (row && row.installed) totals.installedWindows += 1;
    for (const key of Object.keys(totals)) {
      if (key === 'installedWindows' || key === 'windowCount') continue;
      totals[key] += Number(row && row[key]) || 0;
    }
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

export function assertM6ReplayLeakCounts({ baseline, final, mutant = false, workload = null } = {}) {
  const workloadArmed = !workload || workload.armed === true;
  const baselineScheduler = baseline?.schedulingCensus?.totals || null;
  const finalScheduler = final?.schedulingCensus?.totals || null;
  const schedulerDelta = (Number(finalScheduler?.totalResidue) || 0) - (Number(baselineScheduler?.totalResidue) || 0);
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
      name: 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE',
      blocking: true,
      pass: !!baselineScheduler
        && !!finalScheduler
        && schedulerDelta <= M6_SCHEDULER_CENSUS_EPSILON,
      detail: `baselineTotal=${baselineScheduler?.totalResidue}; finalTotal=${finalScheduler?.totalResidue}; delta=${schedulerDelta}; epsilon=${M6_SCHEDULER_CENSUS_EPSILON}; timers=${finalScheduler?.pendingTimeouts}/${finalScheduler?.pendingIntervals}; raf=${finalScheduler?.pendingRafs}; listeners=${finalScheduler?.eventListeners}; channels=${finalScheduler?.messageChannels}/${finalScheduler?.broadcastChannels}; workers=${finalScheduler?.workers}`,
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

