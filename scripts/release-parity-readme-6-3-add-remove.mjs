#!/usr/bin/env node
/**
 * README Step 6.3 — Add/remove charts with heap/listener proof.
 *
 * Lifted as written from homepage/public/chart/multichart/README.md:
 *   "Switch Layout from 2 → 3 → 2. Manager calls removeChart for departed
 *    iframes. Heap snapshot before/after — iframes should be GC'd
 *    (no listeners survive)."
 *
 * Load-bearing RED gate until Chart.destroy() exists. A's teardown probe
 * measured the current runtime leak: 147 live listeners per instance, 0 removed
 * against 357 registered page-wide, 1 rAF loop per instance, 2 setTimeout
 * handles at rest, and 147/147 anonymous closures with no retained reference.
 */
import { pathToFileURL } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const outPath = process.env.RELEASE_PARITY_6_3_OUT
  ? resolve(root, process.env.RELEASE_PARITY_6_3_OUT)
  : resolve(root, 'docs/plan3/RELEASE-PARITY-README-6-3-ADD-REMOVE-20260731.json');

export const RELEASE_PARITY_README_6_3_SIGNATURE = 'TALARIA_RELEASE_PARITY_README_6_3_V1';

export const B_M1_MEASUREMENT_STAMP = Object.freeze({
  sourceHandoff:
    'manager-b-plan3/docs/plan3/HANDOFF-B-TO-D-M1-RAN-ON-B120-AUTH-IS-SOLVED-AND-THE-HARNESS-MISSES-THE-PEAK-20260731-1935.md',
  sourceEvidence: '_evidence/manager-B/m20-j1/results/m1-peak-capture-result.json',
  measuredAt: '2026-07-31T18:23:36.836Z',
  buildId: '20260731b120',
  sessionId: 936,
  fileId: 677,
  barCount: 6242,
  tradeCount: 182,
  screenshotCount: 395,
});

export const TEARDOWN_PROBE_BASELINE = Object.freeze({
  liveListenersPerInstance: 147,
  pageWideRegisteredListeners: 357,
  pageWideRemovedListeners: 0,
  rafLoopsPerInstance: 1,
  timeoutHandlesAtRest: 2,
  anonymousClosureListeners: 147,
  retainedListenerReferences: 0,
});

function makeListenerBag(id) {
  return {
    id,
    listeners: new Map(),
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    },
    listenerCount() {
      let n = 0;
      for (const set of this.listeners.values()) n += set.size;
      return n;
    },
  };
}

/**
 * Hermetic MultichartManager add/remove.
 * mode=noDestroy: current product state; removeChart drops the panel but leaves
 * listener bags because Chart.destroy() does not exist.
 * mode=withDestroy: future A landing; destroy clears listeners before removal.
 */
