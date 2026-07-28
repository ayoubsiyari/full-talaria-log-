import assert from 'node:assert/strict';
import test from 'node:test';

import {
  M6_REPLAY_LEAK_SIGNATURE,
  applyM6ReplayTeardownReversal,
  assertM6ReplayLeakCounts,
  connectedIframeCount,
  countDetachedIframes,
  countLiveM20Q6ReplaySystems,
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
  const baseline = { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 };
  const greenFinal = { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 };
  const redFinal = { liveReplaySystems: 6, connectedIframes: 0, detachedTrackedIframes: 5 };
  const workload = { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 };

  assert.deepEqual(
    assertM6ReplayLeakCounts({ baseline, final: greenFinal, workload }).map((cell) => cell.pass),
    [true, true, true],
  );

  const mutantCells = assertM6ReplayLeakCounts({ baseline, final: redFinal, mutant: true, workload });
  assert.equal(mutantCells.find((cell) => cell.name === 'M6-REPLAY-LIVE-COUNT-RETURNS-TO-ONE').pass, false);
  assert.equal(mutantCells.find((cell) => cell.name === 'M6-DETACHED-IFRAME-COUNT-NOT-GROWN').pass, false);
  assert.equal(mutantCells.find((cell) => cell.name === 'NC-M6-TEARDOWN-REVERSAL').pass, true);
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
        baseline: { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
        final: { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
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
        baseline: { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
        final: { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
      },
      timedOut: false,
      stderrTail: '',
    }),
  });
  assert.equal(preflight.ok, false);
  assert.equal(preflight.status, 'UNPROVEN');
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
        return {
          report: {
            ok: true,
            cycles: 5,
            workload: { armed: true, panels: 4, indicatorsOk: true, order: { ok: true }, stillPlaying: 4 },
            baseline: { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
            final: mutant
              ? { liveReplaySystems: 6, connectedIframes: 0, detachedTrackedIframes: 5 }
              : { liveReplaySystems: 1, connectedIframes: 0, detachedTrackedIframes: 0 },
          },
          timedOut: false,
          stderrTail: '',
        };
      },
    });

    assert.equal(preflight.ok, true);
    assert.equal(preflight.status, 'GREEN');
    assert.equal(preflight.mutant.status, 'RED');
  } finally {
    if (prev === undefined) delete process.env.TALARIA_M6_LEAK_FIXED;
    else process.env.TALARIA_M6_LEAK_FIXED = prev;
  }
});
