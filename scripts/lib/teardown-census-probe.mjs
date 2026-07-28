/**
 * TEARDOWN-CENSUS-GATE-V1 probe — counts uncleared timers, listeners, rAF, channels.
 * Signature context: TALARIA_TEARDOWN_CENSUS_V1
 *
 * Product multichart wiring is a follow-up hang point; this instrument is behaviour-covering
 * on the hermetic sim and installable in browser fixtures.
 */

export const TEARDOWN_CENSUS_PROBE_SIGNATURE = 'TALARIA_TEARDOWN_CENSUS_V1';
export const REST_STATE_CENSUS_PROBE_SIGNATURE = 'TALARIA_REST_STATE_CENSUS_V1';

/** Scheduled-work keys checked at idle rest (same census instrument as teardown). */
export const REST_SCHEDULED_CENSUS_KEYS = /** @type {const} */ ([
  'timeouts',
  'intervals',
  'animationFrames',
]);

/**
 * Pinned hermetic idle allowlist — zero standing timers/rAF at rest.
 * @type {{
 *   name: string,
 *   justification: string,
 *   limits: Record<(typeof REST_SCHEDULED_CENSUS_KEYS)[number], number>,
 *   declaredScheduled: Record<(typeof REST_SCHEDULED_CENSUS_KEYS)[number], number>,
 * }}
 */
export const HERMETIC_REST_PINNED_ALLOWLIST = {
  name: 'HERMETIC-REST-PINNED-ZERO-V1',
  justification: 'Idle hermetic sim: no countdown, rAF loop, or orphan timeout while at rest',
  limits: { timeouts: 0, intervals: 0, animationFrames: 0 },
  declaredScheduled: { timeouts: 0, intervals: 0, animationFrames: 0 },
};

/**
 * Pinned idle observe budgets (hermetic window — not fitted to Task Manager CPU%).
 * Zero data commits during observe ⇒ no self-sustaining rAF/interval cadence or long tasks.
 */
export const REST_IDLE_RAF_TICKS_MAX = 0;
export const REST_IDLE_INTERVAL_CALLBACKS_MAX = 0;
export const REST_IDLE_LONGTASK_MAX = 0;

/** @typedef {{
 *   timeouts: number,
 *   intervals: number,
 *   animationFrames: number,
 *   listeners: number,
 *   messageChannelPorts: number,
 *   broadcastChannels: number,
 * }} CensusSnapshot */

/**
 * @param {object} global — window-like host (must expose timer/DOM/channel APIs used by sim)
 * @param {{ countElementListeners?: boolean }} [options]
 */
