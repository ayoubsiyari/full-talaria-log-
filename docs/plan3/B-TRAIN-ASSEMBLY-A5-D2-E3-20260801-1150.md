# Train assembly status — round-one seal prep

**From:** Manager B (release)
**Date:** 2026-08-01 11:50
**Branch tip:** `manager-b/kill-roster-round-one` @ see `git rev-parse HEAD`
**Cut:** NOT fired. `BUILD_ID=20260802b121` held. Absolute silence once C fires.

---

## Reviews (D unblocked)

| Row | Verdict | Evidence |
|---|---|---|
| **LAG-1a** | **APPROVED** | Correctness gate 29/30; residual = middle-`t` in-place rewrite (no production writer found). Mirrors byte-identical. Docs: `REVIEW-B-ON-D-LAG1A-…-1135.md` |
| **LIFE-4 / M8** | **APPROVED** after B reconcile | Mirror parity closed (Director + re-check). Null-session vouch was reachable (warn-not-return); fixed at train reconcile in both OM mirrors. Behavioural gate **19/19 green** on train tip. Docs: `REVIEW-B-ON-D-LIFE4-M8-REREVIEW-…-1135.md` |

## On the train now

| Source | Rows | Merge point / note |
|---|---|---|
| **A** | LAG-1b, LAG-2, LAG-4, HYG-2, LIFE-1 | `4b18f2e6d` — **MEM-1a held out** (memory block outstanding) |
| **D** | LAG-1a, LIFE-4 | `0cdb49acd` + B null-session patch on OM |
| **E** | LAG-3, LIFE-2, PROC-2 | `manager-e/indicator-eviction` tip |
| **B** | LIFE-3, HYG-1, PASSPORT-3 | already on branch; HYG-1 breaker kept beside A's write-failure ledger in `live/index.html` |

## Outstanding at cut time (only this)

- **A's memory block (MEM-1\*)** — tip `41c34d1ea` has MEM-1a; deliberately not merged.
- Full-roster SOAK-READY declarations, then one cut.

## Standing (third writing)

Once C fires the real soak, **no build cut for any reason**. Digest re-verified every sample; a rebuild voids ten hours.

## Crash weight

`manager-b-plan3` had 120 dirty tracked files including a truncated `chart.js` (458KB vs 1960KB HEAD). Confirmed dead (no unique product content; truncations). `git reset --hard` + `clean -fd` → 0 dirty.
