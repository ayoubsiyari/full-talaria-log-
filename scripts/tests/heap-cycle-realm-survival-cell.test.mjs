import test from 'node:test';
import assert from 'node:assert/strict';

import {
  newestCycleSnapshot,
  buildRealmSurvivalCell,
} from '../heap-cycle-memory-gate.mjs';

test('unit: the highest existing cycle snapshot is the one graded', () => {
  const present = new Set([
    '/tmp/run.cycle2.heapsnapshot',
    '/tmp/run.cycle3.heapsnapshot',
  ]);
  const picked = newestCycleSnapshot('/tmp/run.heapsnapshot', {
    existsSync: (p) => present.has(p),
  });
  assert.equal(picked, '/tmp/run.cycle3.heapsnapshot');
});

test('unit: with no per-cycle files, the base snapshot is graded if it exists', () => {
  assert.equal(
    newestCycleSnapshot('/tmp/run.heapsnapshot', { existsSync: (p) => p === '/tmp/run.heapsnapshot' }),
    '/tmp/run.heapsnapshot',
  );
  assert.equal(newestCycleSnapshot('/tmp/run.heapsnapshot', { existsSync: () => false }), null);
  assert.equal(newestCycleSnapshot(null), null);
});

test('unit: a product-retained peer realm is a blocking failure that names the panel', () => {
  const cell = buildRealmSurvivalCell({
    status: 'RED',
    ok: false,
    census: {
      counts: { live: 1, collected: 0, 'product-retained': 1, 'inspector-retained': 4 },
      survivors: [{ label: 'cycle1/panelB', panel: 'B', cycle: 1, path: 'Chart--property:_mcHostCacheFileRefOwners' }],
    },
  });
  assert.equal(cell.pass, false);
  assert.equal(cell.blocking, true);
  assert.match(cell.detail, /cycle1\/panelB/);
  assert.match(cell.detail, /_mcHostCacheFileRefOwners/);
  assert.deepEqual(cell.survivors, [{ label: 'cycle1/panelB', panel: 'B', cycle: 1 }]);
});

test('unit: inspector-retained realms are reported but never fail the gate', () => {
  const cell = buildRealmSurvivalCell({
    status: 'GREEN',
    ok: true,
    census: {
      counts: { live: 1, collected: 2, 'product-retained': 0, 'inspector-retained': 4 },
      survivors: [],
    },
  });
  assert.equal(cell.pass, true);
  assert.equal(cell.inspectorRetainedNotGraded, 4);
  assert.match(cell.detail, /not graded/);
});

test('unit: the kill switch reports SKIPPED and does not block', () => {
  const cell = buildRealmSurvivalCell({
    status: 'SKIPPED',
    ok: true,
    reason: 'TALARIA_DISABLE_REALM_SURVIVAL_V1=1 — instrument disabled by kill switch',
  });
  assert.equal(cell.status, 'SKIPPED');
  assert.equal(cell.pass, true);
  assert.equal(cell.nonBlocking, true);
  assert.notEqual(cell.blocking, true);
});

test('unit: a grade that could not run fails rather than silently passing', () => {
  const cell = buildRealmSurvivalCell({
    status: 'RED',
    ok: false,
    reason: 'snapshot unparseable at 560.2 MB (V8 max string length binds above ~500 MB — use 3 cycles)',
  });
  assert.equal(cell.pass, false);
  assert.match(cell.detail, /max string length/);
});