export function installCensus(global, options = {}) {
  const countElementListeners = Boolean(options.countElementListeners);
  const activeTimeouts = new Set();
  const activeIntervals = new Set();
  const activeRaf = new Set();
  let listenerNet = 0;
  let messageChannelPorts = 0;
  let broadcastChannels = 0;

  const orig = {
    setTimeout: global.setTimeout?.bind(global),
    clearTimeout: global.clearTimeout?.bind(global),
    setInterval: global.setInterval?.bind(global),
    clearInterval: global.clearInterval?.bind(global),
    requestAnimationFrame: global.requestAnimationFrame?.bind(global),
    cancelAnimationFrame: global.cancelAnimationFrame?.bind(global),
    MessageChannel: global.MessageChannel,
    BroadcastChannel: global.BroadcastChannel,
  };

  const EventTarget = global.EventTarget;
  const origAdd = EventTarget?.prototype?.addEventListener;
  const origRemove = EventTarget?.prototype?.removeEventListener;

  function isCountedListenerTarget(target) {
    if (!target) return false;
    if (target === global.window || target === global.document) return true;
    if (countElementListeners && typeof global.Element !== 'undefined' && target instanceof global.Element) {
      return true;
    }
    return false;
  }

  if (orig.setTimeout) {
    global.setTimeout = (fn, delay, ...rest) => {
      const wrapped = (...args) => {
        activeTimeouts.delete(handle);
        return fn(...args);
      };
      const handle = orig.setTimeout(wrapped, delay, ...rest);
      activeTimeouts.add(handle);
      return handle;
    };
    global.clearTimeout = (handle) => {
      activeTimeouts.delete(handle);
      return orig.clearTimeout(handle);
    };
  }

  if (orig.setInterval) {
    global.setInterval = (fn, delay, ...rest) => {
      const handle = orig.setInterval(fn, delay, ...rest);
      activeIntervals.add(handle);
      return handle;
    };
    global.clearInterval = (handle) => {
      activeIntervals.delete(handle);
      return orig.clearInterval(handle);
    };
  }

  if (orig.requestAnimationFrame) {
    global.requestAnimationFrame = (cb) => {
      const wrapped = (ts) => {
        activeRaf.delete(handle);
        return cb(ts);
      };
      const handle = orig.requestAnimationFrame(wrapped);
      activeRaf.add(handle);
      return handle;
    };
    global.cancelAnimationFrame = (handle) => {
      activeRaf.delete(handle);
      return orig.cancelAnimationFrame(handle);
    };
  }

  if (origAdd && origRemove) {
    EventTarget.prototype.addEventListener = function patchedAdd(type, listener, opts) {
      if (isCountedListenerTarget(this)) listenerNet += 1;
      return origAdd.call(this, type, listener, opts);
    };
    EventTarget.prototype.removeEventListener = function patchedRemove(type, listener, opts) {
      if (isCountedListenerTarget(this)) listenerNet -= 1;
      return origRemove.call(this, type, listener, opts);
    };
  }

  if (orig.MessageChannel) {
    global.MessageChannel = class PatchedMessageChannel extends orig.MessageChannel {
      constructor(...args) {
        super(...args);
        messageChannelPorts += 2;
        const port1 = this.port1;
        const port2 = this.port2;
        const wrapPort = (port) => {
          const closeOrig = port.close?.bind(port);
          if (!closeOrig) return;
          port.close = () => {
            if (port.__talariaCensusOpen) {
              port.__talariaCensusOpen = false;
              messageChannelPorts -= 1;
            }
            return closeOrig();
          };
          port.__talariaCensusOpen = true;
        };
        wrapPort(port1);
        wrapPort(port2);
      }
    };
  }

  if (orig.BroadcastChannel) {
    global.BroadcastChannel = class PatchedBroadcastChannel extends orig.BroadcastChannel {
      constructor(...args) {
        super(...args);
        broadcastChannels += 1;
        this.__talariaCensusOpen = true;
      }

      close(...args) {
        if (this.__talariaCensusOpen) {
          this.__talariaCensusOpen = false;
          broadcastChannels -= 1;
        }
        return super.close(...args);
      }
    };
  }

  /** @returns {CensusSnapshot} */
  function snapshot() {
    return {
      timeouts: activeTimeouts.size,
      intervals: activeIntervals.size,
      animationFrames: activeRaf.size,
      listeners: listenerNet,
      messageChannelPorts,
      broadcastChannels,
    };
  }

  /**
   * @param {CensusSnapshot} baseline
   * @param {CensusSnapshot} current
   */
  function diff(baseline, current) {
    const keys = /** @type {(keyof CensusSnapshot)[]} */ ([
      'timeouts',
      'intervals',
      'animationFrames',
      'listeners',
      'messageChannelPorts',
      'broadcastChannels',
    ]);
    /** @type {Record<string, number>} */
    const deltas = {};
    for (const key of keys) {
      deltas[key] = (current[key] ?? 0) - (baseline[key] ?? 0);
    }
    return deltas;
  }

  function uninstall() {
    if (orig.setTimeout) global.setTimeout = orig.setTimeout;
    if (orig.clearTimeout) global.clearTimeout = orig.clearTimeout;
    if (orig.setInterval) global.setInterval = orig.setInterval;
    if (orig.clearInterval) global.clearInterval = orig.clearInterval;
    if (orig.requestAnimationFrame) global.requestAnimationFrame = orig.requestAnimationFrame;
    if (orig.cancelAnimationFrame) global.cancelAnimationFrame = orig.cancelAnimationFrame;
    if (origAdd) EventTarget.prototype.addEventListener = origAdd;
    if (origRemove) EventTarget.prototype.removeEventListener = origRemove;
    if (orig.MessageChannel) global.MessageChannel = orig.MessageChannel;
    if (orig.BroadcastChannel) global.BroadcastChannel = orig.BroadcastChannel;
  }

  return { snapshot, diff, uninstall };
}

/**
 * @param {{
 *   before: CensusSnapshot,
 *   afterTeardown: CensusSnapshot,
 *   afterSettle: CensusSnapshot,
 * }} phases
 * @param {{ tolerances?: Partial<CensusSnapshot> }} [options]
 */
