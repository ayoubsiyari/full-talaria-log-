import assert from 'node:assert/strict';
import test from 'node:test';

import {
  HIDDEN_TAB_REPLAY_SIGNATURE,
  HIDDEN_TAB_REPLAY_STATUS_SKIP,
  assertHiddenTabReplayCells,
  forceDocumentHidden,
  playheadAdvanced,
  runHiddenTabReplayGate,
  runHiddenTabReplayPreflight,
} from '../hidden-tab-replay-gate.mjs';
import { findLocalChromiumBrowser } from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';

test('unit: forceDocumentHidden sets hidden + visibilityState', () => {
  const listeners = [];
  const doc = {
    hidden: false,
    visibilityState: 'visible',
    addEventListener() {},
    dispatchEvent(ev) { listeners.push(ev.type); return true; },
  };
  const state = forceDocumentHidden(doc, true);
  assert.equal(state.hidden, true);
  assert.equal(doc.hidden, true);
  assert.equal(doc.visibilityState, 'hidden');
  assert.ok(listeners.includes('visibilitychange'));
});

test('unit: playheadAdvanced detects index and timestamp growth', () => {
  assert.equal(playheadAdvanced(
    { currentIndex: 10, replayTimestamp: 1000 },
    { currentIndex: 12, replayTimestamp: 1000 },
  ).advanced, true);
  assert.equal(playheadAdvanced(
    { currentIndex: 10, replayTimestamp: 1000 },
    { currentIndex: 10, replayTimestamp: 1000 },
  ).advanced, false);
});

test('unit: cells RED when playhead advances while hidden', () => {
  const cells = assertHiddenTabReplayCells({
    before: { isPlaying: true, currentIndex: 10, replayTimestamp: 1000 },
    after: { isPlaying: true, currentIndex: 14, replayTimestamp: 5000 },
    hiddenState: { hidden: true, visibilityState: 'hidden' },
  });
  assert.equal(cells.find((c) => c.name === 'HIDDEN-TAB-DOCUMENT-FORCED-HIDDEN').pass, true);
  assert.equal(cells.find((c) => c.name === 'HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE').pass, false);
});

test('unit: cells GREEN when playhead frozen while hidden', () => {
  const cells = assertHiddenTabReplayCells({
    before: { isPlaying: true, currentIndex: 10, replayTimestamp: 1000 },
    after: { isPlaying: false, currentIndex: 10, replayTimestamp: 1000 },
    hiddenState: { hidden: true, visibilityState: 'hidden' },
  });
  assert.equal(cells.find((c) => c.name === 'HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE').pass, true);
});

test('fault-injection: missing browser skips by default and fails when required', async () => {
  const skipped = await runHiddenTabReplayGate({ findBrowser: () => null });
  assert.equal(skipped.status, HIDDEN_TAB_REPLAY_STATUS_SKIP);
  assert.equal(skipped.ok, false);

  const required = await runHiddenTabReplayGate({ findBrowser: () => null, requireBrowser: true });
  assert.equal(required.status, 'RED');
});

test('fault-injection: preflight GATE-WRONG if product arm is GREEN while unfixed', async () => {
  const prev = process.env.TALARIA_HIDDEN_TAB_FIXED;
  delete process.env.TALARIA_HIDDEN_TAB_FIXED;
  try {
    const preflight = await runHiddenTabReplayPreflight({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => ({
        report: {
          ok: true,
          signature: HIDDEN_TAB_REPLAY_SIGNATURE,
          before: { isPlaying: true, currentIndex: 1, replayTimestamp: 1 },
          after: { isPlaying: true, currentIndex: 1, replayTimestamp: 1 },
          hiddenState: { hidden: true, visibilityState: 'hidden' },
        },
        timedOut: false,
      }),
    });
    assert.equal(preflight.ok, false);
    assert.match(preflight.error || '', /GATE-WRONG/);
  } finally {
    if (prev === undefined) delete process.env.TALARIA_HIDDEN_TAB_FIXED;
    else process.env.TALARIA_HIDDEN_TAB_FIXED = prev;
  }
});

test('fault-injection: preflight instruments when product RED-advance and shim GREEN', async () => {
  const prev = process.env.TALARIA_HIDDEN_TAB_FIXED;
  delete process.env.TALARIA_HIDDEN_TAB_FIXED;
  try {
    let calls = 0;
    const preflight = await runHiddenTabReplayPreflight({
      findBrowser: () => '/fixture/chrome',
      runBrowser: async () => {
        calls += 1;
        const shim = calls === 2;
        return {
          report: {
            ok: true,
            signature: HIDDEN_TAB_REPLAY_SIGNATURE,
            before: { isPlaying: true, currentIndex: 10, replayTimestamp: 1000 },
            after: shim
              ? { isPlaying: false, currentIndex: 10, replayTimestamp: 1000 }
              : { isPlaying: true, currentIndex: 18, replayTimestamp: 9000 },
            hiddenState: { hidden: true, visibilityState: 'hidden' },
          },
          timedOut: false,
        };
      },
    });
    assert.equal(preflight.ok, false);
    assert.equal(preflight.status, 'RED');
    assert.match(preflight.error || '', /defect reproduced/);
    assert.equal(preflight.product.status, 'RED');
    assert.equal(preflight.shim.ok, true);
  } finally {
    if (prev === undefined) delete process.env.TALARIA_HIDDEN_TAB_FIXED;
    else process.env.TALARIA_HIDDEN_TAB_FIXED = prev;
  }
});

test('reproduce: live browser must RED on today unfixed replay (else GATE-WRONG)', async (t) => {
  const browserPath = findLocalChromiumBrowser();
  if (!browserPath) {
    if (process.env.TALARIA_REQUIRE_REAL_BROWSER === '1') {
      assert.fail('TALARIA_REQUIRE_REAL_BROWSER=1 but no Edge/Chrome browser found');
    }
    t.skip('CI without local Edge/Chrome');
    return;
  }

  const prev = process.env.TALARIA_HIDDEN_TAB_FIXED;
  delete process.env.TALARIA_HIDDEN_TAB_FIXED;
  try {
    const preflight = await runHiddenTabReplayPreflight({
      requireBrowser: true,
      observeMs: 1800,
      timeoutMs: 90_000,
    });
    assert.equal(preflight.ok, false);
    if (preflight.error && /GATE-WRONG/.test(preflight.error)) {
      assert.fail(preflight.error);
    }
    assert.equal(preflight.status, 'RED', preflight.error || JSON.stringify(preflight, null, 2));
    assert.match(preflight.error || '', /defect reproduced/);
    const pauseCell = preflight.product.cells.find((c) => c.name === 'HIDDEN-TAB-REPLAY-MUST-NOT-ADVANCE');
    assert.equal(pauseCell.pass, false);
    assert.match(pauseCell.detail, /advanced=true/);
    assert.equal(preflight.shim.ok, true, JSON.stringify(preflight.shim, null, 2));
  } finally {
    if (prev === undefined) delete process.env.TALARIA_HIDDEN_TAB_FIXED;
    else process.env.TALARIA_HIDDEN_TAB_FIXED = prev;
  }
});
