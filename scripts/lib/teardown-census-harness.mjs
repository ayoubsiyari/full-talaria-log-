/**
 * Hermetic multichart teardown sim for TEARDOWN-CENSUS-GATE-V1.
 * Does not load product chart.js / multichart-manager.js — follow-up wiring hang point.
 */

import { installCensus, assertReturnedToBaseline } from './teardown-census-probe.mjs';

/**
 * Build an isolated host object backed by real Node timers (for hermetic gate tests).
 */
export function createHermeticHost() {
  const host = Object.assign(new EventTarget(), {
    window: null,
    document: null,
    Element: typeof Element !== 'undefined' ? Element : class Element {},
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    requestAnimationFrame(cb) {
      return globalThis.setTimeout(() => cb(Date.now()), 16);
    },
    cancelAnimationFrame(handle) {
      return globalThis.clearTimeout(handle);
    },
    MessageChannel: globalThis.MessageChannel,
    BroadcastChannel: globalThis.BroadcastChannel,
    EventTarget: globalThis.EventTarget,
  });
  host.window = host;
  host.document = host;
  return host;
}

/**
 * @typedef {{
 *   orphanInterval?: boolean,
 *   orphanListener?: boolean,
 *   orphanRaf?: boolean,
 *   orphanChannel?: boolean,
 * }} TeardownMutationFlags
 */

/**
 * Schedule representative multichart-like resources.
 * @param {ReturnType<typeof installCensus>} census
 * @param {object} global
 * @returns {{ handles: object, teardown: (flags?: TeardownMutationFlags) => void }}
 */
export function openMultichartSim(census, global) {
  let rafLoopId = null;
  let rafActive = true;
  const rafLoop = () => {
    if (!rafActive) return;
    rafLoopId = global.requestAnimationFrame(rafLoop);
  };
  rafLoopId = global.requestAnimationFrame(rafLoop);

  const handles = {
    interval: global.setInterval(() => {}, 1000),
    timeout: global.setTimeout(() => {}, 5000),
    get raf() {
      return rafLoopId;
    },
    stopRaf() {
      rafActive = false;
      if (rafLoopId != null) global.cancelAnimationFrame(rafLoopId);
    },
    listener: () => {},
    channel: null,
    bc: null,
  };

  global.window.addEventListener('resize', handles.listener);
  global.document.addEventListener('visibilitychange', handles.listener);

  if (global.MessageChannel) {
    handles.channel = new global.MessageChannel();
    handles.channel.port1.start?.();
    handles.channel.port2.start?.();
  }
  if (global.BroadcastChannel) {
    handles.bc = new global.BroadcastChannel('talaria-teardown-census-sim');
  }

  void census;

  function teardown(flags = {}) {
    if (!flags.orphanInterval) global.clearInterval(handles.interval);
    if (!flags.orphanListener) {
      global.window.removeEventListener('resize', handles.listener);
      global.document.removeEventListener('visibilitychange', handles.listener);
    }
    global.clearTimeout(handles.timeout);
    if (!flags.orphanRaf) handles.stopRaf();
    if (handles.channel) {
      if (!flags.orphanChannel) {
        handles.channel.port1.close?.();
        handles.channel.port2.close?.();
      }
    }
    if (handles.bc) handles.bc.close();
  }

  function forceCleanup() {
    handles.stopRaf();
    teardown({});
    if (handles.channel) {
      handles.channel.port1.close?.();
      handles.channel.port2.close?.();
    }
  }

  return { handles, teardown, forceCleanup };
}

/**
 * @param {number} settleMs
 */
export function waitSettle(settleMs) {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, settleMs);
  });
}

/**
 * @param {TeardownMutationFlags} [mutationFlags]
 * @param {{ settleMs?: number }} [options]
 */
export async function runHermeticTeardownCycle(mutationFlags = {}, options = {}) {
  const settleMs = options.settleMs ?? 50;
  const host = createHermeticHost();
  const census = installCensus(host);
  let sim;
  try {
    const before = census.snapshot();
    sim = openMultichartSim(census, host);
    sim.teardown(mutationFlags);
    const afterTeardown = census.snapshot();
    await waitSettle(settleMs);
    const afterSettle = census.snapshot();
    const verdict = assertReturnedToBaseline({ before, afterTeardown, afterSettle });
    return { ...verdict, phases: { before, afterTeardown, afterSettle }, mutationFlags };
  } finally {
    sim?.forceCleanup?.();
    census.uninstall();
  }
}

export { installCensus, assertReturnedToBaseline };