export function assertReturnedToBaseline(phases, options = {}) {
  const tolerances = options.tolerances ?? {};
  const keys = /** @type {(keyof CensusSnapshot)[]} */ ([
    'timeouts',
    'intervals',
    'animationFrames',
    'listeners',
    'messageChannelPorts',
    'broadcastChannels',
  ]);

  /** @type {Record<string, number>} */
  const teardownDeltas = {};
  /** @type {Record<string, number>} */
  const settleDeltas = {};
  const violations = [];

  for (const key of keys) {
    const tol = tolerances[key] ?? 0;
    const td = (phases.afterTeardown[key] ?? 0) - (phases.before[key] ?? 0);
    const sd = (phases.afterSettle[key] ?? 0) - (phases.before[key] ?? 0);
    teardownDeltas[key] = td;
    settleDeltas[key] = sd;
    if (Math.abs(td) > tol) {
      violations.push(`teardown:${key}:delta=${td}:tolerance=${tol}`);
    }
    if (Math.abs(sd) > tol) {
      violations.push(`settle:${key}:delta=${sd}:tolerance=${tol}`);
    }
  }

  const status = violations.length === 0 ? 'GREEN' : 'RED';
  return {
    status,
    signature: TEARDOWN_CENSUS_PROBE_SIGNATURE,
    ok: status === 'GREEN',
    teardownDeltas,
    settleDeltas,
    violations,
  };
}

/**
 * @param {object} global
 * @returns {{
 *   render: () => void,
 *   commitData: () => void,
 *   read: () => { renderCount: number, commitCount: number },
 *   reset: () => void,
 * }}
 */
export function installRenderCounter(global) {
  const bucket = { renderCount: 0, commitCount: 0 };
  global.__talariaRestRenderCounter = bucket;
  return {
    render() {
      bucket.renderCount += 1;
    },
    commitData() {
      bucket.commitCount += 1;
    },
    read() {
      return { renderCount: bucket.renderCount, commitCount: bucket.commitCount };
    },
    reset() {
      bucket.renderCount = 0;
      bucket.commitCount = 0;
    },
  };
}

/**
 * @param {CensusSnapshot} snapshot
 * @param {{
 *   allowlist?: typeof HERMETIC_REST_PINNED_ALLOWLIST,
 *   extraKeys?: (keyof CensusSnapshot)[],
 *   extraLimits?: Partial<CensusSnapshot>,
 * }} [options]
 */
export function assertAtRest(snapshot, options = {}) {
  const allowlist = options.allowlist ?? HERMETIC_REST_PINNED_ALLOWLIST;
  const violations = [];

  for (const key of REST_SCHEDULED_CENSUS_KEYS) {
    const observed = snapshot[key] ?? 0;
    const limit = allowlist.limits[key];
    const declared = allowlist.declaredScheduled?.[key] ?? 0;
    if (observed > limit) {
      violations.push(`rest:${key}:observed=${observed}:limit=${limit}:allowlist=${allowlist.name}`);
    }
    if (observed > declared && observed > 0) {
      violations.push(
        `rest-undeclared:${key}:observed=${observed}:declared=${declared}:allowlist=${allowlist.name}`,
      );
    }
  }

  const extraKeys = options.extraKeys ?? ['listeners', 'messageChannelPorts', 'broadcastChannels'];
  for (const key of extraKeys) {
    const observed = snapshot[key] ?? 0;
    const limit = options.extraLimits?.[key] ?? 0;
    if (observed > limit) {
      violations.push(`rest:${key}:observed=${observed}:limit=${limit}`);
    }
  }

  const status = violations.length === 0 ? 'GREEN' : 'RED';
  return {
    status,
    signature: REST_STATE_CENSUS_PROBE_SIGNATURE,
    ok: status === 'GREEN',
    allowlist: allowlist.name,
    violations,
    snapshot,
  };
}

/**
 * @param {{
 *   rendersBefore: number,
 *   rendersAfter: number,
 *   commitsBefore: number,
 *   commitsAfter: number,
 * }} window
 */
export function assertNoRenderWithoutDataChange(window) {
  const commitDelta = window.commitsAfter - window.commitsBefore;
  const renderDelta = window.rendersAfter - window.rendersBefore;
  const violations = [];
  if (commitDelta === 0 && renderDelta > 0) {
    violations.push(`idle-render:renderDelta=${renderDelta}:commitDelta=${commitDelta}`);
  }
  const status = violations.length === 0 ? 'GREEN' : 'RED';
  return {
    status,
    signature: REST_STATE_CENSUS_PROBE_SIGNATURE,
    ok: status === 'GREEN',
    commitDelta,
    renderDelta,
    violations,
  };
}

