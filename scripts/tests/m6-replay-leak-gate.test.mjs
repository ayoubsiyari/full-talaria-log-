import assert from 'node:assert/strict';
import test from 'node:test';

import {
  M6_REPLAY_LEAK_SIGNATURE,
  aggregateM6SchedulingCensus,
  applyM6ReplayTeardownReversal,
  assertM6ReplayLeakCounts,
  connectedIframeCount,
  countDetachedIframes,
  countLiveM20Q6ReplaySystems,
  installM6SchedulingCensus,
  summarizeM6SchedulingCensus,
} from '../lib/m6-replay-leak-probe.mjs';
import {
  M6_REPLAY_LEAK_STATUS_SKIP,
  runM6ReplayLeakGate,
  runM6ReplayLeakPreflight,
} from '../m6-replay-leak-gate.mjs';

function fakeDocument(iframes = []) {
  return {
    querySelectorAll(selector) {
      return selector === 'iframe' ? iframes : [];
    },
  };
}

function fakeWindow({ replayState = 'active', iframes = [], managerEntries = [] } = {}) {
  return {
    chart: { replaySystem: { _m20Q6LifecycleState: replayState } },
    document: fakeDocument(iframes),
    __harnessManager: { charts: new Map(managerEntries) },
  };
}

function schedulerTotals(overrides = {}) {
  return {
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
    installedAt: 10,
    installedWindows: 1,
    windowCount: 1,
    errorCount: 0,
    errors: [],
    totalResidue: 0,
    ...overrides,
  };
}

function withScheduler(snapshot, totals = schedulerTotals()) {
  const row = {
    label: 'A-harness',
    installed: Number(totals.installedWindows) > 0,
    installedAt: totals.installedAt,
    pendingTimeouts: totals.pendingTimeouts,
    pendingIntervals: totals.pendingIntervals,
    pendingRafs: totals.pendingRafs,
    eventListeners: totals.eventListeners,
    messageChannels: totals.messageChannels,
    broadcastChannels: totals.broadcastChannels,
    workers: totals.workers,
    timerCallbacks: totals.timerCallbacks,
    intervalCallbacks: totals.intervalCallbacks,
    rafCallbacks: totals.rafCallbacks,
    errors: totals.errors,
  };
  return {
    ...snapshot,
    schedulingCensus: {
      rows: [row],
      totals,
    },
  };
}

function withSchedulerRows(snapshot, rows) {
  return {
    ...snapshot,
    schedulingCensus: {
      rows,
      totals: aggregateM6SchedulingCensus(rows),
    },
  };
}

function observedTotals(overrides = {}) {
  return schedulerTotals({ timerCallbacks: 5, ...overrides });
}

test('unit: probe counts live Q6 replay systems and ignores destroyed', () => {
  const panelWindow = fakeWindow({ replayState: 'destroyed' });
  const frame = { contentWindow: panelWindow, isConnected: true };
  const win = fakeWindow({
    replayState: 'active',
    iframes: [frame],
    managerEntries: [['B', { frame }]],
  });

  assert.equal(countLiveM20Q6ReplaySystems(win), 1);
  assert.equal(connectedIframeCount(win), 1);
});

test('unit: detached iframe counter is based on tracked frame handles', () => {
  assert.equal(countDetachedIframes([{ isConnected: true }, { isConnected: false }, null]), 1);
  assert.equal(countDetachedIframes(null), 0);
});

test('unit: acceptance and mutant cells encode director-required verdicts', () => {
  const baseline = withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 });
  const greenFinal = withScheduler(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    observedTotals(),
  );
  const redFinal = withScheduler(
    { liveReplaySystems: 6, connectedIframes: 0, detachedTrackedIframes: 5 },
    observedTotals({ pendingIntervals: 3, totalResidue: 3 }),
  );
  const workload = { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 };

  assert.deepEqual(
    assertM6ReplayLeakCounts({ baseline, final: greenFinal, workload }).map((cell) => cell.pass),
    [true, true, true, true, true],
  );

  const mutantCells = assertM6ReplayLeakCounts({ baseline, final: redFinal, mutant: true, workload });
  assert.equal(mutantCells.find((cell) => cell.name === 'M6-REPLAY-LIVE-COUNT-RETURNS-TO-ONE').pass, false);
  assert.equal(mutantCells.find((cell) => cell.name === 'M6-DETACHED-IFRAME-COUNT-NOT-GROWN').pass, false);
  assert.equal(mutantCells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED').pass, true);
  assert.equal(mutantCells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE').pass, false);
  assert.equal(mutantCells.find((cell) => cell.name === 'NC-M6-TEARDOWN-REVERSAL').pass, true);
});

