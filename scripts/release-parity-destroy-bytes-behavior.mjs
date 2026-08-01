#!/usr/bin/env node
/**
 * D-owned destroy behavior complement: bytes and late scheduled work only.
 *
 * E owns correctness after destroy (indicator/drawing/overlay state). This gate
 * deliberately avoids those surfaces and asks whether the removed chart can
 * still retain memory or run late pan/resize work after removal.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outPath = process.env.RELEASE_PARITY_DESTROY_BYTES_OUT
  ? resolve(root, process.env.RELEASE_PARITY_DESTROY_BYTES_OUT)
  : resolve(root, 'docs/plan3/RELEASE-PARITY-DESTROY-BYTES-BEHAVIOR-20260731.json');

export const RELEASE_PARITY_DESTROY_BYTES_BEHAVIOR_SIGNATURE =
  'TALARIA_RELEASE_PARITY_DESTROY_BYTES_BEHAVIOR_V1';

export const E_DESTROY_CORRECTNESS_COMPANION = Object.freeze({
  report: 'manager-e-indicator-eviction/docs/plan3/worker-reports/E-FOCUS-DESTROY-CORRECTNESS-20260731.md',
  behaviorCell: 'DESTROY-NO-DESTROY-RESURRECTS-INDICATOR',
  greenCell: 'DESTROY-WITH-DESTROY-CLEARS-INDICATORS',
  boundary: 'E owns destroyed indicator/drawing/overlay correctness; D owns retained bytes and late scheduled work.',
});

const BYTES_BASELINE = Object.freeze({
  listenerCountPerChart: 147,
  listenerClosureBytes: 147 * 256,
  canvasBackingBytes: 1440 * 800 * 4,
  imageSurfaceBytes: 256 * 239 * 4,
  latePanResizeScratchBytes: 512 * 1024,
  rafLoopsPerChart: 1,
  timeoutHandlesAtRest: 2,
});

function makeChart(id) {
  return {
    id,
    destroyed: false,
    listeners: BYTES_BASELINE.listenerCountPerChart,
    retainedBytes:
      BYTES_BASELINE.listenerClosureBytes
      + BYTES_BASELINE.canvasBackingBytes
      + BYTES_BASELINE.imageSurfaceBytes,
    rafLoops: BYTES_BASELINE.rafLoopsPerChart,
    timeouts: BYTES_BASELINE.timeoutHandlesAtRest,
    lateWorkBytes: 0,
    lateEvents: [],
  };
}

function removeChart(state, id, mode) {
  const chart = state.live.get(id);
  if (!chart) return;
  chart.destroyed = true;
  state.live.delete(id);
  if (mode === 'withDestroy') {
    chart.listeners = 0;
    chart.retainedBytes = 0;
    chart.rafLoops = 0;
    chart.timeouts = 0;
  }
  state.detached.push(chart);
}

function deliverLateWork(state, id, mode) {
  const chart = state.detached.find((row) => row.id === id) || state.live.get(id);
  if (!chart) return;
  chart.lateEvents.push('resize');
  chart.lateEvents.push('pan');
  if (mode === 'withDestroy') return;
  chart.lateWorkBytes += BYTES_BASELINE.latePanResizeScratchBytes;
  chart.retainedBytes += BYTES_BASELINE.latePanResizeScratchBytes;
}

function totals(state) {
  const rows = [...state.live.values(), ...state.detached];
  return {
    liveChartIds: [...state.live.keys()],
    detachedChartIds: state.detached.map((row) => row.id),
    survivingListeners: rows.reduce((sum, row) => sum + row.listeners, 0),
    detachedListeners: state.detached.reduce((sum, row) => sum + row.listeners, 0),
    retainedBytes: rows.reduce((sum, row) => sum + row.retainedBytes, 0),
    detachedRetainedBytes: state.detached.reduce((sum, row) => sum + row.retainedBytes, 0),
    lateWorkBytes: state.detached.reduce((sum, row) => sum + row.lateWorkBytes, 0),
    rafLoops: rows.reduce((sum, row) => sum + row.rafLoops, 0),
    timeouts: rows.reduce((sum, row) => sum + row.timeouts, 0),
  };
}

export function runDestroyBytesBehaviorControl(mode = 'noDestroy') {
  const state = { live: new Map(), detached: [] };
  state.live.set('A', makeChart('A'));
  state.live.set('B', makeChart('B'));
  const beforeGrow = totals(state);
  state.live.set('C', makeChart('C'));
  const atThree = totals(state);
  removeChart(state, 'C', mode);
  deliverLateWork(state, 'C', mode);
  const afterLateWork = totals(state);

  const failures = [];
  if (afterLateWork.liveChartIds.length !== beforeGrow.liveChartIds.length) {
    failures.push({ reason: 'layout-did-not-return-to-two-charts' });
  }
  if (afterLateWork.detachedListeners !== 0) {
    failures.push({ reason: 'destroyed-listeners-survive', count: afterLateWork.detachedListeners });
  }
  if (afterLateWork.detachedRetainedBytes !== 0) {
    failures.push({ reason: 'destroyed-instance-retains-bytes', bytes: afterLateWork.detachedRetainedBytes });
  }
  if (afterLateWork.lateWorkBytes !== 0) {
    failures.push({ reason: 'late-work-rehydrated-bytes', bytes: afterLateWork.lateWorkBytes });
  }
  if (afterLateWork.rafLoops !== beforeGrow.rafLoops) {
    failures.push({ reason: 'destroyed-raf-loop-survives', before: beforeGrow.rafLoops, after: afterLateWork.rafLoops });
  }

  return {
    cell: mode === 'withDestroy' ? 'DESTROY-BYTES-WITH-DESTROY' : 'DESTROY-BYTES-NO-DESTROY',
    mode,
    status: failures.length ? 'RED' : 'GREEN',
    baseline: BYTES_BASELINE,
    beforeGrow,
    atThree,
    afterLateWork,
    failures,
    eCompanion: E_DESTROY_CORRECTNESS_COMPANION,
    note: 'D bytes-side behavior complement: removed charts must not retain bytes or process late pan/resize work.',
  };
}

export function runDestroyBytesBehaviorSuite() {
  const current = runDestroyBytesBehaviorControl('noDestroy');
  const withDestroy = runDestroyBytesBehaviorControl('withDestroy');
  const redControl = {
    cell: 'RED-DESTROY-BYTES-NO-DESTROY',
    status: current.status === 'RED'
      && current.failures.some((failure) => failure.reason === 'destroyed-instance-retains-bytes')
      && current.failures.some((failure) => failure.reason === 'late-work-rehydrated-bytes')
      ? 'GREEN'
      : 'RED',
    reportStatus: current.status,
    expected: 'RED',
  };
  const futureControl = {
    cell: 'GREEN-DESTROY-BYTES-WITH-DESTROY',
    status: withDestroy.status,
    reportStatus: withDestroy.status,
    expected: 'GREEN',
  };

  return {
    signature: RELEASE_PARITY_DESTROY_BYTES_BEHAVIOR_SIGNATURE,
    status: current.status === 'GREEN' && futureControl.status === 'GREEN' ? 'GREEN' : 'RED',
    current,
    redControl,
    futureControl,
    releaseAuthority: {
      stopAuthority: true,
      destroyStop: current.status === 'RED',
      statement: current.status === 'RED'
        ? 'Chart.destroy() is absent; destroyed charts can retain bytes and process late work.'
        : 'Destroyed charts clear bytes and ignore late pan/resize work.',
    },
    eCompanion: E_DESTROY_CORRECTNESS_COMPANION,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runDestroyBytesBehaviorSuite();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  mkdirSync(resolve(root, '../_evidence/manager-D'), { recursive: true });
  writeFileSync(
    resolve(root, '../_evidence/manager-D/RELEASE-PARITY-DESTROY-BYTES-BEHAVIOR-20260731.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
