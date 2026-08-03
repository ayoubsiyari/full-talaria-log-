/**
 * ARM-EQUALITY-01 cells. BIND-01: every state demonstrated on input known to produce it, and the RED
 * is the real config as it stands on 2026-08-03 — where the arms differ in duration as well as trades.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareArms, assertArmsComparable } from './arm-equality.mjs';

const BASE = { hours: '10', speed: '10', panels: '4', origin: 'https://x', expectDigest: 'd1', heapCapMB: '4096' };

test('RED on the real config: the arms differ in duration, not only in trades', () => {
  // fire-sealed-soak.mjs as of 2026-08-03: trades 10 h, zerotrade 3.5 h.
  const v = compareArms(
    { ...BASE, hours: '10', closesPerHour: '30', out: 'SEALED-SOAK-TRADES.jsonl' },
    { ...BASE, hours: '3.5', closesPerHour: '0', out: 'SEALED-SOAK-ZEROTRADE.jsonl' },
  );
  assert.equal(v.state, 'ARMS_DIFFER');
  assert.equal(v.comparable, false);
  assert.deepEqual(v.differences.map((d) => d.field), ['hours']);
  assert.match(v.reason, /uninterpretable/);
});

test('the permitted difference alone is comparable', () => {
  const v = compareArms(
    { ...BASE, closesPerHour: '30', out: 'a.jsonl' },
    { ...BASE, closesPerHour: '0', out: 'b.jsonl' },
  );
  assert.equal(v.state, 'ARMS_COMPARABLE');
  assert.deepEqual(v.contrast, [{ field: 'closesPerHour', a: '30', b: '0' }]);
});

test('output paths and labels are bookkeeping, not conditions', () => {
  const v = compareArms(
    { ...BASE, closesPerHour: '30', out: 'a.jsonl', label: 'trades', log: 'a.log' },
    { ...BASE, closesPerHour: '0', out: 'b.jsonl', label: 'zerotrade', log: 'b.log' },
  );
  assert.equal(v.state, 'ARMS_COMPARABLE', 'differing output names must not read as a confound');
});

test('two identical arms are an EMPTY pair, not a safe one', () => {
  const v = compareArms({ ...BASE, closesPerHour: '30' }, { ...BASE, closesPerHour: '30' });
  assert.equal(v.state, 'NO_CONTRAST');
  assert.equal(v.comparable, false, 'a gate that only hunts differences would pass this cleanly');
});

test('a field present on one arm and missing on the other is a difference', () => {
  const v = compareArms({ ...BASE, closesPerHour: '30', sampleMs: '180000' }, { ...BASE, closesPerHour: '0' });
  assert.deepEqual(v.differences.map((d) => d.field), ['sampleMs']);
  assert.equal(v.state, 'ARMS_DIFFER');
});

test('string and number forms of one value are the same condition', () => {
  const v = compareArms({ hours: 10, closesPerHour: 30 }, { hours: '10', closesPerHour: '0' });
  assert.equal(v.state, 'ARMS_COMPARABLE', 'a type-only mismatch would be noise that teaches bypassing');
});

test('an unreadable config refuses rather than passing', () => {
  assert.equal(compareArms(null, {}).state, 'ARM_CONFIG_MISSING');
  assert.equal(assertArmsComparable(null, {}).shouldRefuse, true);
});


/** MATCHED-WINDOW cells, ruled 19:10+01:00: reconcile the duration difference, do not waive it. */

test('a declared window that fits reconciles the duration difference', () => {
  const v = compareArms(
    { ...BASE, hours: '10', closesPerHour: '30' },
    { ...BASE, hours: '3.5', closesPerHour: '0' },
    { comparisonWindowHours: 3.5 },
  );
  assert.equal(v.state, 'ARMS_COMPARABLE_IN_WINDOW');
  assert.equal(v.comparable, true);
  assert.equal(v.window.declaredHours, 3.5);
  assert.match(v.reason, /over that window ONLY/);
});

test('a window LONGER than the shorter arm is unsatisfiable, not a rounding matter', () => {
  const v = compareArms(
    { ...BASE, hours: '10', closesPerHour: '30' },
    { ...BASE, hours: '3.5', closesPerHour: '0' },
    { comparisonWindowHours: 5 },
  );
  assert.equal(v.state, 'ARMS_WINDOW_UNSATISFIABLE');
  assert.equal(v.comparable, false, 'differencing real samples against absent ones must refuse');
});

test('the window reconciles ONLY duration — a second difference still refuses', () => {
  const v = compareArms(
    { ...BASE, hours: '10', speed: '10', closesPerHour: '30' },
    { ...BASE, hours: '3.5', speed: '5', closesPerHour: '0' },
    { comparisonWindowHours: 3.5 },
  );
  assert.equal(v.state, 'ARMS_DIFFER');
  assert.deepEqual(v.differences.map((d) => d.field), ['speed'],
    'a declared window must not become a general waiver');
});

test('without a declared window the duration difference still refuses', () => {
  const v = compareArms(
    { ...BASE, hours: '10', closesPerHour: '30' },
    { ...BASE, hours: '3.5', closesPerHour: '0' },
  );
  assert.equal(v.state, 'ARMS_DIFFER');
});

test('a nonsense window is refused rather than ignored', () => {
  for (const bad of [0, -1, 'soon']) {
    const v = compareArms(
      { ...BASE, hours: '10', closesPerHour: '30' },
      { ...BASE, hours: '3.5', closesPerHour: '0' },
      { comparisonWindowHours: bad },
    );
    assert.equal(v.state, 'ARMS_WINDOW_UNSATISFIABLE', `window ${bad} should refuse`);
  }
});