test('unit: scheduler census wraps observable scheduling residue', () => {
  const listeners = new Map();
  let nextHandle = 1;
  const win = {
    performance: { now: () => 10 },
    setTimeout(fn) { return nextHandle++; },
    clearTimeout() {},
    setInterval(fn) { return nextHandle++; },
    clearInterval() {},
    requestAnimationFrame(fn) { return nextHandle++; },
    cancelAnimationFrame() {},
    EventTarget: function EventTarget() {},
  };
  win.EventTarget.prototype.addEventListener = function addEventListener(type, listener) {
    listeners.set(type, listener);
  };
  win.EventTarget.prototype.removeEventListener = function removeEventListener(type) {
    listeners.delete(type);
  };

  installM6SchedulingCensus(win, 'fixture');
  const timeout = win.setTimeout(() => {}, 1);
  const interval = win.setInterval(() => {}, 1);
  const raf = win.requestAnimationFrame(() => {});
  win.EventTarget.prototype.addEventListener.call({}, 'message', () => {});
  win.clearTimeout(timeout);
  win.cancelAnimationFrame(raf);

  const summary = summarizeM6SchedulingCensus(win, 'fixture');
  assert.equal(summary.pendingTimeouts, 0);
  assert.equal(summary.pendingIntervals, 1);
  assert.equal(summary.pendingRafs, 0);
  assert.equal(summary.eventListeners, 1);
  assert.equal(aggregateM6SchedulingCensus([summary]).totalResidue, 2);
  assert.equal(summary.installedAt, 10);
  win.clearInterval(interval);
});

test('unit: scheduler census reports wrapper displacement at snapshot time', () => {
  const originalSetInterval = () => 2;
  const win = {
    performance: { now: () => 10 },
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval: originalSetInterval,
    clearInterval() {},
    requestAnimationFrame() { return 3; },
    cancelAnimationFrame() {},
    EventTarget: function EventTarget() {},
  };
  win.EventTarget.prototype.addEventListener = function addEventListener() {};
  win.EventTarget.prototype.removeEventListener = function removeEventListener() {};

  installM6SchedulingCensus(win, 'fixture');
  win.setInterval = originalSetInterval;
  const summary = summarizeM6SchedulingCensus(win, 'fixture');

  assert.match(summary.errors.join(','), /wrapper-displaced:setInterval/);
});

test('unit: scheduler census reports Worker, channel, and listener wrapper displacement at snapshot time', () => {
  function FakeMessageChannel() {
    this.port1 = { close() {} };
    this.port2 = { close() {} };
  }
  function FakeBroadcastChannel() {
    this.close = function close() {};
  }
  function FakeWorker() {
    this.terminate = function terminate() {};
  }
  const originalAddEventListener = function addEventListener() {};
  const win = {
    performance: { now: () => 10 },
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 2; },
    clearInterval() {},
    requestAnimationFrame() { return 3; },
    cancelAnimationFrame() {},
    EventTarget: function EventTarget() {},
    MessageChannel: FakeMessageChannel,
    BroadcastChannel: FakeBroadcastChannel,
    Worker: FakeWorker,
  };
  win.EventTarget.prototype.addEventListener = originalAddEventListener;
  win.EventTarget.prototype.removeEventListener = function removeEventListener() {};

  installM6SchedulingCensus(win, 'fixture');
  win.Worker = FakeWorker;
  win.MessageChannel = FakeMessageChannel;
  win.BroadcastChannel = FakeBroadcastChannel;
  win.EventTarget.prototype.addEventListener = originalAddEventListener;
  const summary = summarizeM6SchedulingCensus(win, 'fixture');
  const errors = summary.errors.join(',');

  assert.match(errors, /wrapper-displaced:Worker/);
  assert.match(errors, /wrapper-displaced:MessageChannel/);
  assert.match(errors, /wrapper-displaced:BroadcastChannel/);
  assert.match(errors, /wrapper-displaced:EventTarget\.prototype\.addEventListener/);
});

