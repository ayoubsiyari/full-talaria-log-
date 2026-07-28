import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CACHE_STAMP_BASELINE_RELATIVE,
  CACHE_STAMP_COHERENCE_GATE_NAME,
  TALARIA_CACHE_STAMP_COHERENCE_V1,
  buildBaselineFromTree,
  extractStampedModuleRefs,
  loadBaseline,
  runCacheStampCoherenceGate,
  runCrossShellStampCoherenceCell,
  runModuleContentStampBaselineCell,
  runNcStaleStampContentDriftCell,
  runShellBuildIdUniformCell,
  sha256Text,
} from '../lib/cache-stamp-coherence.mjs';

const root = path.resolve(import.meta.dirname, '../..');

test('signature and gate name are stable', () => {
  assert.equal(TALARIA_CACHE_STAMP_COHERENCE_V1, 'TALARIA_CACHE_STAMP_COHERENCE_V1');
  assert.equal(CACHE_STAMP_COHERENCE_GATE_NAME, 'CACHE-STAMP-COHERENCE-V1');
});

test('extractStampedModuleRefs normalizes /chart/modules and relative modules', () => {
  const refs = extractStampedModuleRefs(`
    <script src="/chart/modules/order-manager.js?v=20260727b80"></script>
    <script src="modules/order-manager.js?v=20260727b80"></script>
  `);
  assert.deepEqual(refs, [
    { modulePath: 'modules/order-manager.js', stamp: '20260727b80' },
    { modulePath: 'modules/order-manager.js', stamp: '20260727b80' },
  ]);
});

test('SHELL-BUILD-ID-UNIFORM [soundness VER-01]: all shells share one stamp family', () => {
  const cell = runShellBuildIdUniformCell(root);
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.equal(cell.buildId, '20260727b80');
});

test('CROSS-SHELL-MODULE-STAMP-COHERENCE [soundness VER-01]: shared modules agree', () => {
  const cell = runCrossShellStampCoherenceCell(root);
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.ok(cell.sharedModuleCount >= 1);
  assert.equal(cell.conflictCount, 0);
});

test('MODULE-CONTENT-STAMP-BASELINE [soundness VER-01]: sealed hashes match disk', () => {
  const baseline = loadBaseline(root);
  assert.ok(baseline?.modules?.['modules/order-manager.js']);
  const cell = runModuleContentStampBaselineCell(root, { baseline });
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.ok(cell.modulesChecked >= 1);
  assert.equal(cell.driftCount, 0);
});

test('NC-STALE-STAMP-CONTENT-DRIFT [wiring VER-01]: content change under sealed stamp goes RED', () => {
  const cell = runNcStaleStampContentDriftCell(root);
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  assert.equal(cell.detectorWentRed, true);
  assert.equal(cell.driftHit, true);
});

test('CROSS-SHELL conflict: dist b83 vs legacy b80 is RED', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-stamp-'));
  const write = (rel, body) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  };
  write('chart v 1.4/chart/dist-v9/index.html', `
    window.__TALARIA_CHART_BUILD_ID='20260727b83';
    <script src="/chart/modules/order-manager.js?v=20260727b83"></script>
  `);
  write('homepage/public/chart/dist-v9/index.html', `
    window.__TALARIA_CHART_BUILD_ID='20260727b83';
    <script src="/chart/modules/order-manager.js?v=20260727b83"></script>
  `);
  write('chart v 1.4/talaria-design/live/index.html', `
    window.__TALARIA_CHART_BUILD_ID='20260727b83';
    <script src="/chart/modules/order-manager.js?v=20260727b83"></script>
  `);
  write('chart v 1.4/chart/legacy-index.html', `
    window.__TALARIA_CHART_BUILD_ID='20260727b80';
    <script src="modules/order-manager.js?v=20260727b80"></script>
  `);
  write('chart v 1.4/chart/multichart-prod/chart-embed.html', `
    window.__TALARIA_CHART_BUILD_ID = p.get('v') || '20260727b80';
    <script src="/chart/modules/order-manager.js?v=20260727b80"></script>
  `);
  write('homepage/public/chart/multichart-prod/chart-embed.html', `
    window.__TALARIA_CHART_BUILD_ID = p.get('v') || '20260727b80';
    <script src="/chart/modules/order-manager.js?v=20260727b80"></script>
  `);
  write('chart v 1.4/chart/modules/order-manager.js', 'export default 1;\n');

  const cell = runCrossShellStampCoherenceCell(tmp);
  assert.equal(cell.status, 'RED');
  assert.ok(cell.conflicts.some((c) => c.modulePath === 'modules/order-manager.js'));
  assert.ok(cell.conflicts[0].stamps.includes('20260727b83'));
  assert.ok(cell.conflicts[0].stamps.includes('20260727b80'));
});

test('baseline detects order-manager edit without stamp bump', () => {
  const baseline = buildBaselineFromTree(root);
  const modulePath = 'modules/order-manager.js';
  const current = baseline.modules[modulePath];
  assert.ok(current);
  const edited = {
    ...baseline,
    modules: {
      ...baseline.modules,
      [modulePath]: {
        stamp: current.stamp,
        sha256: sha256Text(`stale-${current.sha256}`),
      },
    },
  };
  const cell = runModuleContentStampBaselineCell(root, { baseline: edited });
  assert.equal(cell.status, 'RED');
  assert.ok(cell.drifts.some((d) => d.modulePath === modulePath));
});

test('gate aggregate is GREEN on the sealed repo tree', () => {
  const report = runCacheStampCoherenceGate({ root });
  assert.equal(report.signature, TALARIA_CACHE_STAMP_COHERENCE_V1);
  assert.equal(report.status, 'GREEN', JSON.stringify(report.cells, null, 2));
  assert.equal(report.allPass, true);
  assert.ok(fs.existsSync(path.join(root, CACHE_STAMP_BASELINE_RELATIVE)));
});
