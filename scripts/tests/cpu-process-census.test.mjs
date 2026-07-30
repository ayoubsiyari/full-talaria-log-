/**
 * The bucket IS the recommendation: raster points at canvas surfaces, compositor
 * at layers, main-thread at JavaScript and layout. Mis-bucketing a thread would
 * aim a cut at the wrong subsystem, so the mapping is pinned here.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { bucketThreadRole, diffProcessCpu, summariseCpuByRole } from '../cpu-process-census.mjs';

test('renderer threads map to their subsystem', () => {
  assert.equal(
    bucketThreadRole({ threadName: 'CrRendererMain', processName: 'Renderer' }),
    'renderer-main-js-and-layout',
  );
  assert.equal(bucketThreadRole({ threadName: 'Compositor', processName: 'Renderer' }), 'renderer-compositor');
  assert.equal(
    bucketThreadRole({ threadName: 'CompositorTileWorker1', processName: 'Renderer' }),
    'renderer-raster',
  );
  assert.equal(
    bucketThreadRole({ threadName: 'ThreadPoolForegroundWorker', processName: 'Renderer' }),
    'renderer-threadpool',
  );
});

test('GPU process threads are separated from renderer threads', () => {
  assert.equal(bucketThreadRole({ threadName: 'CrGpuMain', processName: 'GPU Process' }), 'gpu-process-main');
  assert.equal(
    bucketThreadRole({ threadName: 'VizCompositorThread', processName: 'GPU Process' }),
    'gpu-viz-compositor',
  );
  assert.equal(bucketThreadRole({ threadName: 'Chrome_ChildIOThread', processName: 'GPU Process' }), 'gpu-other');
});

test('wait-dominated threads are excluded from role totals', () => {
  const roles = summariseCpuByRole([
    { threadName: 'CrRendererMain', processName: 'Renderer', busyMs: 5000, topEvents: [] },
    { threadName: 'GpuVSyncThread', processName: 'GPU Process', busyMs: 9000, waitDominated: true, topEvents: [] },
  ], 10_000);
  assert.equal(roles.roles.length, 1);
  assert.equal(roles.totalPercentOfCore, 50);
});

test('role percentages exceed 100 when threads run in parallel, which is the point', () => {
  const roles = summariseCpuByRole([
    { threadName: 'CrRendererMain', processName: 'Renderer', busyMs: 8000, topEvents: [] },
    { threadName: 'ThreadPoolWorker1', processName: 'Renderer', busyMs: 7000, topEvents: [] },
    { threadName: 'ThreadPoolWorker2', processName: 'Renderer', busyMs: 6000, topEvents: [] },
  ], 10_000);
  assert.equal(roles.totalPercentOfCore, 210);
  const pool = roles.roles.find((r) => r.role === 'renderer-threadpool');
  assert.equal(pool.threads, 2);
  assert.equal(pool.percentOfCore, 130);
});

test('self time is merged across the threads of a role so the top event is meaningful', () => {
  const roles = summariseCpuByRole([
    { threadName: 'ThreadPoolWorker1', processName: 'Renderer', busyMs: 1000, topEvents: [{ name: 'V8.GC_MC_BACKGROUND_MARKING', selfMs: 400 }] },
    { threadName: 'ThreadPoolWorker2', processName: 'Renderer', busyMs: 1000, topEvents: [{ name: 'V8.GC_MC_BACKGROUND_MARKING', selfMs: 300 }, { name: 'RasterTask', selfMs: 100 }] },
  ], 10_000);
  const pool = roles.roles[0];
  assert.deepEqual(pool.topEvents[0], { name: 'V8.GC_MC_BACKGROUND_MARKING', selfMs: 700 });
});

test('process CPU comes from cpuTime deltas over the same window', () => {
  const before = new Map([[1, { type: 'renderer', cpuTime: 10 }], [2, { type: 'GPU', cpuTime: 5 }]]);
  const after = new Map([[1, { type: 'renderer', cpuTime: 29.43 }], [2, { type: 'GPU', cpuTime: 6.38 }]]);
  const d = diffProcessCpu(before, after, 10_000);
  assert.equal(d.perProcess[0].type, 'renderer');
  assert.equal(d.perProcess[0].cpuPercentOfCore, 194.3);
  assert.equal(d.perProcess[1].cpuPercentOfCore, 13.8);
  assert.equal(d.totalPercentOfCore, 208.1);
});

test('processes that appeared mid-window are skipped rather than counted from zero', () => {
  const d = diffProcessCpu(
    new Map([[1, { type: 'renderer', cpuTime: 1 }]]),
    new Map([[1, { type: 'renderer', cpuTime: 2 }], [9, { type: 'utility', cpuTime: 50 }]]),
    10_000,
  );
  assert.equal(d.perProcess.length, 1);
});
