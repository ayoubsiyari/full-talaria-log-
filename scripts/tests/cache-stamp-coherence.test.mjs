import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CACHE_STAMP_BASELINE_RELATIVE,
  CACHE_STAMP_COHERENCE_GATE_NAME,
  CACHE_STAMP_SHELLS,
  CACHE_STAMP_SHELLS_WITHOUT_MULTICHART,
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

test('CACHE_STAMP_SHELLS covers /chart/multichart/ chart-host paths', () => {
  const paths = CACHE_STAMP_SHELLS.map((shell) => shell.relativePath.replace(/\\/g, '/'));
  assert.ok(paths.includes('chart v 1.4/chart/multichart/chart-host.html'));
  assert.ok(paths.includes('homepage/public/chart/multichart/chart-host.html'));
  assert.ok(paths.includes('chart v 1.4/chart/multichart/multichart-shell.html'));
  assert.ok(paths.includes('homepage/public/chart/multichart/multichart-shell.html'));
  assert.equal(CACHE_STAMP_SHELLS_WITHOUT_MULTICHART.length, CACHE_STAMP_SHELLS.length - 4);
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

test('GATE-01: SHELL-BUILD-ID-UNIFORM REDs fixture May stamp on /chart/multichart/chart-host.html', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-stamp-multichart-red-'));
  const write = (rel, body) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  };
  const current = `
    window.__TALARIA_CHART_BUILD_ID='20260727b80';
    <script src="/chart/modules/order-manager.js?v=20260727b80"></script>
  `;
  const stale = `
    <script src="./engine-api-guards.js?v=20260524a10"></script>
    <script src="./sync-bridge.js?v=20260524a10"></script>
  `;
  for (const shell of CACHE_STAMP_SHELLS_WITHOUT_MULTICHART) write(shell.relativePath, current);
  write('chart v 1.4/chart/multichart/chart-host.html', stale);
  write('homepage/public/chart/multichart/chart-host.html', stale);
  write('chart v 1.4/chart/multichart/multichart-shell.html', current);
  write('homepage/public/chart/multichart/multichart-shell.html', current);
  const cell = runShellBuildIdUniformCell(tmp);
  assert.equal(cell.status, 'RED', JSON.stringify(cell, null, 2));
  assert.ok(cell.allIds.includes('20260524a10'), JSON.stringify(cell.allIds));
  assert.ok(cell.allIds.includes('20260727b80'), JSON.stringify(cell.allIds));
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('coverage hole: excluding /chart/multichart/ wrongly GREENs stamp uniformity', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-stamp-multichart-hole-'));
  const write = (rel, body) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  };
  const current = `
    window.__TALARIA_CHART_BUILD_ID='20260727b80';
    <script src="/chart/modules/order-manager.js?v=20260727b80"></script>
  `;
  const stale = '<script src="./sync-bridge.js?v=20260524a10"></script>';
  for (const shell of CACHE_STAMP_SHELLS_WITHOUT_MULTICHART) write(shell.relativePath, current);
  write('chart v 1.4/chart/multichart/chart-host.html', stale);
  write('homepage/public/chart/multichart/chart-host.html', stale);
  write('chart v 1.4/chart/multichart/multichart-shell.html', stale);
  write('homepage/public/chart/multichart/multichart-shell.html', stale);
  const cell = runShellBuildIdUniformCell(tmp, CACHE_STAMP_SHELLS_WITHOUT_MULTICHART);
  assert.equal(cell.status, 'GREEN', JSON.stringify(cell, null, 2));
  // Build id moves with every ship bump; pin to the sealed baseline, not a literal.
  // D's side asserted the literal '20260727b80', which nineteen ships have since
  // invalidated; D's temp-dir cleanup on the next line is kept, because without it
  // every run of this cell leaks a tmp tree.
  const baseline = loadBaseline(root);
  const sealed = baseline?.modules?.['modules/order-manager.js']?.stamp;
  assert.equal(typeof cell.buildId, 'string');
  assert.match(cell.buildId, /^\d{8}[ab]\d+$/);
  assert.equal(cell.buildId, sealed);
  fs.rmSync(tmp, { recursive: true, force: true });
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

test('full cache-stamp gate reports a shell-build-id cell', () => {
  const report = runCacheStampCoherenceGate({ root });
  const uniform = report.cells.find((c) => c.cell === 'SHELL-BUILD-ID-UNIFORM');
  assert.ok(['GREEN', 'RED'].includes(uniform?.status));
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
  // Multichart panel shells are in CACHE_STAMP_SHELLS; fixtures must be readable.
  write('chart v 1.4/chart/multichart/chart-host.html', `
    <script src="./sync-bridge.js?v=20260727b80"></script>
  `);
  write('homepage/public/chart/multichart/chart-host.html', `
    <script src="./sync-bridge.js?v=20260727b80"></script>
  `);
  write('chart v 1.4/chart/multichart/multichart-shell.html', `
    <script src="multichart-manager.js?v=20260727b80"></script>
  `);
  write('homepage/public/chart/multichart/multichart-shell.html', `
    <script src="multichart-manager.js?v=20260727b80"></script>
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

test('R-W55: stamp bump without baseline re-seal is RED', () => {
  const baseline = buildBaselineFromTree(root);
  const modulePath = 'modules/order-manager.js';
  assert.ok(baseline.modules[modulePath]);
  const staleBaseline = {
    ...baseline,
    modules: Object.fromEntries(
      Object.entries(baseline.modules).map(([key, value]) => [
        key,
        { ...value, stamp: '20260727b80' },
      ]),
    ),
  };
  // Force observed shells to a newer stamp while baseline remains at b80.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-stamp-bump-'));
  const write = (rel, body) => {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, 'utf8');
  };
  const shellBody = (stamp) => `
    window.__TALARIA_CHART_BUILD_ID='${stamp}';
    <script src="/chart/modules/order-manager.js?v=${stamp}"></script>
  `;
  for (const shell of [
    'chart v 1.4/chart/dist-v9/index.html',
    'homepage/public/chart/dist-v9/index.html',
    'chart v 1.4/talaria-design/live/index.html',
    'chart v 1.4/chart/legacy-index.html',
    'chart v 1.4/chart/multichart-prod/chart-embed.html',
    'homepage/public/chart/multichart-prod/chart-embed.html',
    'chart v 1.4/chart/multichart/chart-host.html',
    'homepage/public/chart/multichart/chart-host.html',
    'chart v 1.4/chart/multichart/multichart-shell.html',
    'homepage/public/chart/multichart/multichart-shell.html',
  ]) {
    write(shell, shellBody('20260727b83'));
  }
  write(
    'chart v 1.4/chart/modules/order-manager.js',
    fs.readFileSync(path.join(root, 'chart v 1.4/chart/modules/order-manager.js'), 'utf8'),
  );
  const cell = runModuleContentStampBaselineCell(tmp, { baseline: staleBaseline });
  assert.equal(cell.status, 'RED', JSON.stringify(cell, null, 2));
  assert.ok(cell.stampMismatchCount >= 1);
  assert.ok(cell.stampMismatches.some((m) => m.modulePath === modulePath));
});

test('gate aggregate signature stable and pre-multichart shell set remains coherent', () => {
  const report = runCacheStampCoherenceGate({ root });
  assert.equal(report.signature, TALARIA_CACHE_STAMP_COHERENCE_V1);
  assert.ok(fs.existsSync(path.join(root, CACHE_STAMP_BASELINE_RELATIVE)));
  // Pre-multichart shell set remains coherent — the RED is the new coverage, not a baseline break.
  const without = runCacheStampCoherenceGate({
    root,
    shells: CACHE_STAMP_SHELLS_WITHOUT_MULTICHART,
  });
  assert.equal(without.status, 'GREEN', JSON.stringify(without.cells, null, 2));
});
