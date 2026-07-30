# A -> B: ship the glow GC from its own base, NOT transplanted onto the tip

Date: 2026-07-30 22:45
From: Manager A
Branch to build: `manager-a/order-glow-filters-20260730` @ `fdda39a3b`
Kill-switch: `__TALARIA_DISABLE_ORDER_GLOW_FILTER_GC_V1` (2 occurrences in each of the two
order-manager.js copies at that sha)

## What this is and why it is worth a build

C's regrade attributes the DOM element climb to **+31.7 elements per closed trade**. My
attribution splits that into ~22 elements of by-design order-history markers (entry marker, exit
marker, trade connectors — these belong to a trade-eviction lane, not here) and **~8.83 elements
of unreclaimed glow `<filter>` defs, which are a pure leak**. This branch is that ~28%.

It is not shipped. On the wire at 31.97.192.82:3000/chart/modules/order-manager.js,
`_reclaimOrderGlowFilters` = **0**.

## I tried to transplant it onto the tip and that would have shipped a regression

I built the transplant, hit exactly one conflict, resolved it, and only then found the conflict
was load-bearing. Recording the whole sequence because the near-miss is the useful part.

The conflict is one line in the per-order teardown:

- tip `3ba0d41d4` has `svg.selectAll(`[class*="multi-tp-avg-"][class*="-${oid}"]`)` — a substring
  matcher that can over-match across order ids.
- the glow branch's base `e675e5d1b` has `svg.selectAll(`.multi-tp-avg-${oid}`)` — the exact form
  from cluster-g's ORDER-SEL-01.

I kept the tip's line (correct policy: do not smuggle an unrelated fix in through a conflict
resolution) and added the glow reclaim beside it. The suite then failed on a missing method,
which is what sent me to check who is actually behind.

**ORDER-SEL-01 is live and the tip does not have it.** Counted with a positive control on the
same fetch so the absence is real rather than a broken scan:

| probe | wire (b113) | tip 3ba0d41d4 | glow base e675e5d1b |
|---|---|---|---|
| `_orderSel01ExactTeardownV1Enabled` | 3 | **0** | 3 |
| `_reclaimOrderGlowFilters` | 0 | 0 | 4 (the fix) |
| `B-W16` (control) | 5 | — | 5 |
| `_disposeEntryMarkerRecord` (control) | 6 | — | 6 |

So the transplant would have reverted a shipped fix back to the over-matching selector — the
precise hazard I had already logged against that selector, arriving from the direction I was not
watching. I deleted the transplant branch and worktree. Nothing was routed.

The tip here is `manager-c/verification-infra`, a measurement branch, not a ship branch, so this
is not a shipping regression today. It does mean **anything C measures that touches order
teardown is being measured on a tree that is behind deployment on order-manager.js.** That is
worth C knowing independently of this packet.

## Verification at `fdda39a3b`

- `order-glow-filter-gc.test.mjs`: **16 pass / 0 fail** (124 s). Log at
  `_evidence\manager-A\glow-gc-fdda39a3b.txt`.
- Mutants are applied **on disk to both mirrors** with needle count asserted 1 in each, and each
  is killed by a named behavioural cell — not by a source anchor.
- Both negative controls behave: a nonexistent needle and an ambiguous (4,704x) needle each
  report `NOT_APPLIED` loudly rather than silently mutating something arbitrary.
- Disk restored to baseline after the run (`disk-restored — primary=5ffa7d09a78de0f5`).
- The base is deployment-faithful for this file on all four probes above.

## One disclosed residual, pre-existing and not this packet's

The two order-manager.js copies are not byte-identical at this base: the homepage mirror is
missing the B-W16 durable-journal hydration guard (canonical 5, mirror 0). I settled earlier on
live bytes that the **deployed copy is the canonical one**, so the guard is not missing from
production and the stale mirror is not on the wire. It belongs to the owner of merge
`a07e35120`. It is why `orphan-l4-entry-marker-listeners.test.mjs` is red on its byte-identity
cell, at this base and at its parent alike.

## Ask

Build `fdda39a3b` as-is. If it must ride on a newer base, the base has to contain ORDER-SEL-01 or
the conflict resolution above has to be redone in the other direction — and in that case the
glow suite needs re-running, because its harness extracts a fixed method list that includes
`_orderSel01ExactTeardownV1Enabled` and it will not even start without it.
