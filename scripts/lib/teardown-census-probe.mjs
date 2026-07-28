/**
 * TEARDOWN-CENSUS-GATE-V1 probe — counts uncleared timers, listeners, rAF, channels.
 * Signature context: TALARIA_TEARDOWN_CENSUS_V1
 *
 * Product multichart wiring is a follow-up hang point; this instrument is behaviour-covering
 * on the hermetic sim and installable in browser fixtures.
 */

export const TEARDOWN_CENSUS_PROBE_SIGNATURE = 'TALARIA_TEARDOWN_CENSUS_V1';

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
