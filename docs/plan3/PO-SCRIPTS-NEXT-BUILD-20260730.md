# PO Scripts — Next Build (ordered by rows-closed / PO-minute)

**Checkout tip authority:** `manager-d/trade-correctness`  
**MEAS-01** still required before every script (build stamp, account, surface).  
If stamp predates the named fix commit, stop and mark `NEEDS NEW BUILD`.

PO has already run four of these once on **b103**. Each row below states **re-run against fix** vs **first look**.

---

## Rank 1 — M24 identity (Script 1) — ~8 rows / ~8 min

**Highest efficiency.** Directly re-checks the b103 `#5→#942` escape.

| Row | Look type | Why |
| --- | --- | --- |
| Rayan `#4/#5/#9` | **Re-run against fix** | Ran on b103; allocator gate was GREEN but restore display was wrong. Re-run after `2cc949399` / `m24-order-id-restore-stability` ships. |
| Rayan `#11` | **Re-run against fix** | Same M24 identity class; prior allocator-only close. |
| TAL-01908 | **Re-run against fix** | Reopened from fixed; restore gate now exists; needs deployed stamp. |
| TAL-01911 | **First look** (deployed) | Journal registration residual; not closed by allocator or restore gate alone. |
| TAL-01919 | **Re-run against fix** | Reopened; same restore identity class. |
| TAL-01924 | **Re-run against fix** | Reopened; same restore identity class. |
| TAL-01926 | **Re-run against fix** | Node/pytest prune guard fixed; confirm count survives refresh on stamp that includes B train wire-up. |

**Click path:** unchanged from `CANARY-CRITICAL-MONEY-DATA-TESTS-20260730.md` Script 1.  
**Pass:** same IDs after refresh; count stable; next ID advances.

---

## Rank 2 — M10 order mechanics (Script 3) — ~7 rows / ~10 min

| Row | Look type | Why |
| --- | --- | --- |
| TAL-01933 | **Re-run against fix** | Fixed behind `order-single-tp-after-trail`; confirm on stamp. |
| TAL-01932 | **Re-run against fix** | Fixed behind pending close-netting. |
| TAL-01904 | **Re-run against fix** | Fixed behind one-tick pending. |
| TAL-01905 | **Re-run against fix** | Fixed behind lifecycle ownership (seek-guard limb). |
| TAL-01809 | **Re-run against fix** | Fixed behind balance floor. |
| TAL-01810 | **Re-run against fix** | Fixed behind exit-marker spread column. |
| TAL-01796 | **First look** | M10 residual marker check; not independently gated on D tip. |

**Click path:** Script 3 in canary money/data tests.

---

## Rank 3 — M23 rollback (Script 2) — ~5 rows / ~8 min

| Row | Look type | Why |
| --- | --- | --- |
| Rayan `#1` | **Re-run against fix** | Ran on b103; M23 cancel path. |
| Rayan `#3` | **Re-run against fix** | Same. |
| Rayan `#6b` | **Re-run against fix** | Same. |
| TAL-01937 | **Re-run against fix** | Node RED/GREEN rollback gate present; deployed confirm. |
| TAL-01800 | **Re-run against fix** | Lifecycle ownership gate names this row; not the same as rollback oracle alone. |

**Click path:** Script 2. Prefer cancel/remove confirmation path.

---

## Rank 4 — Journal side-effects (Script 5) — ~2 rows / ~6 min

| Row | Look type | Why |
| --- | --- | --- |
| TAL-01927 | **Re-run against fix** | Screenshot idempotent gate GREEN; confirm no second shot after refresh on stamp. |
| TAL-01940 | **First look** | No D-tip product gate yet; first deployed look for post-trade variable cross-wire. |

**Click path:** Script 5.

---

## Rank 5 — Duration (Script 4) — ~1 row / ~4 min

| Row | Look type | Why |
| --- | --- | --- |
| TAL-01896 | **Re-run against fix** | Node oracles GREEN; PO cannot see until `dist-v9` / export rebuild. |

**Click path:** Script 4.

---

## Not in the five (do not spend PO minutes here)

- Bucket (a) `blocked-on-build` M25 / M17-DI2 / M22 — wait for those branches to ship.
- Bucket (b) `owner-blocked` chart.js / replay / layout rows — owner lanes + data scripts, not these five.
- Reclassified 26 — cosmetic / superseded / needs-info — **zero PO minutes**.
- Old-layout Cluster M bulk — `superseded` unless PO reopens with current-surface steps.
