/**
 * Self-test for HOARD-CONSTRUCTOR-CENSUS graders and Blink detail diff.
 * No browser. Mutates nothing.
 */
process.argv.push('--noRun');
const { gradeConstructorGrowth, gradeForcedGcSlope } = await import('./hoard-constructor-census.mjs');
const { summariseAllocatorDetail, diffAllocatorDetail } = await import('./lib/blink-allocator-detail.mjs');
const { synthesizeHeapSnapshotWithConstructors, aggregateHeapSnapshotByConstructor } = await import('./lib/heap-snapshot-aggregates.mjs');

let pass = 0; let fail = 0;
const check = (name, got, want) => {
  const ok = typeof want === 'function' ? want(got) : got === want;
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  got=${JSON.stringify(got)} want=${want}`); }
};

console.log('HOARD-CONSTRUCTOR-CENSUS self-test\n');

{
  const before = aggregateHeapSnapshotByConstructor(synthesizeHeapSnapshotWithConstructors([
    { name: 'HTMLCanvasElement', count: 10, selfSize: 1000 },
    { name: 'Object', count: 100, selfSize: 64 },
  ]));
  const after = aggregateHeapSnapshotByConstructor(synthesizeHeapSnapshotWithConstructors([
    { name: 'HTMLCanvasElement', count: 40, selfSize: 1000 },
    { name: 'Detached <div>', count: 5000, selfSize: 200, detached: true },
    { name: 'Object', count: 100, selfSize: 64 },
  ]));
  const g = gradeConstructorGrowth(before, after, { topN: 5 });
  check('constructor growth MEASURED', g.verdict, 'MEASURED');
  check('top grower is Detached <div> or canvas', g.topGrowers[0].constructor, (c) => /Detached|Canvas/i.test(c));
  check('hypothesis hits non-empty when canvas/DOM grow', g.hypothesisHitsInTop.length > 0, true);
}

{
  const g = gradeForcedGcSlope({
    probeA: { at: '2026-08-02T18:00:00.000Z', footprint: { footprintTotalMB: 700 } },
    probeB: { at: '2026-08-02T18:12:00.000Z', footprint: { footprintTotalMB: 760 } },
    barsDelivered: 3000,
  });
  check('forced-GC slope MEASURED', g.verdict, 'MEASURED');
  check('delta 60 MB', g.deltaMB, 60);
  check('mb/kbar = 20', g.mbPerKbar, 20);
  check('prior inflation stated', g.priorFloorInflationMB, 281.7);
}

{
  const g = gradeForcedGcSlope({ probeA: {}, probeB: {}, barsDelivered: 0 });
  check('missing floors INSUFFICIENT', g.verdict, 'INSUFFICIENT');
}

{
  const detail = summariseAllocatorDetail({
    blink_gc: { attrs: { size: { value: '0x6400000' } } }, // 100 MB
    'blink_gc/AllocatedObjects': { attrs: { size: { value: '0x3200000' } } }, // 50
    'blink_gc/Canvas': { attrs: { size: { value: '0x1E00000' } } }, // 30
    partition_alloc: { attrs: { size: { value: '0x5000000' } } },
    'partition_alloc/array_buffer': { attrs: { size: { value: '0x2800000' } } },
    'skia/something': { attrs: { size: { value: '0x100000' } } },
    ignored_other: { attrs: { size: { value: '0x1000' } } },
  });
  check('roots keep blink_gc', detail.rootsMB.blink_gc > 90, true);
  check('children keep blink_gc/Canvas', (detail.childrenByRoot.blink_gc || []).some((r) => r.name.includes('Canvas')), true);
  check('children keep partition_alloc/array_buffer', (detail.childrenByRoot.partition_alloc || []).some((r) => r.name.includes('array_buffer')), true);

  const before = summariseAllocatorDetail({
    blink_gc: { attrs: { size: { value: '0x6400000' } } },
    'blink_gc/Canvas': { attrs: { size: { value: '0xA00000' } } },
  });
  const after = summariseAllocatorDetail({
    blink_gc: { attrs: { size: { value: '0xC800000' } } },
    'blink_gc/Canvas': { attrs: { size: { value: '0x3200000' } } },
  });
  const d = diffAllocatorDetail(before, after);
  const blinkRoot = d.rootDeltas.find((r) => r.name === 'blink_gc');
  check('blink_gc root delta positive', blinkRoot && blinkRoot.deltaMB > 90, true);
  const canvas = (d.childDeltas.blink_gc || []).find((r) => r.name.includes('Canvas'));
  check('blink_gc/Canvas child delta positive', canvas && canvas.deltaMB > 30, true);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