test('unit: scheduler census listeners are identity keyed', () => {
  const listeners = new Map();
  const win = {
    performance: { now: () => 10 },
    setTimeout() { return 1; },
    clearTimeout() {},
    setInterval() { return 2; },
    clearInterval() {},
    requestAnimationFrame() { return 3; },
    cancelAnimationFrame() {},
    EventTarget: function EventTarget() {},
  };
  win.EventTarget.prototype.addEventListener = function addEventListener(type, listener) {
    listeners.set(type, listener);
  };
  win.EventTarget.prototype.removeEventListener = function removeEventListener(type, listener) {
    if (listeners.get(type) === listener) listeners.delete(type);
  };
  const signal = new win.EventTarget();
  signal.aborted = false;
  const target = new win.EventTarget();
  const neverAdded = () => {};
  const onceListener = () => {};
  const signalledListener = () => {};

  installM6SchedulingCensus(win, 'fixture');
  target.removeEventListener('message', neverAdded);
  assert.equal(summarizeM6SchedulingCensus(win, 'fixture').eventListeners, 0);

  target.addEventListener('message', onceListener, { once: true });
  assert.equal(summarizeM6SchedulingCensus(win, 'fixture').eventListeners, 1);
  listeners.get('message')({ type: 'message' });
  assert.equal(summarizeM6SchedulingCensus(win, 'fixture').eventListeners, 0);

  target.addEventListener('message', signalledListener, { signal });
  assert.equal(summarizeM6SchedulingCensus(win, 'fixture').eventListeners, 1);
  listeners.get('abort')({ type: 'abort' });
  assert.equal(summarizeM6SchedulingCensus(win, 'fixture').eventListeners, 0);
});

test('fault-injection: orphan scheduler residue blocks acceptance even when Q6 live returns to one', () => {
  const baseline = withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 });
  const final = withScheduler(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    observedTotals({ pendingIntervals: 4, totalResidue: 4 }),
  );
  const cells = assertM6ReplayLeakCounts({
    baseline,
    final,
    workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
  });

  assert.equal(cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE').pass, false);
  assert.equal(cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE').metrics.soundChannelRed, true);
});

test('fault-injection: blind scheduler census fails closed separately', () => {
  const baseline = withScheduler(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    schedulerTotals({ installedWindows: 0, windowCount: 1 }),
  );
  const final = withScheduler(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    observedTotals(),
  );
  const cells = assertM6ReplayLeakCounts({
    baseline,
    final,
    workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
  });

  assert.equal(cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED').pass, false);
  assert.equal(cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE').pass, false);
});

test('fault-injection: all-zero scheduler census does not prove instrumentation', () => {
  const baseline = withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 });
  const final = withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 });
  const cells = assertM6ReplayLeakCounts({
    baseline,
    final,
    workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
  });

  const instrumented = cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED');
  assert.equal(instrumented.pass, false);
  assert.equal(instrumented.metrics.callbackObservation.pass, false);
});

test('fault-injection: scheduler census reset between baseline and final fails epoch continuity', () => {
  const baseline = withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 });
  const final = withScheduler(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    observedTotals({ installedAt: 20 }),
  );
  const cells = assertM6ReplayLeakCounts({
    baseline,
    final,
    workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
  });

  const instrumented = cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED');
  assert.equal(instrumented.pass, false);
  assert.match(instrumented.detail, /epoch-reset:A-harness/);
});

