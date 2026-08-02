/**
 * Offline salvage for hoard-constructor-run3 after the live retainer pass OOMed.
 * Uses dynamic import so graders load without launching main().
 */
import fs from 'fs';

const dir = process.argv.find((a) => a.startsWith('--dir='))?.split('=').slice(1).join('=')
  || '_evidence/manager-C/hoard-constructor-run3';

process.argv.push('--noRun');
const { aggregateRetainerPaths, formatRetainerPathsSummary } = await import('./lib/heap-retainer-paths.mjs');
const { aggregateHeapSnapshotByConstructor } = await import('./lib/heap-snapshot-aggregates.mjs');
const { diffAllocatorDetail } = await import('./lib/blink-allocator-detail.mjs');
const { gradeForcedGcSlope, gradeConstructorGrowth } = await import('./hoard-constructor-census.mjs');

const Aalloc = JSON.parse(fs.readFileSync(`${dir}/A-allocators.json`, 'utf8'));
const Balloc = JSON.parse(fs.readFileSync(`${dir}/B-allocators.json`, 'utf8'));
console.log('loading snapshots...');
const snapB = JSON.parse(fs.readFileSync(`${dir}/B.heapsnapshot`, 'utf8'));
const snapA = JSON.parse(fs.readFileSync(`${dir}/A.heapsnapshot`, 'utf8'));
console.log('aggregating constructors...');
const aggA = aggregateHeapSnapshotByConstructor(snapA);
const aggB = aggregateHeapSnapshotByConstructor(snapB);
const growth = gradeConstructorGrowth(aggA, aggB, { topN: 5 });
console.log('top growers', growth.topGrowers.map((r) => r.constructor));
console.log('retainer paths (sample 1500/ctor)...');
const retainers = aggregateRetainerPaths(snapB, {
  constructors: growth.topGrowers.map((r) => r.constructor),
  topPaths: 8,
  maxDepth: 14,
  samplePerCtor: 1500,
});
console.log(formatRetainerPathsSummary(retainers).split('\n').slice(0, 60).join('\n'));

const slope = gradeForcedGcSlope({
  probeA: { at: '2026-08-02T19:42:46.000Z', footprint: { footprintTotalMB: 700.1 } },
  probeB: { at: '2026-08-02T19:55:12.000Z', footprint: { footprintTotalMB: 810.2 } },
  barsDelivered: 2025,
});
const allocDiff = diffAllocatorDetail(Aalloc.detail, Balloc.detail);

const report = {
  signature: 'HOARD-CONSTRUCTOR-CENSUS-V1',
  salvaged: true,
  salvageWhy: 'Live run completed moments A/B and snapshots; retainer-path pass OOM-killed the detached node before report.json was written. Retainers recomputed offline with samplePerCtor=1500.',
  startedAt: '2026-08-02T19:37:18.000Z',
  identity: { buildId: '20260802b122', origin: 'http://31.97.192.82:3000' },
  condition: {
    requestedSpeed: 10,
    warmMin: 4,
    legMin: 12,
    hypothesis: 'detached canvas backing stores + retained DOM; four panels of layered canvases; blink_gc + partition_alloc',
    soakBlockerOpen: 'CONF-01 distinct datasets do not overlap — 3/4 panels deliver zero bars. same-symbol mode now wired into sealed soak; not yet live-verified.',
    floorDiscipline: 'every published floor level is inflated by ~281.7 MB a real collection takes; slope re-measured with forced GC at BOTH drains',
  },
  moments: {
    A: {
      footprintMB: 700.1, canvases: 4, nodes: 12254, snapMB: 192.5,
      allocatorsRootsMB: Aalloc.detail.rootsMB,
    },
    B: {
      footprintMB: 810.2, canvases: 4, nodes: 11671, snapMB: 256.5,
      allocatorsRootsMB: Balloc.detail.rootsMB,
    },
  },
  leg: {
    barsDelivered: 2025,
    note: 'one-panel delivery under distinct datasets; per-kbar denominator is one panel',
  },
  forcedGcSlope: slope,
  constructorGrowth: growth,
  retainerPaths: retainers,
  allocatorDiff: {
    rootDeltas: allocDiff.rootDeltas.filter((r) => Math.abs(r.deltaMB) >= 0.05),
    blink_gcTop: (allocDiff.childDeltas.blink_gc || []).slice(0, 15),
    partition_allocTop: (allocDiff.childDeltas.partition_alloc || []).slice(0, 15),
  },
  hypothesisScoreboard: {
    carriedIn: 'detached canvas + retained DOM',
    canvasRootAMB: Aalloc.detail.rootsMB.canvas,
    canvasRootBMB: Balloc.detail.rootsMB.canvas,
    canvasRootDeltaMB: 0,
    blinkGcDeltaMB: 6.75,
    partitionDeltaMB: 3.242,
    nodesA: 12254,
    nodesB: 11671,
    detachedCanvasInSnapA: '4 instances / ~0.002 MB',
    verdict: 'NOT SUPPORTED as the growth driver on this 12-min forced-GC leg. canvas root flat at 8.34 MB; nodes fell; blink_gc +6.75 MB and partition_alloc +3.2 MB do not explain +110 MB OS floor. Growth is dominated by v8 (+22), gpu (+15), shared_memory (+14), malloc (+8).',
  },
  plainStatements: [
    'Every previously published floor LEVEL is inflated by the ~281.7 MB a real HeapProfiler.collectGarbage takes.',
    'The 22.89 MB/kbar pause-and-wait slope is NOT assumed to survive re-basing. Measured forced-GC slope on this short one-panel leg: 54.37 MB/kbar (700.1 -> 810.2 MB over 2025 bars). Short leg + one-panel denominator — do not quote as the ten-hour figure.',
    'Dataset-exhaustion soak blocker remains OPEN: same-symbol dataset mode is wired into sealed-two-arm-soak and gated on 4 delivering panels; live verification of 4/4 delivery under that mode is still required before fire.',
  ],
  verdict: 'CAPTURED_SALVAGED',
};

fs.writeFileSync(`${dir}/report.json`, JSON.stringify(report, null, 2));
console.log('wrote', `${dir}/report.json`, `${(fs.statSync(`${dir}/report.json`).size / 1024).toFixed(1)} KB`);
