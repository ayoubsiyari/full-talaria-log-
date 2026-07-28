import assert from 'node:assert/strict';
import test from 'node:test';

import { findLocalChromiumBrowser } from '../../chart v 1.4/chart/modules/m21-w6-fixtures/browser-cli.mjs';
import {
  TALARIA_STORAGE_GROWTH_CENSUS_V1,
  HERMETIC_STORAGE_BUDGET_V1,
  STORAGE_PROFILE_BOUNDARY_EVIDENCE,
  snapshotStorage,
  diffStorage,
  growthPerSession,
  runBoundaryStorageProfileCell,
  assertWithinStorageBudget,
} from '../lib/storage-growth-census.mjs';
import {
  createHermeticStorageGlobal,
  simulateSessionOpen,
  simulateReplay,
  runHermeticBoundedStorageCycle,
  runHermeticUnboundedStorageMutation,
} from '../lib/storage-growth-harness.mjs';
import {
  runHermeticStorageGrowthCensusGate,
  runStorageGrowthBrowserRunner,
} from '../storage-growth-census-gate.mjs';

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

test('signature token is TALARIA_STORAGE_GROWTH_CENSUS_V1', () => {
  assert.equal(TALARIA_STORAGE_GROWTH_CENSUS_V1, 'TALARIA_STORAGE_GROWTH_CENSUS_V1');
});

test('snapshotStorage captures hermetic IDB, localStorage, caches, sessions', async () => {
  const g = createHermeticStorageGlobal();
  simulateSessionOpen(g, 882);
  await simulateReplay(g, 882);
  const snap = await snapshotStorage(g);
  assert.ok(snap.indexedDb.some((d) => d.name.includes('talaria')));
  assert.equal(snap.localStorage.keys >= 2, true);
  assert.ok(snap.caches.some((c) => c.entries >= 2));
  assert.equal(snap.sessionRecords.count, 1);
  assert.deepEqual(snap.sessionRecords.idsSample, [882]);
});

test('diffStorage and growthPerSession report positive session deltas', async () => {
  const g = createHermeticStorageGlobal();
  const a = await snapshotStorage(g);
  simulateSessionOpen(g, 883);
  const b = await snapshotStorage(g);
  const delta = diffStorage(a, b);
  assert.ok(delta.deltaSessionRecords >= 1);
  assert.ok(delta.deltaTotalApproxBytes > 0);

  const report = growthPerSession([
    { label: 'a', snap: a },
    { label: 'b', snap: b },
  ]);
  assert.equal(report.perStep.length, 1);
  assert.ok(report.avgBytesPerSession >= 0);
});

test('STORAGE-GROWTH-PER-SESSION: bounded ladder GREEN within budget', async () => {
  const { report } = await runHermeticBoundedStorageCycle(882, 5);
  assert.equal(report.status, 'GREEN');
  assert.ok(report.perStep.length >= 3);
  assert.ok(report.totals.totalApproxBytes <= HERMETIC_STORAGE_BUDGET_V1.maxTotalApproxBytes);
});

test('NC-STORAGE-UNBOUNDED-MUTATION: unbounded retention exceeds pinned budget (load-bearing)', async () => {
  const bounded = await runHermeticBoundedStorageCycle(882, 5);
  assert.equal(bounded.report.status, 'GREEN');

  const unbounded = await runHermeticUnboundedStorageMutation(882, 12);
  assert.equal(unbounded.report.status, 'RED');
  assert.ok(unbounded.report.violations.length > 0);
  const budget = assertWithinStorageBudget(unbounded.report);
  assert.equal(budget.status, 'RED');
});

test('BOUNDARY cell documents clean vs dirty storage profile on memory claims', () => {
  const cell = runBoundaryStorageProfileCell();
  assert.equal(cell.status, 'GREEN');
  assert.equal(cell.cell, STORAGE_PROFILE_BOUNDARY_EVIDENCE.cell);
  assert.match(cell.evidence.rule, /clean/i);
  assert.match(cell.evidence.rule, /dirty/i);
});

test('gate: runHermeticStorageGrowthCensusGate aggregates GREEN with load-bearing NC', async () => {
  const gate = await runHermeticStorageGrowthCensusGate({ sessionCount: 5 });
  assert.equal(gate.signature, TALARIA_STORAGE_GROWTH_CENSUS_V1);
  assert.equal(gate.status, 'GREEN');
  assert.equal(gate.ok, true);
  const nc = gate.cells.find((c) => c.cell === 'NC-STORAGE-UNBOUNDED-MUTATION');
  assert.ok(nc);
  assert.equal(nc.pass, true);
  assert.equal(nc.status, 'GREEN');
});

test('NC gate fails closed if unbounded mutation incorrectly GREEN', async () => {
  const gate = await runHermeticStorageGrowthCensusGate({ sessionCount: 5 });
  const nc = gate.cells.find((c) => c.cell === 'NC-STORAGE-UNBOUNDED-MUTATION');
  if (nc.mutatedStatus !== 'RED') {
    assert.fail('NC precondition: unbounded mutation must be RED');
  }
});

test('BROWSER-STORAGE-GROWTH-LADDER: real browser when available', async (t) => {
  if (!skipOrFailWhenNoRealBrowser(t)) return;
  const result = await runStorageGrowthBrowserRunner({ sessionCount: 3, timeoutMs: 25_000 });
  if (result.status === 'UNPROVEN') {
    assert.fail(`browser ladder UNPROVEN: ${result.error ?? 'unknown'}`);
  }
  assert.equal(result.signature, TALARIA_STORAGE_GROWTH_CENSUS_V1);
  assert.equal(result.status, 'GREEN');
  assert.equal(result.ok, true);
  assert.equal(result.report.cell, 'BROWSER-STORAGE-GROWTH-LADDER');
});
