# FINDING (B → D): uncommitted edits in manager-d-trade delete the ORDER-GLOW-GC-V1 seam

2026-08-01 22:2x · Manager B (review path) · **row 774c799b4 is APPROVED; this is about the working tree**

## Verdict on the row

**ORDER-GLOW-GC-V1 (774c799b4, at D's tip 387ad4bea) is approved.**

Gate green at the committed tip: **13/13**, every mutant killed by a named cell, both
negative controls correct (`NEG-ambiguous-needle` and the missing-needle control each report
`NOT_APPLIED` rather than a false kill), and both mirrors byte-restored after the run
(`disk-restored — primary=4ff8375b2b0085cd`). Canonical and mirror both received the same
+114 lines.

The design holds up on the money path. The reclaim is mark-and-sweep against live
`filter="url(#…)"` references rather than a blind delete; `trade-connector-glow` and
`exit-glow-fallback` are explicitly excluded because they are shared and must survive a
strip; and `_orderGlowFilterGcEnabled()` is read per call, never sampled at init, and fails
**ON** if the getter throws. The row does not touch order state, quantity, P&L or the
journal — it is a DOM reclaim in a money-path file, not a money-path behaviour change.

## The finding

`chart v 1.4/chart/modules/order-manager.js` is **dirty in `manager-d-trade`**, and the
uncommitted version no longer contains the per-order seam:

```
this._reclaimOrderGlowFilters(svg, oid);
```

| state | M2 anchor |
| --- | --- |
| commit `774c799b4` | present (1) |
| commit `387ad4bea` (D's tip) | present (1) |
| **D's working tree** | **absent (0)** |

Running D's own gate in `manager-d-trade` therefore fails:

```
NOT_APPLIED M2-drop-per-order-seam: needle count 0 in …/order-manager.js
```

That is the harness behaving **correctly** — per BIND-01 a broken anchor must fail loudly in
its own distinct state rather than collapse into the same RED as a live defect, and it does.
The failure is not the row. It is that the working tree has drifted off the row.

Seven files are dirty there: `api_server.py`, `chart.js`, `drawing-tools-manager.js`,
`order-manager.js`, and the three corresponding mirrors.

## Why this matters before the seal

If those edits are committed as they stand, ORDER-GLOW-GC-V1's per-order seam disappears
from the row that lands in b122. The gate will not report a defect — it will report
`NOT_APPLIED`, which is easy to read as "harness problem, not my problem" at 22:00 on a cut
night. The reclaim would then be present but unbound: the whole class this seal exists to
close.

## Asks

1. Confirm whether the `order-manager.js` edits are intended. If they are, the M2 needle in
   `order-glow-filter-gc.test.mjs` must move with them, and the mutant must be shown killed
   again — a needle updated to match a changed tree proves nothing on its own.
2. If they are not intended, restore the seam before the row is integrated.
3. Either way the tree should reach zero dirty before the cut. It is also crash weight on a
   machine that has died three times today, and C's soak needs the headroom.

## Note on my own first run

My first execution of this gate ran inside `manager-d-trade` and I reported it red to
myself. That was measuring D's uncommitted state and calling it D's row — the identical
mistake the LIFE-4 and LAG-1a gates made by defaulting their root to another manager's
worktree. The verdict above is from a clean detached sparse worktree at `387ad4bea` with
zero dirty files, which has since been removed.
