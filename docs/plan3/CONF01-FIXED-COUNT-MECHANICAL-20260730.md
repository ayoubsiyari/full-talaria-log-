# CONF-01 / D1 — one mechanical fixed count

**Tip:** `b55f66b66` (`manager-d/trade-correctness`)  
**Instrument:** `node scripts/ledger-status-count.mjs`  
**Artifact:** `docs/plan3/LEDGER-STATUS-COUNT-20260730.json` (`talaria.ledger-status-count.v1`)  
**Authority:** DISPATCH-D 15:15 §2 / EVID-01

## Single number

| Gauge | Value |
| --- | ---: |
| **HONEST_FIXED (mechanical)** | **50** |

Prose counts in heartbeats and audit §3 are retired. Re-run the script after every ledger edit.

## Why three gauges disagreed earlier

| Source | Count | Cause |
| --- | ---: | --- |
| `CONF01-GATE-AUDIT-D-20260730.md` §3 | 48 | Arithmetic `51 − 3` against a **stale pre-reopen baseline** (claimed “ledger fixed before CONF-01 = 51” while the 13:20 audit had already cut the column to 38, then repairs landed). Not a live column read. |
| Heartbeat after SEL-01 / TAL-01896 | 50 | Matched the live column at tip `b55f66b66`, but was hand-typed. |
| Director “mechanical scan” | 53 | Not reproduced by `ledger-status-count.mjs` on this tip (emits **50**). Likely a different parse or a mid-edit snapshot. |

## Live column (script output at tip `b55f66b66`)

```
total_rows=148
blocked-on-build=6
closed-scratched=2
feature-request=1
fixed=50
intended=1
needs-info=10
owner-blocked=20
po-eyes=26
superseded=29
verify-gone=3
broken=0
HONEST_FIXED=50
```

## CONF-01 audit re-derive (current column)

**Baseline for this re-derive:** the **current** ledger tip above (not the 51/38 historical snapshots).

Same-pair harness vacuity still stands for the three H-S18/H-S83 tickets, but they are no longer `fixed` — they are `owner-blocked` (routed to **C** for harness restage per Director 15:15 correction). They do **not** subtract from today’s mechanical 50.

Class-3 (`conf01-unshaped`) audit is separate (D2) and may move rows out of `fixed` without calling them `broken`.
