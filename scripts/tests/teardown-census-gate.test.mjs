import assert from 'node:assert/strict';
import test from 'node:test';

import { findLocalChromiumBrowser } from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import {
  TEARDOWN_CENSUS_PROBE_SIGNATURE,
  assertReturnedToBaseline,
  installCensus,
} from '../lib/teardown-census-probe.mjs';
import {
  createHermeticHost,
  openMultichartSim,
  runHermeticTeardownCycle,
} from '../lib/teardown-census-harness.mjs';
import {
  REAL_SETTLE_SOAK_MS,
  TALARIA_TEARDOWN_CENSUS_V1,
  runHermeticTeardownCensusGate,
  runTeardownCensusBrowserRunner,
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
