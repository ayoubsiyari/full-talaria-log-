import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_INDEX_PANEL_PATH_SIGNATURE,
  evaluateLegacyIndexPanelPath,
  runLegacyIndexPanelPathGate,
  runLegacyIndexPanelPathRedControls,
} from '../legacy-index-panel-path-gate.mjs';

test('legacy-index is the shell that reaches Chart canvas isPanel path', () => {
  const report = evaluateLegacyIndexPanelPath();
  assert.equal(report.signature, LEGACY_INDEX_PANEL_PATH_SIGNATURE);
  assert.equal(report.status, 'GREEN', JSON.stringify(report.failures, null, 2));
  assert.equal(report.authRequired, false);
  assert.equal(report.indexLinksLegacyShell, true);
  assert.equal(report.legacyAuthRedirectPresent, true);
  assert.equal(report.panelConstructorCall, true);
  assert.equal(report.explicitPanelFlag, true);
  assert.equal(report.constructorCanvasArgSetsPanel, true);
});

test('RED controls prove the legacy isPanel gate can fail', () => {
  const controls = runLegacyIndexPanelPathRedControls();
  assert.deepEqual(controls.map((c) => c.cell), [
    'RED-LEGACY-INDEX-LINK-REMOVED',
    'RED-LEGACY-PANEL-CONSTRUCTOR-REMOVED',
    'RED-CHART-CONSTRUCTOR-DOES-NOT-SET-ISPANEL',
  ]);
  for (const control of controls) {
    assert.equal(control.status, 'GREEN', `${control.cell}: ${JSON.stringify(control.report, null, 2)}`);
    assert.equal(control.reportStatus, 'RED');
  }
});

test('full legacy-index panel path gate is GREEN with RED controls proven', () => {
  const report = runLegacyIndexPanelPathGate();
  assert.equal(report.signature, LEGACY_INDEX_PANEL_PATH_SIGNATURE);
  assert.equal(report.status, 'GREEN', JSON.stringify(report, null, 2));
  assert.equal(report.green.status, 'GREEN');
  assert.equal(report.redControls.every((c) => c.status === 'GREEN'), true);
  assert.match(report.limitation, /Non-auth static control/);
});
