/**
 * Self-test for checklist items 1, 2, 3, 4 and 9 — no browser, no network.
 * node --test scripts/instrument-checklist.selftest.mjs
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ARENA_KEYS,
  arenaColumnName,
  arenaColumns,
  quoteArenaDelta,
  rankRowGrowth,
} from './lib/arena-columns.mjs';
import { gradeSettle, SETTLE_MIN_MS } from './lib/settle-protocol.mjs';
import { abbaSequence, driftBalance, estimateAbbaEffect } from './lib/abba-drift.mjs';

// Real roots from _evidence/manager-C/combined-canvas-fix-run2.json (peak sample).
const PEAK_ROOTS = {
  shared_memory: 7.629, malloc: 38.816, canvas: 15.354, cc: 8.906, gpu: 3.187,
  discardable: 0, v8: 14.391, blink_gc: 14, partition_alloc: 93.5, blink_objects: 9.097,
  web_cache: 0.183, sqlite: 0.152, site_storage: 0, skia: 0.039,
};
const AFTER_ROOTS = {
  shared_memory: 14.273, malloc: 45.272, canvas: 9.687, cc: 13.646, gpu: 7.187,
  discardable: 2.637, v8: 16.9, blink_gc: 15.375, partition_alloc: 94.48, blink_objects: 8.815,
  web_cache: 0.429, sqlite: 0.156, site_storage: 0.001, skia: 0.04,
};

describe('item 1 — ARENA-COLUMNS in soak row format', () => {
  it('emits flat scalar columns, one per arena, named stably', () => {
    assert.equal(arenaColumnName('partition_alloc'), 'arenaPartitionAllocMB');
    assert.equal(arenaColumnName('v8'), 'arenaV8MB');
    const row = arenaColumns(PEAK_ROOTS, { totalPrivateMB: 527.02 });
    assert.equal(row.arenaPartitionAllocMB, 93.5);
    assert.equal(row.arenaCanvasMB, 15.354);
    for (const [k, v] of Object.entries(row)) {
      // null is a valid empty column; an object or array is not, because a soak row is flat.
      assert.ok(v === null || typeof v !== 'object', `column ${k} must be a scalar, not a nested object`);
    }
  });

  it('keeps every column present when an arena is missing from the dump, so row shape never changes', () => {
    const sparse = arenaColumns({ v8: 10 }, { totalPrivateMB: 100 });
    for (const key of ARENA_KEYS) {
      assert.ok(arenaColumnName(key) in sparse, `${key} column must exist even when absent from the dump`);
    }
    assert.equal(sparse.arenaBlinkGcMB, null, 'a missing arena reads null, not 0');
  });

  it('sums arenas outside the canonical list into a labelled column instead of dropping them', () => {
    const row = arenaColumns({ v8: 10, some_new_arena: 4.5 }, { totalPrivateMB: 100 });
    assert.equal(row.arenaOtherNamedMB, 4.5);
    assert.equal(row.arenaOtherNames, 'some_new_arena');
    assert.equal(row.arenaNamedTotalMB, 14.5);
  });
});

describe('item 4 — TOTAL-01 enforcement', () => {
  const peak = arenaColumns(PEAK_ROOTS, { totalPrivateMB: 527.02 });
  const after = arenaColumns(AFTER_ROOTS, { totalPrivateMB: 507.42 });

  it('quotes an arena delta only with its total row, and carries the total in the sentence', () => {
    const q = quoteArenaDelta(peak, after, 'canvas');
    assert.equal(q.quotable, true);
    assert.equal(q.deltaMB, -5.667);
    assert.equal(q.totalBeforeMB, 527.02);
    assert.equal(q.totalAfterMB, 507.42);
    assert.match(q.quotableSentence, /against total 527\.02 -> 507\.42/);
  });

  it('REFUSES a single-arena delta when the total row is absent — the 212 MB failure mode', () => {
    const noTotal = arenaColumns(AFTER_ROOTS, { totalPrivateMB: null });
    const q = quoteArenaDelta(peak, noTotal, 'blink_gc');
    assert.equal(q.quotable, false);
    assert.equal(q.verdict, 'REFUSED_NO_TOTAL_ROW');
    assert.match(q.why, /not quotable without the total row/);
  });

  it('REFUSES when the two totals were measured on different bases', () => {
    const otherBasis = arenaColumns(AFTER_ROOTS, { totalPrivateMB: 507.42, totalBasis: 'renderer-only' });
    const q = quoteArenaDelta(peak, otherBasis, 'v8');
    assert.equal(q.verdict, 'REFUSED_TOTAL_BASIS_MISMATCH');
  });

  it('distinguishes an absent arena from a zero delta', () => {
    const q = quoteArenaDelta(arenaColumns({ v8: 1 }, { totalPrivateMB: 10 }), after, 'canvas');
    assert.equal(q.verdict, 'REFUSED_ARENA_ABSENT');
  });

  it('COV-01: the unattributed remainder is its own row and is never spread across arenas', () => {
    // Named roots total ~205.25 against a 527.02 all-process total.
    assert.ok(peak.arenaUnattributedMB > 300, `remainder ${peak.arenaUnattributedMB}`);
    assert.equal(peak.arenaCoverageMeets95, false, 'coverage is nowhere near 95% yet — item 7 is real work');
    const ranked = rankRowGrowth(peak, after);
    assert.match(ranked.coverageNote, /NOT distributed across arenas/);
    assert.equal(ranked.growers[0].arena, 'shared_memory');
    assert.ok(ranked.shrinkers.some((s) => s.arena === 'canvas'));
  });
});

describe('item 2 — SETTLE-PROTOCOL', () => {
  it('marks a reading compliant only with both a long-enough settle and a real forced collection', () => {
    assert.equal(gradeSettle({ settleWaitedMs: 150_000, forcedGcOk: true }).protocolCompliant, true);
  });

  it('fails a reading taken before the settle floor — the lazy-decommit trap', () => {
    const g = gradeSettle({ settleWaitedMs: 5_000, forcedGcOk: true });
    assert.equal(g.protocolCompliant, false);
    assert.match(g.why, /decommit/);
  });

  it('fails a pause-only reading, because pause releases nothing', () => {
    const g = gradeSettle({ settleWaitedMs: SETTLE_MIN_MS, forcedGcOk: false });
    assert.equal(g.protocolCompliant, false);
    assert.match(g.why, /pause has been shown to release nothing/);
  });

  it('names an over-band settle without failing it', () => {
    const g = gradeSettle({ settleWaitedMs: 600_000, forcedGcOk: true });
    assert.equal(g.protocolCompliant, true);
    assert.match(g.overBandNote, /exceeds/);
  });
});

describe('item 3 — DRIFT-ABBA', () => {
  it('one block is ABBA and cancels linear drift exactly', () => {
    assert.deepEqual(abbaSequence(1), ['A', 'B', 'B', 'A']);
    const b = driftBalance(abbaSequence(1));
    assert.equal(b.cancelsLinearDrift, true);
    assert.equal(b.cancelsQuadraticDrift, false, 'one block cannot cancel curvature');
  });

  it('two blocks mirror to BAAB and cancel curvature too — why one control arm is insufficient', () => {
    assert.deepEqual(abbaSequence(2), ['A', 'B', 'B', 'A', 'B', 'A', 'A', 'B']);
    const b = driftBalance(abbaSequence(2));
    assert.equal(b.cancelsLinearDrift, true);
    assert.equal(b.cancelsQuadraticDrift, true);
  });

  it('recovers a known effect through a NON-LINEAR drift that a single paired arm would misread', () => {
    // Truth: treated arm A sits 20 MB below control B. Session drift is quadratic in slot index.
    const arms = abbaSequence(2);
    const drift = (t) => 100 + 8 * t + 3 * t * t;
    const readings = arms.map((arm, t) => ({
      arm,
      vector: {
        totalPrivateMB: drift(t) + (arm === 'A' ? -20 : 0),
        arenaV8MB: drift(t) / 10 + (arm === 'A' ? -2 : 0),
      },
    }));
    const got = estimateAbbaEffect(readings);
    assert.equal(got.verdict, 'MEASURED');
    assert.equal(got.balance.cancelsQuadraticDrift, true);
    assert.equal(got.total.effectAMinusB, -20, 'ABBA+BAAB removes both drift terms exactly');
    assert.equal(got.columns.find((c) => c.column === 'arenaV8MB').effectAMinusB, -2);

    // The naive equal-duration control (first A against first B) is badly wrong on the same data.
    const naive = readings[0].vector.totalPrivateMB - readings[1].vector.totalPrivateMB;
    assert.notEqual(naive, -20);
    assert.ok(Math.abs(naive - -20) > 5, `naive single-pair estimate ${naive} is off by more than 5 MB`);
  });

  it('VOIDs a single A/B pair rather than reporting an uncontrolled difference', () => {
    const got = estimateAbbaEffect([
      { arm: 'A', vector: { totalPrivateMB: 100 } },
      { arm: 'B', vector: { totalPrivateMB: 120 } },
    ]);
    assert.equal(got.verdict, 'VOID');
    assert.match(got.why, /at least two readings per arm/);
  });

  it('TOTAL-01 again at estimator level: no total column means per-arena effects are not quotable', () => {
    const arms = abbaSequence(1);
    const got = estimateAbbaEffect(arms.map((arm, t) => ({ arm, vector: { arenaV8MB: 10 + t } })));
    assert.equal(got.quotable, false);
    assert.match(got.quotableWhy, /TOTAL-01/);
  });
});

describe('item 9 — forced-GC pause-probe retires pause-and-wait', () => {
  it('the soak imports the forced-GC probe and no longer imports the retired one', async () => {
    const src = await (await import('node:fs/promises')).readFile('scripts/sealed-two-arm-soak.mjs', 'utf8');
    assert.match(src, /forced-gc-pause-probe\.mjs/);
    assert.doesNotMatch(src, /from '\.\/lib\/pause-probe\.mjs'/);
    assert.doesNotMatch(src, /\bawait pauseProbe\(/);
  });

  it('the probe module reports both floors so the retirement is evidenced per run', async () => {
    const src = await (await import('node:fs/promises')).readFile('scripts/lib/forced-gc-pause-probe.mjs', 'utf8');
    for (const field of ['pauseOnlyFloorMB', 'forcedGcFloorMB', 'pauseAndWaitInflationMB']) {
      assert.match(src, new RegExp(field));
    }
  });

  it('the soak sampler carries arena columns on the same row as footprintTotalMB', async () => {
    const src = await (await import('node:fs/promises')).readFile('scripts/sealed-two-arm-soak.mjs', 'utf8');
    assert.match(src, /readArenaColumns\(session\.browser, footprint\.footprintTotalMB\)/);
    assert.match(src, /\.\.\.arenas,/);
  });
});
