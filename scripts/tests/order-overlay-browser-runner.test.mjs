import assert from 'node:assert/strict';
import test from 'node:test';

import { findLocalChromiumBrowser } from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import {
  NOT_BEHAVIOUR_COVERING,
  TALARIA_ORDER_OVERLAY_BROWSER_V1,
  runOrderOverlayBrowserRunner,
  validateOrderOverlayReport,
} from '../order-overlay-browser-runner.mjs';

const validReport = Object.freeze({
  stampObserved: TALARIA_ORDER_OVERLAY_BROWSER_V1,
  hostPainted: true,
  panelPainted: true,
  consoleErrors: [],
  preconditionLogSeen: true,
  preconditionLogLine: '[V6-P1] ignition',
  ignitionLogSeen: true,
  pinLifecycleSeen: false,
});

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

function cloneReport(overrides = {}) {
  return { ...validReport, ...overrides };
}

test('unit: exports A15 browser runner signature', () => {
  assert.equal(TALARIA_ORDER_OVERLAY_BROWSER_V1, 'TALARIA_ORDER_OVERLAY_BROWSER_V1');
  assert.equal(NOT_BEHAVIOUR_COVERING, 'NOT-BEHAVIOUR-COVERING');
});

test('unit: report schema validates required A15.4 smoke fields', () => {
  assert.deepEqual(validateOrderOverlayReport(cloneReport()), { ok: true, errors: [] });

  const invalid = validateOrderOverlayReport({
    stampObserved: 1,
    hostPainted: 'yes',
    panelPainted: true,
    consoleErrors: ['kept', 1],
    preconditionLogSeen: false,
    preconditionLogLine: undefined,
    ignitionLogSeen: 'no',
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /stampObserved/);
  assert.match(invalid.errors.join('\n'), /hostPainted/);
  assert.match(invalid.errors.join('\n'), /consoleErrors/);
  assert.match(invalid.errors.join('\n'), /preconditionLogLine/);
  assert.match(invalid.errors.join('\n'), /ignitionLogSeen/);
});

test('fault-injection: missing browser fails closed red', async () => {
  const result = await runOrderOverlayBrowserRunner({
    findBrowser: () => null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.signature, TALARIA_ORDER_OVERLAY_BROWSER_V1);
  assert.equal(result.status, NOT_BEHAVIOUR_COVERING);
  assert.match(result.error, /no Chromium-based browser found/i);
});

test('fault-injection: injected runBrowser returns valid report (runner wiring only)', async () => {
  const result = await runOrderOverlayBrowserRunner({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async ({ url }) => ({
      report: cloneReport({ preconditionLogLine: `[V6-P1] ignition from ${new URL(url).pathname}` }),
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.signature, TALARIA_ORDER_OVERLAY_BROWSER_V1);
  assert.equal(result.status, NOT_BEHAVIOUR_COVERING);
  assert.equal(result.notBehaviourCovering, true);
  assert.equal(result.report.hostPainted, true);
  assert.equal(result.report.panelPainted, true);
});

test('fault-injection: timeout without report fails', async () => {
  const result = await runOrderOverlayBrowserRunner({
    timeoutMs: 5,
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: null,
      timedOut: true,
      stderrTail: 'fixture timeout',
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /no valid \/report POST/);
});

test('fault-injection: invalid report shape fails closed', async () => {
  const result = await runOrderOverlayBrowserRunner({
    findBrowser: () => '/fixture/chrome',
    runBrowser: async () => ({
      report: cloneReport({ consoleErrors: 'none' }),
      timedOut: false,
      stderrTail: '',
    }),
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /invalid report shape/);
});

test('acceptance: real Chromium CLI posts valid A15.4 /report', async (t) => {
  const browserPath = skipOrFailWhenNoRealBrowser(t);
  if (!browserPath) return;

  const result = await runOrderOverlayBrowserRunner();

  assert.equal(result.ok, true, result.error || JSON.stringify(result));
  assert.equal(result.signature, TALARIA_ORDER_OVERLAY_BROWSER_V1);
  assert.equal(result.status, NOT_BEHAVIOUR_COVERING);
  assert.equal(result.notBehaviourCovering, true);
  assert.equal(result.meta.browserPath, browserPath);
  assert.match(result.meta.url, /\/host\.html\?autorun=1$/);
  assert.deepEqual(validateOrderOverlayReport(result.report), { ok: true, errors: [] });
  assert.equal(result.report.stampObserved, TALARIA_ORDER_OVERLAY_BROWSER_V1);
  assert.equal(result.report.hostPainted, true);
  assert.equal(result.report.panelPainted, true);
  assert.equal(result.report.preconditionLogSeen, true);
  assert.equal(result.report.preconditionLogLine, '[V6-P1] ignition');
  assert.equal(result.report.ignitionLogSeen, true);
  assert.deepEqual(result.report.consoleErrors, []);
});

test('acceptance: three consecutive real browser runs are stable', async (t) => {
  const browserPath = skipOrFailWhenNoRealBrowser(t);
  if (!browserPath) return;

  const runs = [];
  for (let index = 0; index < 3; index += 1) {
    runs.push(await runOrderOverlayBrowserRunner());
  }

  assert.deepEqual(
    runs.map((run) => run.ok),
    [true, true, true],
    runs.map((run) => run.error).filter(Boolean).join('; '),
  );
  assert.ok(runs.every((run) => run.meta.browserPath === browserPath));
  assert.equal(new Set(runs.map((run) => JSON.stringify(run.report))).size, 1);
});