export function runAddRemoveListenerModel(opts = {}) {
  const mode = opts.mode || 'noDestroy';
  const listenerCountPerChart = opts.listenerCountPerChart ?? TEARDOWN_PROBE_BASELINE.liveListenersPerInstance;
  const removableAtAll = mode === 'withDestroy';
  const charts = new Map();
  const detached = [];
  let removedListenerCalls = 0;

  const addChart = (id) => {
    const host = makeListenerBag(id);
    const listeners = Array.from({ length: listenerCountPerChart }, (_, i) => ({
      type: i < 30 ? 'document' : 'window',
      fn: () => {},
      retainedReference: removableAtAll,
    }));
    for (const l of listeners) host.addEventListener(l.type, l.fn);
    charts.set(id, { host, listeners });
  };

  const removeChart = (id) => {
    const row = charts.get(id);
    if (!row) return;
    if (mode === 'withDestroy') {
      for (const l of row.listeners) {
        row.host.removeEventListener(l.type, l.fn);
        removedListenerCalls += 1;
      }
      charts.delete(id);
      return;
    }
    // Current product: no Chart.destroy(), so detached listeners survive.
    detached.push(row.host);
    charts.delete(id);
  };

  const snapshot = () => ({
    chartIds: [...charts.keys()],
    survivingListeners:
      [...charts.values()].reduce((n, row) => n + row.host.listenerCount(), 0)
      + detached.reduce((n, h) => n + h.listenerCount(), 0),
    liveRafLoops:
      ([...charts.values()].length + detached.length) * TEARDOWN_PROBE_BASELINE.rafLoopsPerInstance,
    timeoutHandlesAtRest: TEARDOWN_PROBE_BASELINE.timeoutHandlesAtRest,
  });

  addChart('A');
  addChart('B');
  const beforeGrow = snapshot();
  addChart('C');
  const atThree = snapshot();
  removeChart('C');
  const after = snapshot();

  const leakedListeners = Math.max(0, after.survivingListeners - beforeGrow.survivingListeners);
  const removedListeners = removedListenerCalls;
  const unremovableAnonymousListeners = removableAtAll ? 0 : TEARDOWN_PROBE_BASELINE.anonymousClosureListeners;
  const listenersCleared =
    after.survivingListeners === beforeGrow.survivingListeners
    && after.chartIds.length === 2
    && atThree.chartIds.length === 3;
  const teardownProbeMatchesCurrent =
    mode === 'noDestroy'
    && listenerCountPerChart === TEARDOWN_PROBE_BASELINE.liveListenersPerInstance
    && removedListeners === TEARDOWN_PROBE_BASELINE.pageWideRemovedListeners
    && TEARDOWN_PROBE_BASELINE.pageWideRegisteredListeners === 357
    && after.liveRafLoops === atThree.liveRafLoops
    && after.timeoutHandlesAtRest === TEARDOWN_PROBE_BASELINE.timeoutHandlesAtRest
    && removableAtAll === false
    && unremovableAnonymousListeners === TEARDOWN_PROBE_BASELINE.anonymousClosureListeners;

  return {
    cell: mode === 'withDestroy' ? 'README-6-3-ADD-REMOVE-WITH-DESTROY' : 'README-6-3-ADD-REMOVE',
    mode,
    status: listenersCleared ? 'GREEN' : 'RED',
    beforeGrow,
    atThree,
    after,
    listenerCountPerChart,
    pageWideRegisteredListeners: TEARDOWN_PROBE_BASELINE.pageWideRegisteredListeners,
    pageWideRemovedListeners: removedListeners,
    rafLoopsPerInstance: TEARDOWN_PROBE_BASELINE.rafLoopsPerInstance,
    timeoutHandlesAtRest: TEARDOWN_PROBE_BASELINE.timeoutHandlesAtRest,
    anonymousClosureListeners: unremovableAnonymousListeners,
    retainedListenerReferences: removableAtAll ? listenerCountPerChart : TEARDOWN_PROBE_BASELINE.retainedListenerReferences,
    removableAtAll,
    leakedListeners,
    listenersCleared,
    teardownProbeMatchesCurrent,
    requiresChartDestroy: true,
    note: 'README 6.3: Layout 2→3→2; no listeners survive removeChart. RED until listeners are first made removable, then removed.',
  };
}

export function runReadme63Suite() {
  const current = runAddRemoveListenerModel({ mode: 'noDestroy' });
  const futureDestroyControl = runAddRemoveListenerModel({ mode: 'withDestroy' });
  const destroyControl = {
    cell: 'README-6-3-WITH-DESTROY-CONTROL',
    status: futureDestroyControl.status === 'GREEN' ? 'GREEN' : 'RED',
    reportStatus: futureDestroyControl.status,
    expected: 'GREEN',
  };
  const status = current.status === 'GREEN' && destroyControl.status === 'GREEN' ? 'GREEN' : 'RED';
  return {
    signature: RELEASE_PARITY_README_6_3_SIGNATURE,
    status,
    measurementStamp: B_M1_MEASUREMENT_STAMP,
    current,
    destroyControl,
    releaseAuthority: {
      stopAuthority: true,
      productBlocksRelease: current.status === 'RED',
      statement: current.status === 'RED'
        ? 'Chart.destroy() is absent; README 6.3 is intentionally RED until teardown removes global listeners.'
        : 'README 6.3 can go GREEN only after Chart.destroy() clears detached listeners.',
    },
    limitation:
      'Hermetic listener/heap model using A teardown probe: 147 live listeners/instance, 357 registered page-wide, 0 removed, 1 rAF/instance, 2 setTimeout handles at rest. Product heap snapshot remains required for final credit.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runReadme63Suite();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  mkdirSync(resolve(root, '../_evidence/manager-D'), { recursive: true });
  writeFileSync(
    resolve(root, '../_evidence/manager-D/RELEASE-PARITY-README-6-3-ADD-REMOVE-20260731.json'),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.status === 'GREEN' ? 0 : 1);
}
