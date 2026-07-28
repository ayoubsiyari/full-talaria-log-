export const M6_REPLAY_LEAK_SIGNATURE = 'TALARIA_M6_REPLAY_LEAK_V1';

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

export function countDetachedIframes(trackedIframes = []) {
  if (!Array.isArray(trackedIframes)) return 0;
  // Strong refs only. WeakRef would GC-hide detached panel documents and
  // turn M6-DETACHED-IFRAME-COUNT-NOT-GROWN into a soft pass.
  return trackedIframes.filter((frame) => frame && frame.isConnected === false).length;
}

export function assertM6ReplayLeakCounts({ baseline, final, mutant = false } = {}) {
  const cells = [
    {
      name: 'M6-REPLAY-LIVE-COUNT-RETURNS-TO-ONE',
      blocking: true,
      pass: final && final.liveReplaySystems === 1,
      detail: `baseline=${baseline?.liveReplaySystems}; final=${final?.liveReplaySystems}`,
    },
    {
      name: 'M6-DETACHED-IFRAME-COUNT-NOT-GROWN',
      blocking: true,
      // detachedTrackedIframes = strongly-tracked panels that are detached AND
      // still hold a live Q6 replay instance (not a WeakRef/GC soft metric).
      pass: !!baseline && !!final
        && final.connectedIframes === baseline.connectedIframes
        && final.detachedTrackedIframes <= baseline.detachedTrackedIframes,
      detail: `connected ${baseline?.connectedIframes}->${final?.connectedIframes}; detachedLive ${baseline?.detachedTrackedIframes}->${final?.detachedTrackedIframes}`,
    },
  ];

  if (mutant) {
    const acceptanceWentRed = cells.some((cell) => cell.pass === false);
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

