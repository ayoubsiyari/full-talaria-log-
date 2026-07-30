/**
 * Criterion 0 helpers.
 *
 * A threshold below the instrument's own variance grades noise, so the spread
 * summary and the frame-list diff are the two things that must not be wrong:
 * one sets the floor a claim has to clear, the other turns "13 documents versus
 * 18" from a mystery into a named list.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { describeSpread, diffFrameLists } from '../fresh-load-census.mjs';

test('spread reports median, not just mean, and the full range', () => {
  // Median matters because one wedged load should not move the centre.
  const s = describeSpread([10, 11, 12, 13, 400]);
  assert.equal(s.n, 5);
  assert.equal(s.median, 12);
  assert.equal(s.min, 10);
  assert.equal(s.max, 400);
  assert.equal(s.spread, 390);
  assert.ok(s.mean > s.median, 'the outlier should pull the mean above the median');
});

test('an even sample averages the two middle values', () => {
  assert.equal(describeSpread([1, 2, 3, 4]).median, 2.5);
});

test('non-finite readings are excluded rather than poisoning the summary', () => {
  const s = describeSpread([5, null, undefined, NaN, 7]);
  assert.equal(s.n, 2);
  assert.equal(s.median, 6);
});

test('an empty sample reports n=0 instead of NaN', () => {
  assert.deepEqual(describeSpread([]), { n: 0 });
});

test('the frame diff names the documents the high load has and the low load does not', () => {
  const low = [{ url: '<origin>/shell' }, { url: '<origin>/panel?id=B' }];
  const high = [
    { url: '<origin>/shell' },
    { url: '<origin>/panel?id=B' },
    { url: '<origin>/panel?id=C' },
    { url: 'about:blank' },
  ];
  const d = diffFrameLists(low, high);
  assert.equal(d.lowCount, 2);
  assert.equal(d.highCount, 4);
  assert.deepEqual(d.onlyInHigh.map((r) => r.url).sort(), ['<origin>/panel?id=C', 'about:blank']);
  assert.deepEqual(d.onlyInLow, []);
});

test('duplicate urls are counted, so two extra copies of one url are visible', () => {
  const d = diffFrameLists(
    [{ url: 'about:blank' }],
    [{ url: 'about:blank' }, { url: 'about:blank' }, { url: 'about:blank' }],
  );
  assert.deepEqual(d.onlyInHigh, [{ url: 'about:blank', extra: 2 }]);
});