test('fault-injection: per-window callback observation is required for every stable installed window', () => {
  const baseline = withSchedulerRows(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    [
      { label: 'A-harness', installed: true, installedAt: 10, pendingTimeouts: 0, pendingIntervals: 0, pendingRafs: 0, eventListeners: 0, messageChannels: 0, broadcastChannels: 0, workers: 0, timerCallbacks: 0, intervalCallbacks: 0, rafCallbacks: 0, errors: [] },
      { label: 'panel-B', installed: true, installedAt: 11, pendingTimeouts: 0, pendingIntervals: 0, pendingRafs: 0, eventListeners: 0, messageChannels: 0, broadcastChannels: 0, workers: 0, timerCallbacks: 0, intervalCallbacks: 0, rafCallbacks: 0, errors: [] },
    ],
  );
  const final = withSchedulerRows(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    [
      { label: 'A-harness', installed: true, installedAt: 10, pendingTimeouts: 0, pendingIntervals: 0, pendingRafs: 0, eventListeners: 0, messageChannels: 0, broadcastChannels: 0, workers: 0, timerCallbacks: 5, intervalCallbacks: 0, rafCallbacks: 0, errors: [] },
      { label: 'panel-B', installed: true, installedAt: 11, pendingTimeouts: 0, pendingIntervals: 0, pendingRafs: 0, eventListeners: 0, messageChannels: 0, broadcastChannels: 0, workers: 0, timerCallbacks: 0, intervalCallbacks: 0, rafCallbacks: 0, errors: [] },
    ],
  );
  const cells = assertM6ReplayLeakCounts({
    baseline,
    final,
    workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
  });

  const instrumented = cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED');
  assert.equal(instrumented.pass, false);
  assert.match(instrumented.detail, /callback-unobserved:panel-B/);
});

