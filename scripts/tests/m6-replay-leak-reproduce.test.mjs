import assert from 'node:assert/strict';
import test from 'node:test';

import { findLocalChromiumBrowser } from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import { runM6ReplayLeakGate } from '../m6-replay-leak-gate.mjs';

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
  const result = await runM6ReplayLeakGate({ cycles: 3, timeoutMs: 240_000, requireBrowser: true });
  assert.equal(result.meta.browserPath, browserPath);
  assert.ok(result.report, result.error || 'missing report');
  assert.equal(result.report.workload?.armed, true, JSON.stringify(result.report.workload, null, 2));

  const finalLive = result.report.final?.liveReplaySystems;
  const schedulerCell = result.cells.find((cell) => cell.name === 'M6-SCHEDULER-CENSUS-RETURNS-TO-BASELINE');
  const schedulerRed = schedulerCell && schedulerCell.pass === false;
  if (finalLive === 1 && !schedulerRed) {
    assert.fail(
      'ESCALATE-TO-DIRECTOR: PO workload (4 panels + indicators + order + live replay) still returned live=1. '
      + 'Scheduler census also returned to baseline. Leak condition unidentified — must not be recorded as a pass. '
      + JSON.stringify({
        status: result.status,
        baseline: result.report.baseline,
        finalImmediate: result.report.finalImmediate,
        final: result.report.final,
        schedulerSoakMs: result.report.schedulerSoakMs,
        cells: result.cells,
        cycleLive: (result.report.cycleSnapshots || []).map((s) => ({
          label: s.label,
          live: s.liveReplaySystems,
          detached: s.detachedTrackedIframes,
          schedulerTotal: s.schedulingCensus?.totals?.totalResidue,
        })),
      }, null, 2),
    );
  }

  assert.equal(result.status, 'RED', result.error || JSON.stringify(result.cells, null, 2));
  assert.ok(
    finalLive > 1 || schedulerRed,
    `expected final live > 1 or scheduler census RED, got live=${finalLive}, scheduler=${JSON.stringify(schedulerCell)}`,
  );
});
