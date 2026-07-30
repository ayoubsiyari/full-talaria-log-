/**
 * The census exists to state what fraction of the tab a gauge can see, so the
 * two things that must be right are the allocator reduction (no double counting
 * of parents and children) and the visibility ratios.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeVisibility, summariseAllocators } from '../process-memory-census.mjs';

test('only top-level allocator roots are kept, so children are not counted twice', () => {
  const out = summariseAllocators({
    malloc: { attrs: { size: { value: '4000000' } } },
    'malloc/allocated_objects': { attrs: { size: { value: '3000000' } } },
    v8: { attrs: { size: { value: '2000000' } } },
    'v8/main/heap': { attrs: { size: { value: '1000000' } } },
  });
  assert.deepEqual(Object.keys(out).sort(), ['malloc', 'v8']);
  assert.equal(out.malloc, +(0x4000000 / 1048576).toFixed(2));
});

test('hex sizes are decoded and decimal numbers are accepted too', () => {
  const out = summariseAllocators({
    skia: { attrs: { size: { value: '100000' } } },
    cc: { attrs: { size: { value: 2097152 } } },
  });
  assert.equal(out.skia, 1);
  assert.equal(out.cc, 2);
});

test('nodes without a size are skipped rather than reported as zero', () => {
  const out = summariseAllocators({ gpu: { attrs: {} }, canvas: { attrs: { size: { value: '100000' } } } });
  assert.deepEqual(Object.keys(out), ['canvas']);
});

test('an empty or missing dump yields an empty summary', () => {
  assert.deepEqual(summariseAllocators(null), {});
  assert.deepEqual(summariseAllocators({}), {});
});

test('visibility states the JS heap as a fraction of renderer, renderer+GPU and all Chrome', () => {
  const v = describeVisibility({
    jsHeapMB: 65.76, rendererMB: 311.21, gpuMB: 156.48, totalMB: 632.25,
  });
  assert.equal(v.jsHeapAsPercentOfRenderer, 21.1);
  assert.equal(v.jsHeapAsPercentOfRendererPlusGpu, 14.1);
  assert.equal(v.jsHeapAsPercentOfAllChrome, 10.4);
  assert.equal(v.nonJsRendererMB, 245.45);
});

test('a zero denominator reports null rather than Infinity', () => {
  const v = describeVisibility({ jsHeapMB: 10, rendererMB: 0, gpuMB: 0, totalMB: 0 });
  assert.equal(v.jsHeapAsPercentOfRenderer, null);
  assert.equal(v.jsHeapAsPercentOfAllChrome, null);
});
