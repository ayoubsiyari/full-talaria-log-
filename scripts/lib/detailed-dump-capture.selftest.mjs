import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeBytes, summarisePidRoots, coverageAcrossProcesses } from './detailed-dump-capture.mjs';

const MB = 1048576;
const node = (mb, { effective = true } = {}) => ({
  attrs: {
    size: { value: (mb * MB).toString(16) },
    ...(effective ? { effective_size: { value: (mb * MB).toString(16) } } : {}),
  },
});

/** A renderer shaped like pass 3's pid 6920: 403.85 MB named, essentially all of its own private. */
const renderer = {
  allocators: {
    v8: node(180), partition_alloc: node(120), blink_gc: node(60), malloc: node(43.85),
    'partition_alloc/buffer': node(70), 'blink_gc/DOM': node(25),
  },
  process_totals: { private_footprint_bytes: String(404.2 * MB) },
};
const gpu = { allocators: { gpu: node(150), skia: node(40) }, process_totals: { private_footprint_bytes: String(190 * MB) } };
const browserProc = { allocators: { malloc: node(60), v8: node(20) }, process_totals: { private_footprint_bytes: String(80.7 * MB) } };

test('children are not summed into the named total — they are already inside their root', () => {
  const r = summarisePidRoots(renderer);
  assert.equal(r.namedMB, 403.85, 'adding partition_alloc/buffer would double-count 70 MB into a number we then call coverage');
  assert.ok(!('partition_alloc/buffer' in r.rootsMB));
});

test('RED — the pass 3 defect: one pid over an all-process total reads 59.84%', () => {
  const onePid = new Map([[6920, summarisePidRoots(renderer)]]);
  const cov = coverageAcrossProcesses(onePid, { totalPrivateMB: 674.9 });
  assert.equal(cov.arenaCoveragePct, 59.84, 'this is the published number, reproduced from its cause');
  assert.equal(cov.arenaUnattributedMB, 271.05);
  assert.equal(cov.arenaCoverageMeets95, false);
});

test('GREEN — summing every process against the same total clears the 95% bar', () => {
  const all = new Map([
    [6920, summarisePidRoots(renderer)],
    [7001, summarisePidRoots(gpu)],
    [7002, summarisePidRoots(browserProc)],
  ]);
  const cov = coverageAcrossProcesses(all, { totalPrivateMB: 674.9 });
  assert.ok(cov.arenaCoveragePct >= 95, `expected >=95, got ${cov.arenaCoveragePct}`);
  assert.equal(cov.arenaCoverageMeets95, true);
  assert.equal(cov.processCount, 3);
  assert.equal(cov.covState, 'MEASURED');
});

test('a detailed dump alone changes nothing — which is why detail was never the missing forty points', () => {
  const withoutChildren = { ...renderer, allocators: { v8: node(180), partition_alloc: node(120), blink_gc: node(60), malloc: node(43.85) } };
  const a = coverageAcrossProcesses(new Map([[1, summarisePidRoots(renderer)]]), { totalPrivateMB: 674.9 });
  const b = coverageAcrossProcesses(new Map([[1, summarisePidRoots(withoutChildren)]]), { totalPrivateMB: 674.9 });
  assert.equal(a.arenaCoveragePct, b.arenaCoveragePct, 'child rows subdivide roots; they cannot raise coverage of the total');
});

test('effective_size is preferred, because summing size overlaps — the GPU trap from my own W90 census', () => {
  const overlapping = {
    allocators: {
      // 206 MB of `size` that Chrome de-duplicates to 156 MB.
      gpu: { attrs: { size: { value: (150 * MB).toString(16) }, effective_size: { value: (120 * MB).toString(16) } } },
      skia: { attrs: { size: { value: (56 * MB).toString(16) }, effective_size: { value: (36 * MB).toString(16) } } },
    },
  };
  assert.equal(summarisePidRoots(overlapping).namedMB, 156, 'summing `size` here would claim 206 MB of a 156 MB process');
  assert.equal(nodeBytes(overlapping.allocators.gpu).basis, 'effective_size');
});

test('a process with no effective_size is flagged rather than silently mixed in', () => {
  const legacy = { allocators: { v8: node(10, { effective: false }) } };
  assert.equal(summarisePidRoots(legacy).sizeBasis, 'size');
  const cov = coverageAcrossProcesses(new Map([[1, summarisePidRoots(legacy)]]), { totalPrivateMB: 20 });
  assert.match(cov.note, /fell back to `size`/);
});

test('overlap that pushes past the total is its own state, not excellent coverage', () => {
  const cov = coverageAcrossProcesses(new Map([[1, { namedMB: 800, sizeBasis: 'size' }]]), { totalPrivateMB: 674.9 });
  assert.equal(cov.covState, 'OVERLAP_SUSPECTED');
  assert.equal(cov.arenaCoverageMeets95, false, '118% must never satisfy a >=95% gate');
});

test('a failed dump is DUMP_UNAVAILABLE with a null percentage, never 0% coverage', () => {
  const cov = coverageAcrossProcesses(new Map(), { totalPrivateMB: 674.9 });
  assert.equal(cov.covState, 'DUMP_UNAVAILABLE');
  assert.equal(cov.arenaCoveragePct, null, 'a broken instrument reported as 0% reads as a product finding');
  assert.equal(cov.arenaNamedTotalMB, null);
});

test('a missing total is TOTAL_ABSENT — TOTAL-01 refuses a coverage figure with nothing to cover', () => {
  const cov = coverageAcrossProcesses(new Map([[1, summarisePidRoots(renderer)]]), { totalPrivateMB: null });
  assert.equal(cov.covState, 'TOTAL_ABSENT');
  assert.equal(cov.arenaCoveragePct, null);
});
