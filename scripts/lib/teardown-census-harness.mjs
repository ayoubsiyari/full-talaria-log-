/**
 * Hermetic multichart teardown sim for TEARDOWN-CENSUS-GATE-V1.
 * Does not load product chart.js / multichart-manager.js — follow-up wiring hang point.
 */

import {
  installCensus,
  assertReturnedToBaseline,
  installRenderCounter,
  assertAtRest,
  assertNoRenderWithoutDataChange,
  installIdleObserveProbe,
  assertIdleMainThreadBudget,
  HERMETIC_REST_PINNED_ALLOWLIST,
} from './teardown-census-probe.mjs';

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
 * @typedef {{
 *   restOrphanInterval?: boolean,
 *   idleRenderWithoutData?: boolean,
 *   idlePeriodicRafWithoutCommit?: boolean,
 * }} RestMutationFlags
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
 * Idle-at-rest sim: static listeners only unless mutation flags inject standing work.
 * @param {ReturnType<typeof installRenderCounter>} renderCounter
 * @param {object} global
 * @param {RestMutationFlags} [flags]
 * @returns {{ cleanup: () => void }}
 */
export function openIdleRestSim(renderCounter, global, flags = {}) {
  const handles = {
    listener: () => {},
    interval: null,
    idleRenderInterval: null,
    stopIdleRaf: null,
  };

  global.window.addEventListener('resize', handles.listener);
  global.document.addEventListener('visibilitychange', handles.listener);

  if (flags.restOrphanInterval) {
    handles.interval = global.setInterval(() => {}, 500);
  }

  if (flags.idleRenderWithoutData) {
    handles.idleRenderInterval = global.setInterval(() => {
      renderCounter.render();
    }, 16);
  }

  if (flags.idlePeriodicRafWithoutCommit) {
    let rafActive = true;
    const loop = () => {
      if (!rafActive) return;
      global.requestAnimationFrame(loop);
    };
    global.requestAnimationFrame(loop);
    handles.stopIdleRaf = () => {
      rafActive = false;
    };
  }

  function cleanup() {
    handles.stopIdleRaf?.();
    if (handles.interval != null) global.clearInterval(handles.interval);
    if (handles.idleRenderInterval != null) global.clearInterval(handles.idleRenderInterval);
    global.window.removeEventListener('resize', handles.listener);
    global.document.removeEventListener('visibilitychange', handles.listener);
  }

  return { cleanup };
}

/**
 * @param {RestMutationFlags} [mutationFlags]
 * @param {{ settleMs?: number, observeMs?: number, allowlist?: typeof HERMETIC_REST_PINNED_ALLOWLIST }} [options]
 */
export async function runHermeticRestStateCycle(mutationFlags = {}, options = {}) {
  const settleMs = options.settleMs ?? 50;
  const observeMs = options.observeMs ?? settleMs;
  const allowlist = options.allowlist ?? HERMETIC_REST_PINNED_ALLOWLIST;
  const host = createHermeticHost();
  const census = installCensus(host);
  const idleProbe = installIdleObserveProbe(host);
  const renderCounter = installRenderCounter(host);
  let sim;
  try {
    sim = openIdleRestSim(renderCounter, host, mutationFlags);
    await waitSettle(settleMs);
    const atRestSnapshot = census.snapshot();
    const atRestVerdict = assertAtRest(atRestSnapshot, {
      allowlist,
      extraLimits: { listeners: 2, messageChannelPorts: 0, broadcastChannels: 0 },
    });

    const beforeObserve = renderCounter.read();
    const beforeIdle = idleProbe.read();
    await waitSettle(observeMs);
    const afterObserve = renderCounter.read();
    const afterIdle = idleProbe.read();
    const renderVerdict = assertNoRenderWithoutDataChange({
      rendersBefore: beforeObserve.renderCount,
      rendersAfter: afterObserve.renderCount,
      commitsBefore: beforeObserve.commitCount,
      commitsAfter: afterObserve.commitCount,
    });
    const idleBudgetVerdict = assertIdleMainThreadBudget({
      commitsBefore: beforeObserve.commitCount,
      commitsAfter: afterObserve.commitCount,
      rafTicksBefore: beforeIdle.rafTicks,
      rafTicksAfter: afterIdle.rafTicks,
      intervalCallbacksBefore: beforeIdle.intervalCallbacks,
      intervalCallbacksAfter: afterIdle.intervalCallbacks,
      longTasksBefore: beforeIdle.longTasks,
      longTasksAfter: afterIdle.longTasks,
    });

    const status =
      atRestVerdict.status === 'GREEN' &&
      renderVerdict.status === 'GREEN' &&
      idleBudgetVerdict.status === 'GREEN'
        ? 'GREEN'
        : 'RED';
    const violations = [
      ...atRestVerdict.violations,
      ...renderVerdict.violations,
      ...idleBudgetVerdict.violations,
    ];

    return {
      status,
      ok: status === 'GREEN',
      atRestVerdict,
      renderVerdict,
      idleBudgetVerdict,
      violations,
      phases: { atRestSnapshot, beforeObserve, afterObserve, beforeIdle, afterIdle },
      mutationFlags,
      allowlist: allowlist.name,
    };
  } finally {
    sim?.cleanup?.();
    idleProbe.uninstall();
    census.uninstall();
  }
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

export {
  installCensus,
  assertReturnedToBaseline,
  installRenderCounter,
  assertAtRest,
  assertNoRenderWithoutDataChange,
  installIdleObserveProbe,
  assertIdleMainThreadBudget,
};
