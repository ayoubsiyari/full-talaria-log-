import assert from 'node:assert/strict';
import test from 'node:test';

import { findLocalChromiumBrowser } from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import {
  TEARDOWN_CENSUS_PROBE_SIGNATURE,
  REST_STATE_CENSUS_PROBE_SIGNATURE,
  assertReturnedToBaseline,
  assertAtRest,
  assertNoRenderWithoutDataChange,
  installIdleObserveProbe,
  assertIdleMainThreadBudget,
  REST_IDLE_RAF_TICKS_MAX,
  REST_IDLE_LONGTASK_MAX,
  installCensus,
  installRenderCounter,
  HERMETIC_REST_PINNED_ALLOWLIST,
} from '../lib/teardown-census-probe.mjs';
import {
  createHermeticHost,
  openMultichartSim,
  openIdleRestSim,
  runHermeticTeardownCycle,
  runHermeticRestStateCycle,
} from '../lib/teardown-census-harness.mjs';
import {
  REAL_SETTLE_SOAK_MS,
  TALARIA_TEARDOWN_CENSUS_V1,
  TALARIA_REST_STATE_CENSUS_V1,
  runHermeticTeardownCensusGate,
  runHermeticRestStateCensusGate,
  runTeardownCensusBrowserRunner,
  runRestStateCensusBrowserRunner,
} from '../teardown-census-gate.mjs';

const CI_NO_BROWSER_SKIP =
  'CI without local Edge/Chrome: real browser acceptance UNPROVEN (not skip-green)';

function skipOrFailWhenNoRealBrowser(t) {
  const browserPath = findLocalChromiumBrowser();
  if (browserPath) return browserPath;
  if (process.env.TALARIA_REQUIRE_REAL_BROWSER === '1') {
    assert.fail(
      'TALARIA_REQUIRE_REAL_BROWSER=1 but no Chromium-based browser found (Edge/Chrome)',
    );
  }
  t.skip(CI_NO_BROWSER_SKIP);
  return null;
}

test('signature token is TALARIA_TEARDOWN_CENSUS_V1', () => {
  assert.equal(TALARIA_TEARDOWN_CENSUS_V1, 'TALARIA_TEARDOWN_CENSUS_V1');
  assert.equal(TEARDOWN_CENSUS_PROBE_SIGNATURE, TALARIA_TEARDOWN_CENSUS_V1);
});

test('rest signature token is TALARIA_REST_STATE_CENSUS_V1', () => {
  assert.equal(TALARIA_REST_STATE_CENSUS_V1, 'TALARIA_REST_STATE_CENSUS_V1');
  assert.equal(REST_STATE_CENSUS_PROBE_SIGNATURE, TALARIA_REST_STATE_CENSUS_V1);
});

test('probe: snapshot diff and assertReturnedToBaseline GREEN when matched', () => {
  const host = createHermeticHost();
  const census = installCensus(host);
  try {
    const before = census.snapshot();
    const sim = openMultichartSim(census, host);
    sim.teardown({});
    const afterTeardown = census.snapshot();
    const afterSettle = census.snapshot();
    const verdict = assertReturnedToBaseline({ before, afterTeardown, afterSettle });
    assert.equal(verdict.status, 'GREEN');
    assert.equal(verdict.ok, true);
    sim.forceCleanup();
  } finally {
    census.uninstall();
  }
});

test('HERMETIC-TEARDOWN-CYCLE: clean sim GREEN', async () => {
  const result = await runHermeticTeardownCycle({}, { settleMs: 20 });
  assert.equal(result.status, 'GREEN');
  assert.equal(result.ok, true);
});

test('NC-TEARDOWN-ORPHAN-INTERVAL: orphan interval RED', async () => {
  const result = await runHermeticTeardownCycle({ orphanInterval: true }, { settleMs: 20 });
  assert.equal(result.status, 'RED');
  assert.ok(result.violations.some((v) => v.includes('interval')));
});

test('NC-TEARDOWN-ORPHAN-LISTENER: orphan listener RED', async () => {
  const result = await runHermeticTeardownCycle({ orphanListener: true }, { settleMs: 20 });
  assert.equal(result.status, 'RED');
  assert.ok(result.violations.some((v) => v.includes('listeners')));
});

