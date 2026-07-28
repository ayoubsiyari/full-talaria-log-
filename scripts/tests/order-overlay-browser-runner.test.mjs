import assert from 'node:assert/strict';
import test from 'node:test';

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

function cloneReport(overrides = {}) {
  return { ...validReport, ...overrides };
}

test('exports A15 browser runner signature', () => {
  assert.equal(TALARIA_ORDER_OVERLAY_BROWSER_V1, 'TALARIA_ORDER_OVERLAY_BROWSER_V1');
  assert.equal(NOT_BEHAVIOUR_COVERING, 'NOT-BEHAVIOUR-COVERING');
});

test('report schema validates required A15.4 smoke fields', () => {
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

test('missing browser fails closed red', async () => {
  const result = await runOrderOverlayBrowserRunner({
    findBrowser: () => null,
  });

  assert.equal(result.ok, false);
  assert.equal(result.signature, TALARIA_ORDER_OVERLAY_BROWSER_V1);
  assert.equal(result.status, NOT_BEHAVIOUR_COVERING);
  assert.match(result.error, /no Chromium-based browser found/i);
});

test('stubbed browser plus structured report succeeds', async () => {
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

test('timeout without report fails', async () => {
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

test('invalid report shape fails closed', async () => {
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

test('three consecutive stubbed green instrument runs are stable', async () => {
  const runs = [];
  for (let index = 0; index < 3; index += 1) {
    runs.push(await runOrderOverlayBrowserRunner({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => ({
        report: cloneReport(),
        timedOut: false,
        stderrTail: '',
      }),
    }));
  }

  assert.deepEqual(runs.map((run) => run.ok), [true, true, true]);
  assert.equal(new Set(runs.map((run) => JSON.stringify(run.report))).size, 1);
});
