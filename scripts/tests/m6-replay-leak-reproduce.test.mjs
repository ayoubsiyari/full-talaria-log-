import assert from 'node:assert/strict';
import test from 'node:test';

import { findLocalChromiumBrowser } from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { runM6ReplayLeakPreflight } from '../m6-replay-leak-gate.mjs';

test('reproduce: PO workload must stay RED on unfixed product (not a pass if live=1)', async (t) => {
  const browserPath = findLocalChromiumBrowser();
  if (!browserPath) {
    if (process.env.TALARIA_REQUIRE_REAL_BROWSER === '1') {
      assert.fail('TALARIA_REQUIRE_REAL_BROWSER=1 but no Edge/Chrome browser found');
    }
    t.skip('CI without local Edge/Chrome: M6 PO-workload reproduce SKIP');
    return;
  }

  // R-W57 ACCEPT is not the acceptance instrument. Until the PO 4→17 defect
  // is reproduced here, live=1 is escalate — not GREEN ship credit.
  const result = await runM6ReplayLeakPreflight({ cycles: 3, timeoutMs: 240_000, requireBrowser: true });
  const acceptance = result.acceptance;
  assert.ok(acceptance, result.error || 'missing acceptance result');
  assert.equal(acceptance.meta.browserPath, browserPath);
  assert.ok(acceptance.report, result.error || 'missing report');
  assert.equal(acceptance.report.workload?.armed, true, JSON.stringify(acceptance.report.workload, null, 2));

  const finalLive = acceptance.report.final?.liveReplaySystems;
  const schedulerCell = acceptance.cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE');
  const soundSchedulerRed = schedulerCell && schedulerCell.pass === false && schedulerCell.metrics?.soundChannelRed === true;
  if (finalLive === 1 && !soundSchedulerRed) {
    assert.equal(result.status, 'UNPROVEN', result.error || JSON.stringify(acceptance.cells, null, 2));
    return;
  }

  assert.equal(result.status, 'RED', result.error || JSON.stringify(acceptance.cells, null, 2));
  assert.ok(
    soundSchedulerRed,
    `expected sound scheduler census RED, got live=${finalLive}, scheduler=${JSON.stringify(schedulerCell)}`,
  );
});