test('NC-TEARDOWN-ORPHAN-RAF: orphan rAF loop RED', async () => {
  const result = await runHermeticTeardownCycle({ orphanRaf: true }, { settleMs: 20 });
  assert.equal(result.status, 'RED');
  assert.ok(result.violations.some((v) => v.includes('animationFrames')));
});

test('NC-TEARDOWN-ORPHAN-CHANNEL: orphan MessageChannel ports RED', async (t) => {
  if (typeof MessageChannel === 'undefined') {
    t.skip('MessageChannel unavailable');
    return;
  }
  const result = await runHermeticTeardownCycle({ orphanChannel: true }, { settleMs: 20 });
  assert.equal(result.status, 'RED');
  assert.ok(result.violations.some((v) => v.includes('messageChannelPorts')));
});

test('gate: runHermeticTeardownCensusGate aggregates GREEN', async () => {
  const gate = await runHermeticTeardownCensusGate({ settleMs: 20 });
  assert.equal(gate.signature, TALARIA_TEARDOWN_CENSUS_V1);
  assert.equal(gate.status, 'GREEN');
  assert.equal(gate.ok, true);
  assert.match(gate.followUp, /multichart-manager/i);
});

test('REAL-SETTLE cell documents 60s browser soak constant', () => {
  assert.equal(REAL_SETTLE_SOAK_MS, 60_000);
});

test('fault-injection: missing browser returns UNPROVEN not GREEN', async () => {
  const result = await runTeardownCensusBrowserRunner({ findBrowser: () => null });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNPROVEN');
});

test('acceptance: real Chromium teardown census posts GREEN /report', async (t) => {
  const browserPath = skipOrFailWhenNoRealBrowser(t);
  if (!browserPath) return;

  const result = await runTeardownCensusBrowserRunner({ settleMs: 100, timeoutMs: 25_000 });
  assert.equal(result.ok, true, result.error || JSON.stringify(result));
  assert.equal(result.signature, TALARIA_TEARDOWN_CENSUS_V1);
  assert.equal(result.status, 'GREEN');
  assert.equal(result.report.cell, 'BROWSER-TEARDOWN-CYCLE');
  assert.equal(result.meta.browserPath, browserPath);
});

test('assertAtRest GREEN on zero scheduled work with pinned allowlist', () => {
  const host = createHermeticHost();
  const census = installCensus(host);
  try {
    const snap = { timeouts: 0, intervals: 0, animationFrames: 0, listeners: 2, messageChannelPorts: 0, broadcastChannels: 0 };
    const verdict = assertAtRest(snap, {
      allowlist: HERMETIC_REST_PINNED_ALLOWLIST,
      extraLimits: { listeners: 2 },
    });
    assert.equal(verdict.status, 'GREEN');
    void census;
  } finally {
    census.uninstall();
  }
});

test('REST-SCHEDULED-WORK-ZERO: idle hermetic sim GREEN', async () => {
  const result = await runHermeticRestStateCycle({}, { settleMs: 20, observeMs: 20 });
  assert.equal(result.status, 'GREEN');
  assert.equal(result.atRestVerdict.status, 'GREEN');
});

test('NC-REST-ORPHAN-INTERVAL: standing interval at rest RED', async () => {
  const result = await runHermeticRestStateCycle({ restOrphanInterval: true }, { settleMs: 20, observeMs: 20 });
  assert.equal(result.status, 'RED');
  assert.ok(result.violations.some((v) => v.includes('interval')));
});

test('NC-IDLE-RENDER-WITHOUT-DATA: idle timer render RED', async () => {
  const result = await runHermeticRestStateCycle(
    { idleRenderWithoutData: true },
    { settleMs: 20, observeMs: 30 },
  );
  assert.equal(result.status, 'RED');
  assert.ok(
    result.violations.some((v) => v.includes('idle-render') || v.includes('idle-interval-callbacks')),
  );
});

test('NC-IDLE-PERIODIC-RAF-WITHOUT-COMMIT: standing rAF cadence RED', async () => {
  const result = await runHermeticRestStateCycle(
    { idlePeriodicRafWithoutCommit: true },
    { settleMs: 20, observeMs: 40 },
  );
  assert.equal(result.status, 'RED');
  assert.ok(result.violations.some((v) => v.includes('idle-raf-ticks')));
});

test('REST-IDLE-MAIN-THREAD-BUDGET: pinned rAF tick max is zero', () => {
  assert.equal(REST_IDLE_RAF_TICKS_MAX, 0);
  assert.equal(REST_IDLE_LONGTASK_MAX, 0);
});