test('fault-injection: auto-installed final windows are not counted as instrumented', () => {
  const baseline = withSchedulerRows(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    [
      { label: 'A-harness', installed: true, installedAt: 10, pendingTimeouts: 0, pendingIntervals: 0, pendingRafs: 0, eventListeners: 0, messageChannels: 0, broadcastChannels: 0, workers: 0, timerCallbacks: 0, intervalCallbacks: 0, rafCallbacks: 0, errors: [] },
    ],
  );
  const final = withSchedulerRows(
    { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
    [
      { label: 'A-harness', installed: true, installedAt: 10, pendingTimeouts: 0, pendingIntervals: 0, pendingRafs: 0, eventListeners: 0, messageChannels: 0, broadcastChannels: 0, workers: 0, timerCallbacks: 5, intervalCallbacks: 0, rafCallbacks: 0, errors: [] },
      { label: 'panel-B', installed: true, installedAt: 99, pendingTimeouts: 0, pendingIntervals: 0, pendingRafs: 0, eventListeners: 0, messageChannels: 0, broadcastChannels: 0, workers: 0, timerCallbacks: 0, intervalCallbacks: 0, rafCallbacks: 0, errors: [] },
    ],
  );
  const cells = assertM6ReplayLeakCounts({
    baseline,
    final,
    workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
  });

  const instrumented = cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED');
  assert.equal(instrumented.pass, false);
  assert.match(instrumented.detail, /callback-auto-installed:panel-B/);
});

test('fault-injection: listener-only drift is not a reproduced PO defect', async () => {
  const preflight = await runM6ReplayLeakPreflight({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: {
        ok: true,
        cycles: 5,
        workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
        baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
        final: withScheduler(
          { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
          observedTotals({ eventListeners: 1, totalResidue: 1 }),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'UNPROVEN');
  assert.match(preflight.error, /listener-only drift is not PO defect reproduced/);
});

test('fault-injection: small worker growth is RED but not reproduced PO defect credit', async () => {
  const preflight = await runM6ReplayLeakPreflight({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: {
        ok: true,
        cycles: 5,
        workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
        baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
        final: withScheduler(
          { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
          observedTotals({ workers: 1, totalResidue: 1 }),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'UNPROVEN');
  assert.equal(
    preflight.acceptance.cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE')?.metrics?.attributableDefectCredit,
    false,
  );
  assert.match(preflight.error, /worker-only growth delta 1 below attribution threshold 5/);
});

test('fault-injection: cycle-scale worker growth receives attributable defect credit', async () => {
  const preflight = await runM6ReplayLeakPreflight({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: {
        ok: true,
        cycles: 5,
        workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
        baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
        final: withScheduler(
          { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
          observedTotals({ workers: 5, totalResidue: 5 }),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });

  const schedulerCell = preflight.acceptance.cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE');
  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'RED');
  assert.equal(schedulerCell?.metrics?.attributableDefectCredit, true);
  assert.deepEqual(schedulerCell?.metrics?.attributableCreditChannels, ['workers']);
  assert.match(preflight.error, /attributableSchedulerRed=true/);
});

test('fault-injection: FIXED mode cannot mint GREEN on worker growth', async () => {
  const prev = process.env.TALARIA_M6_LEAK_FIXED;
  process.env.TALARIA_M6_LEAK_FIXED = '1';
  try {
    const preflight = await runM6ReplayLeakPreflight({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => ({
        report: {
          ok: true,
          cycles: 5,
          workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
          baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
          final: withScheduler(
            { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
            observedTotals({ workers: 1, totalResidue: 1 }),
          ),
        },
        timedOut: false,
        stderrTail: '',
      }),
    });

    assert.equal(preflight.ok, false);
    assert.equal(preflight.status, 'RED');
    assert.match(preflight.acceptance.error, /M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE/);
  } finally {
    if (prev === undefined) delete process.env.TALARIA_M6_LEAK_FIXED;
    else process.env.TALARIA_M6_LEAK_FIXED = prev;
  }
});

test('fault-injection: displaced Worker wrapper cannot mint FIXED GREEN', async () => {
  const prev = process.env.TALARIA_M6_LEAK_FIXED;
  process.env.TALARIA_M6_LEAK_FIXED = '1';
  try {
    const preflight = await runM6ReplayLeakPreflight({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => ({
        report: {
          ok: true,
          cycles: 5,
          workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
          baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
          final: withScheduler(
            { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
            observedTotals({ errorCount: 1, errors: ['A-harness:wrapper-displaced:Worker'] }),
          ),
        },
        timedOut: false,
        stderrTail: '',
      }),
    });

    assert.equal(preflight.ok, false);
    assert.equal(preflight.status, 'RED');
    assert.match(preflight.acceptance.error, /wrapper-displaced:Worker/);
  } finally {
    if (prev === undefined) delete process.env.TALARIA_M6_LEAK_FIXED;
    else process.env.TALARIA_M6_LEAK_FIXED = prev;
  }
});

test('fault-injection: displaced BroadcastChannel wrapper cannot mint FIXED GREEN', async () => {
  const prev = process.env.TALARIA_M6_LEAK_FIXED;
  process.env.TALARIA_M6_LEAK_FIXED = '1';
  try {
    const preflight = await runM6ReplayLeakPreflight({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => ({
        report: {
          ok: true,
          cycles: 5,
          workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
          baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
          final: withScheduler(
            { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
            observedTotals({ errorCount: 1, errors: ['A-harness:wrapper-displaced:BroadcastChannel'] }),
          ),
        },
        timedOut: false,
        stderrTail: '',
      }),
    });

    assert.equal(preflight.ok, false);
    assert.equal(preflight.status, 'RED');
    assert.match(preflight.acceptance.error, /wrapper-displaced:BroadcastChannel/);
  } finally {
    if (prev === undefined) delete process.env.TALARIA_M6_LEAK_FIXED;
    else process.env.TALARIA_M6_LEAK_FIXED = prev;
  }
});

test('unit: mutant string apply no-ops destroy drain and fails if target moves', () => {
  const source = `    function m20Q6DrainState(state, reason = 'destroy') {
        if (!state) {
            return { enabled: true, state: 'absent', reason, pending: 0, errors: [] };
        }
    }
class M20Q6ReplaySystem {
        destroy() {
            if (this.chart && typeof this.chart._b70ShadowDisposeIndicatorGeneration === 'function') {
                this.chart._b70ShadowDisposeIndicatorGeneration();
            }
            return m20Q6DrainState(m20Q6States.get(this), 'destroy');
        }
}`;
  const mutated = applyM6ReplayTeardownReversal(source);
  assert.match(mutated, /NC-M6-TEARDOWN-REVERSAL/);
  assert.match(mutated, /function m20Q6DrainState\(state, reason = 'destroy'\) \{\n        return \{ enabled: true, state: 'mutant-teardown-reversal'/);
  assert.doesNotMatch(mutated, /m20Q6DrainState\(m20Q6States\.get\(this\), 'destroy'\)/);
  assert.throws(() => applyM6ReplayTeardownReversal('class M20Q6ReplaySystem {}'), /target not found/);
});

test('fault-injection: missing browser skips by default and fails when required', async () => {
  const skipped = await runM6ReplayLeakGate({ findBrowser: () => null });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.status, M6_REPLAY_LEAK_STATUS_SKIP);

  const required = await runM6ReplayLeakGate({ findBrowser: () => null, requireBrowser: true });
  assert.equal(required.ok, false);
  assert.equal(required.status, 'RED');
});

test('fault-injection: injected browser report validates acceptance path', async () => {
  const result = await runM6ReplayLeakGate({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: {
        ok: true,
        cycles: 5,
        workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
        baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
        final: withScheduler(
          { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
          observedTotals(),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.signature, M6_REPLAY_LEAK_SIGNATURE);
  assert.equal(result.status, 'GREEN');
});

test('fault-injection: preflight UNPROVEN when PO workload stays live=1', async () => {
  const preflight = await runM6ReplayLeakPreflight({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: {
        ok: true,
        cycles: 5,
        workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
        baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
        final: withScheduler(
          { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
          observedTotals(),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'UNPROVEN');
});

test('fault-injection: preflight treats scheduler census RED as reproduced PO defect', async () => {
  const preflight = await runM6ReplayLeakPreflight({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: {
        ok: true,
        cycles: 5,
        workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
        baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
        final: withScheduler(
          { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
          observedTotals({ pendingIntervals: 4, totalResidue: 4 }),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'RED');
  assert.match(preflight.error, /attributableSchedulerRed=true/);
});

test('fault-injection: preflight treats live replay growth as reproduced PO defect with instrumented census', async () => {
  const preflight = await runM6ReplayLeakPreflight({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: {
        ok: true,
        cycles: 5,
        workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
        baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
        final: withScheduler(
          { liveReplaySystems: 6, connectedIframes: 0, detachedTrackedIframes: 5 },
          observedTotals(),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'RED');
  assert.match(preflight.error, /final live=6/);
});

test('fault-injection: FIXED mode does not mint GREEN on all-zero scheduler census', async () => {
  const prev = process.env.TALARIA_M6_LEAK_FIXED;
  process.env.TALARIA_M6_LEAK_FIXED = '1';
  try {
    let calls = 0;
    const preflight = await runM6ReplayLeakPreflight({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => {
        calls += 1;
        return {
          report: {
            ok: true,
            cycles: 5,
            workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
            baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
            final: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
          },
          timedOut: false,
          stderrTail: '',
        };
      },
    });

    assert.equal(preflight.ok, false);
    assert.equal(preflight.status, 'RED');
    assert.equal(calls, 1);
    assert.match(preflight.acceptance.error, /M6-SCHEDULER-CENSUS-INSTRUMENTED/);
  } finally {
    if (prev === undefined) delete process.env.TALARIA_M6_LEAK_FIXED;
    else process.env.TALARIA_M6_LEAK_FIXED = prev;
  }
});

test('fault-injection: preflight requires mutant to go red once FIXED=1', async () => {
  const prev = process.env.TALARIA_M6_LEAK_FIXED;
  process.env.TALARIA_M6_LEAK_FIXED = '1';
  try {
    let calls = 0;
    const preflight = await runM6ReplayLeakPreflight({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => {
        calls += 1;
        const mutant = calls === 2;
        const schedulerOrphan = calls === 3;
        return {
          report: {
            ok: true,
            cycles: 5,
            workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
            schedulerOrphan: schedulerOrphan ? { installed: true, reused: false } : null,
            baseline: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
            final: mutant
              ? withScheduler(
                { liveReplaySystems: 6, connectedIframes: 0, detachedTrackedIframes: 5 },
                observedTotals({ pendingIntervals: 3, totalResidue: 3 }),
              )
              : schedulerOrphan
                ? withScheduler(
                  { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
                  observedTotals({ pendingIntervals: 1, totalResidue: 1 }),
                )
                : withScheduler(
                  { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
                  observedTotals(),
                ),
          },
          timedOut: false,
          stderrTail: '',
        };
      },
    });

    assert.equal(preflight.ok, true);
    assert.equal(preflight.status, 'GREEN');
    assert.equal(preflight.mutant.status, 'RED');
    assert.equal(preflight.schedulerMutant.status, 'RED');
    assert.equal(preflight.schedulerMutant.cells.find((cell) => cell.name === 'NC-M6-SCHEDULER-ORPHAN-INTERVAL').pass, true);
  } finally {
    if (prev === undefined) delete process.env.TALARIA_M6_LEAK_FIXED;
    else process.env.TALARIA_M6_LEAK_FIXED = prev;
  }
});