/**
 * Count scheduled callback invocations during rest observe (install after installCensus).
 * @param {object} global
 */
export function installIdleObserveProbe(global) {
  let rafTicks = 0;
  let intervalCallbacks = 0;

  const origRaf = global.requestAnimationFrame?.bind(global);
  const origSetInterval = global.setInterval?.bind(global);

  if (origRaf) {
    global.requestAnimationFrame = (cb) =>
      origRaf((ts) => {
        rafTicks += 1;
        return cb(ts);
      });
  }

  if (origSetInterval) {
    global.setInterval = (fn, delay, ...rest) => {
      const wrapped = (...args) => {
        intervalCallbacks += 1;
        return fn(...args);
      };
      return origSetInterval(wrapped, delay, ...rest);
    };
  }

  let longTasks = 0;
  /** @type {PerformanceObserver | null} */
  let longTaskObserver = null;
  if (typeof global.PerformanceObserver !== 'undefined') {
    try {
      longTaskObserver = new global.PerformanceObserver((list) => {
        longTasks += list.getEntries().length;
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
    } catch {
      longTaskObserver = null;
    }
  }

  /** @returns {{ rafTicks: number, intervalCallbacks: number, longTasks: number }} */
  function read() {
    return { rafTicks, intervalCallbacks, longTasks };
  }

  function uninstall() {
    if (origRaf) global.requestAnimationFrame = origRaf;
    if (origSetInterval) global.setInterval = origSetInterval;
    longTaskObserver?.disconnect();
  }

  return { read, uninstall };
}

/**
 * @param {{
 *   commitsBefore: number,
 *   commitsAfter: number,
 *   rafTicksBefore: number,
 *   rafTicksAfter: number,
 *   intervalCallbacksBefore?: number,
 *   intervalCallbacksAfter?: number,
 *   longTasksBefore?: number,
 *   longTasksAfter?: number,
 *   budgets?: {
 *     rafTicksMax?: number,
 *     intervalCallbacksMax?: number,
 *     longTasksMax?: number,
 *   },
 * }} window
 */
export function assertIdleMainThreadBudget(window) {
  const commitDelta = window.commitsAfter - window.commitsBefore;
  const rafTickDelta = window.rafTicksAfter - window.rafTicksBefore;
  const intervalCbDelta =
    (window.intervalCallbacksAfter ?? 0) - (window.intervalCallbacksBefore ?? 0);
  const longTaskDelta = (window.longTasksAfter ?? 0) - (window.longTasksBefore ?? 0);

  const rafTicksMax = window.budgets?.rafTicksMax ?? REST_IDLE_RAF_TICKS_MAX;
  const intervalCallbacksMax =
    window.budgets?.intervalCallbacksMax ?? REST_IDLE_INTERVAL_CALLBACKS_MAX;
  const longTasksMax = window.budgets?.longTasksMax ?? REST_IDLE_LONGTASK_MAX;

  const violations = [];
  if (commitDelta === 0) {
    if (rafTickDelta > rafTicksMax) {
      violations.push(
        `idle-raf-ticks:delta=${rafTickDelta}:max=${rafTicksMax}:commitDelta=${commitDelta}`,
      );
    }
    if (intervalCbDelta > intervalCallbacksMax) {
      violations.push(
        `idle-interval-callbacks:delta=${intervalCbDelta}:max=${intervalCallbacksMax}:commitDelta=${commitDelta}`,
      );
    }
    if (longTaskDelta > longTasksMax) {
      violations.push(
        `idle-longtask:delta=${longTaskDelta}:max=${longTasksMax}:commitDelta=${commitDelta}`,
      );
    }
  }

  const status = violations.length === 0 ? 'GREEN' : 'RED';
  return {
    status,
    signature: REST_STATE_CENSUS_PROBE_SIGNATURE,
    ok: status === 'GREEN',
    commitDelta,
    rafTickDelta,
    intervalCbDelta,
    longTaskDelta,
    budgets: {
      rafTicksMax,
      intervalCallbacksMax,
      longTasksMax,
    },
    violations,
  };
}