test('assertIdleMainThreadBudget GREEN when no rAF ticks without commits', () => {
  const verdict = assertIdleMainThreadBudget({
    commitsBefore: 0,
    commitsAfter: 0,
    rafTicksBefore: 0,
    rafTicksAfter: 0,
  });
  assert.equal(verdict.status, 'GREEN');
});

test('assertIdleMainThreadBudget RED on rAF cadence without commits', () => {
  const verdict = assertIdleMainThreadBudget({
    commitsBefore: 0,
    commitsAfter: 0,
    rafTicksBefore: 0,
    rafTicksAfter: 4,
  });
  assert.equal(verdict.status, 'RED');
  assert.ok(verdict.violations.some((v) => v.includes('idle-raf-ticks')));
});

test('REST-ALLOWLIST-PINNED: permissive limit cannot silence undeclared interval', () => {
  const snap = { timeouts: 0, intervals: 1, animationFrames: 0, listeners: 0, messageChannelPorts: 0, broadcastChannels: 0 };
  const verdict = assertAtRest(snap, {
    allowlist: {
      ...HERMETIC_REST_PINNED_ALLOWLIST,
      limits: { timeouts: 0, intervals: 1, animationFrames: 0 },
    },
  });
  assert.equal(verdict.status, 'RED');
  assert.ok(verdict.violations.some((v) => v.includes('rest-undeclared')));
});

test('assertNoRenderWithoutDataChange RED when renders increase without commits', () => {
  const verdict = assertNoRenderWithoutDataChange({
    rendersBefore: 0,
    rendersAfter: 3,
    commitsBefore: 0,
    commitsAfter: 0,
  });
  assert.equal(verdict.status, 'RED');
});

test('probe: idle rest sim render counter stable without commits', async () => {
  const host = createHermeticHost();
  const census = installCensus(host);
  const renderCounter = installRenderCounter(host);
  let sim;
  try {
    sim = openIdleRestSim(renderCounter, host);
    await new Promise((r) => setTimeout(r, 25));
    const before = renderCounter.read();
    await new Promise((r) => setTimeout(r, 25));
    const after = renderCounter.read();
    const verdict = assertNoRenderWithoutDataChange({
      rendersBefore: before.renderCount,
      rendersAfter: after.renderCount,
      commitsBefore: before.commitCount,
      commitsAfter: after.commitCount,
    });
    assert.equal(verdict.status, 'GREEN');
    void census;
  } finally {
    sim?.cleanup?.();
    census.uninstall();
  }
});

test('gate: runHermeticRestStateCensusGate aggregates GREEN', async () => {
  const gate = await runHermeticRestStateCensusGate({ settleMs: 20 });
  assert.equal(gate.signature, TALARIA_REST_STATE_CENSUS_V1);
  assert.equal(gate.status, 'GREEN');
  assert.equal(gate.ok, true);
  const cellNames = gate.cells.map((c) => c.cell);
  assert.ok(cellNames.includes('REST-SCHEDULED-WORK-ZERO'));
  assert.ok(cellNames.includes('REST-IDLE-MAIN-THREAD-BUDGET'));
  assert.ok(cellNames.includes('REST-ALLOWLIST-PINNED'));
  assert.ok(cellNames.includes('NC-REST-ORPHAN-INTERVAL'));
  assert.ok(cellNames.includes('NC-IDLE-RENDER-WITHOUT-DATA'));
  assert.ok(cellNames.includes('NC-IDLE-PERIODIC-RAF-WITHOUT-COMMIT'));
});

test('fault-injection: rest browser missing returns UNPROVEN not GREEN', async () => {
  const result = await runRestStateCensusBrowserRunner({ findBrowser: () => null });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'UNPROVEN');
});

test('acceptance: real Chromium rest-state census posts GREEN /report', async (t) => {
  const browserPath = skipOrFailWhenNoRealBrowser(t);
  if (!browserPath) return;

  const result = await runRestStateCensusBrowserRunner({ settleMs: 100, timeoutMs: 25_000 });
  assert.equal(result.ok, true, result.error || JSON.stringify(result));
  assert.equal(result.signature, TALARIA_REST_STATE_CENSUS_V1);
  assert.equal(result.status, 'GREEN');
  assert.equal(result.report.cell, 'BROWSER-REST-STATE-CYCLE');
  assert.equal(result.meta.browserPath, browserPath);
});
