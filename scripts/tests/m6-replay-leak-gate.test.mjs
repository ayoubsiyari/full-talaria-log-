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
    installedWindows: 1,
    windowCount: 1,
    errorCount: 0,
    errors: [],
    totalResidue: 0,
    ...overrides,
  };
}

function withScheduler(snapshot, totals = schedulerTotals()) {
  return {
    ...snapshot,
    schedulingCensus: {
      rows: [],
      totals,
    },
  };
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
  const greenFinal = withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 });
  const redFinal = withScheduler(
    { liveReplaySystems: 6, connectedIframes: 0, detachedTrackedIframes: 5 },
    schedulerTotals({ pendingIntervals: 3, totalResidue: 3 }),
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
  win.clearInterval(interval);
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
    schedulerTotals({ pendingIntervals: 4, totalResidue: 4 }),
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
  const final = withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 });
  const cells = assertM6ReplayLeakCounts({
    baseline,
    final,
    workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
  });

  assert.equal(cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-INSTRUMENTED').pass, false);
  assert.equal(cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE').pass, false);
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
          schedulerTotals({ eventListeners: 1, totalResidue: 1 }),
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
        final: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
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
        final: withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
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
          schedulerTotals({ pendingIntervals: 4, totalResidue: 4 }),
        ),
      },
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'RED');
  assert.match(preflight.error, /soundSchedulerRed=true/);
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
                schedulerTotals({ pendingIntervals: 3, totalResidue: 3 }),
              )
              : schedulerOrphan
                ? withScheduler(
                  { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
                  schedulerTotals({ pendingIntervals: 1, totalResidue: 1 }),
                )
                : withScheduler({ liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 }),
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
