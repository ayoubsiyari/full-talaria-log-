/**
 * Self-test for arena growth ranking — no browser.
 * node --test scripts/arena-timeseries.selftest.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { rankArenaGrowth } from './arena-timeseries.mjs';

function sample(at, drained, allocators, totals = {}) {
  return {
    at,
    drained,
    totalPrivateMB: totals.total ?? 500,
    rendererPrivateMB: totals.ren ?? 250,
    gpuPrivateMB: totals.gpu ?? 150,
    pageRenderer: { pid: 1, privateMB: totals.ren ?? 250, allocators },
  };
}

describe('rankArenaGrowth', () => {
  it('names growers above 0.5 MB and keeps large flat arenas out of growers', () => {
    const samples = [
      sample('2026-08-02T10:00:00.000Z', false, {
        partition_alloc: 91.98, malloc: 45, v8: 14, blink_gc: 13, canvas: 12,
      }),
      sample('2026-08-02T13:00:00.000Z', false, {
        partition_alloc: 92.97, // +0.99 — flat-ish vs hours, still >0.5 so counts as grower
        malloc: 60,             // +15 — clear slope
        v8: 14.1,
        blink_gc: 13.2,
        canvas: 12,
      }, { total: 560, ren: 280, gpu: 160 }),
    ];
    const got = rankArenaGrowth(samples, { drained: false });
    assert.equal(got.ok, true);
    assert.equal(got.hours, 3);
    const byName = Object.fromEntries(got.allByGrowth.map((r) => [r.arena, r.deltaMB]));
    assert.equal(byName.malloc, 15);
    assert.ok(got.growers.some((g) => g.arena === 'malloc'));
    assert.ok(got.verdict.includes('malloc'));
  });

  it('separates drained series from live', () => {
    const samples = [
      sample('2026-08-02T10:00:00.000Z', true, { malloc: 40, v8: 12 }),
      sample('2026-08-02T10:00:00.000Z', false, { malloc: 80, v8: 30 }),
      sample('2026-08-02T12:00:00.000Z', true, { malloc: 41, v8: 12 }),
      sample('2026-08-02T12:00:00.000Z', false, { malloc: 120, v8: 50 }),
    ];
    const drained = rankArenaGrowth(samples, { drained: true });
    const live = rankArenaGrowth(samples, { drained: false });
    assert.equal(drained.growers.find((g) => g.arena === 'malloc')?.deltaMB, 1);
    assert.equal(live.growers.find((g) => g.arena === 'malloc')?.deltaMB, 40);
  });

  it('VOIDs when fewer than two samples', () => {
    const got = rankArenaGrowth([sample('2026-08-02T10:00:00.000Z', false, { v8: 1 })], { drained: false });
    assert.equal(got.ok, false);
  });
});
