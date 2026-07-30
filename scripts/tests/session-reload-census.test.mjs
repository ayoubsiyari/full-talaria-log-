/**
 * The question this census answers is whether counters climb with LOAD COUNT, so
 * the classifier and the process picker are the two places a wrong answer could
 * come from silently.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyLoadSeries, pickPageRenderer } from '../session-reload-census.mjs';

test('a climbing series is named as climbing, with the per-load rate', () => {
  const got = classifyLoadSeries([51303, 97488, 137834]);
  assert.equal(got.verdict, 'CLIMBS-WITH-LOAD-COUNT');
  assert.equal(got.growth, 86531);
  assert.equal(got.perLoad, 43265.5);
  assert.equal(got.ratioLastOverFirst, 2.69);
});

test('a series inside the tolerance band is flat, not climbing', () => {
  const got = classifyLoadSeries([2483, 2490, 2478, 2483]);
  assert.equal(got.verdict, 'FLAT');
});

test('rise-then-fall is separated from monotonic growth', () => {
  const got = classifyLoadSeries([13, 16, 17, 14, 30]);
  assert.equal(got.verdict, 'RISES-NON-MONOTONIC');
});

test('fewer than three loads returns INSUFFICIENT rather than a verdict', () => {
  assert.equal(classifyLoadSeries([100, 200]).verdict, 'INSUFFICIENT');
  assert.equal(classifyLoadSeries([]).verdict, 'INSUFFICIENT');
});

test('gaps from wedged loads do not fabricate a verdict', () => {
  const got = classifyLoadSeries([1000, undefined, null, 1005]);
  assert.equal(got.n, 2);
  assert.equal(got.verdict, 'INSUFFICIENT');
});

test('the page renderer is picked over a spare renderer with no DOM or caches', () => {
  const dumps = new Map([
    [111, { v8: 70, blink_gc: 1.25, malloc: 20 }],
    [222, { v8: 65, blink_gc: 32, web_cache: 28, partition_alloc: 55 }],
  ]);
  assert.equal(pickPageRenderer(dumps).pid, 222);
  assert.equal(pickPageRenderer(dumps).web_cache, 28);
});

test('no dumps yields null instead of a misattributed process', () => {
  assert.equal(pickPageRenderer(new Map()), null);
  assert.equal(pickPageRenderer(null), null);
});
