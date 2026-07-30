/**
 * The census reports two things a cut will be decided on: which subtrees are
 * biggest, and whether a count grows while nothing is happening. A leak and a
 * design cost want different fixes, so the classifier must not confuse them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { classifyIdleSeries, topGroups } from '../dom-node-census.mjs';

test('groups rank by count and the head is kept', () => {
  const top = topGroups([
    { key: 'div', count: 10 }, { key: 'span', count: 99 }, { key: 'img', count: 50 },
  ], 2);
  assert.deepEqual(top.map((r) => r.key), ['span', 'img']);
});

test('groups accept a plain count map as well as rows', () => {
  const top = topGroups(new Map([['a', 3], ['b', 7]]));
  assert.deepEqual(top, [{ key: 'b', count: 7 }, { key: 'a', count: 3 }]);
});

test('a flat series is a design cost, not a leak', () => {
  const r = classifyIdleSeries([2483, 2483, 2483]);
  assert.equal(r.verdict, 'FLAT (design cost)');
  assert.equal(r.delta, 0);
});

test('a monotonically rising series while idle is leak-shaped', () => {
  const r = classifyIdleSeries([1000, 1600, 2200]);
  assert.equal(r.verdict, 'GROWING-WHILE-IDLE (leak-shaped)');
  assert.equal(r.delta, 1200);
});

test('rising then falling is NOT leak-shaped, because falling proves collection', () => {
  // The real Performance Monitor node series: 9132 -> 17644 -> 10614.
  const r = classifyIdleSeries([9132, 17644, 10614]);
  assert.equal(r.verdict, 'RISING-NON-MONOTONIC');
  assert.equal(r.monotonic, false);
});

test('a falling series is reported as falling rather than flat', () => {
  assert.equal(classifyIdleSeries([5000, 3000]).verdict, 'FALLING');
});

test('one sample cannot classify anything', () => {
  assert.equal(classifyIdleSeries([42]).verdict, 'INSUFFICIENT');
});

test('noise inside tolerance still reads as flat', () => {
  assert.equal(classifyIdleSeries([2483, 2500, 2470], { tolerance: 50 }).verdict, 'FLAT (design cost)');
});
