import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  REPLAY_INTERVAL_CALLBACK_BUDGET_MS,
  assertReplayIntervalBudget,
  installReplayIntervalBudgetProbeSource,
  summarizeReplayIntervalBudget,
} from '../lib/replay-interval-budget.mjs';

test('unit: interval budget probe records violations over budget', async () => {
  const source = installReplayIntervalBudgetProbeSource({ budgetMs: 10 });
  const timers = [];
  const sandbox = {
    window: {},
    performance: { now: (() => {
      let t = 0;
      return () => { t += 1; return t; };
    })() },
    Date,
    Error,
    PerformanceObserver: class {
      observe() {}
    },
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  // Provide native timers on sandbox before eval.
  let handle = 0;
  const callbacks = new Map();
  sandbox.window.setInterval = (fn, delay) => {
    const id = ++handle;
    callbacks.set(id, { fn, delay });
    timers.push(id);
    return id;
  };
  sandbox.window.clearInterval = (id) => { callbacks.delete(id); };

  vm.runInNewContext(source, sandbox);
  // Probe replaced setInterval — invoke a slow callback.
  const slow = () => {
    // burn via performance.now increments inside wrapper finally
  };
  sandbox.window.setInterval(slow, 16);
  const wrappedEntry = [...callbacks.values()].pop();
  // Simulate slow callback: make performance.now jump
  let clock = 0;
  sandbox.performance.now = () => {
    clock += 40;
    return clock;
  };
  wrappedEntry.fn();
  const summary = summarizeReplayIntervalBudget(sandbox.window.__talariaReplayIntervalBudget, {
    budgetMs: 10,
  });
  assert.equal(summary.violationCount >= 1, true);
  assert.equal(summary.pass, false);
  const cells = assertReplayIntervalBudget(summary);
  assert.equal(cells.find((c) => c.name === 'REPLAY-INTERVAL-CALLBACK-WITHIN-BUDGET')?.pass, false);
});

test('unit: budget constant matches PO defect band', () => {
  assert.equal(REPLAY_INTERVAL_CALLBACK_BUDGET_MS, 50);
});
