# Apply PO answers — `PO-DECISIONS-23-ROWS-20260730.docx`

**2026-07-30** · Manager D · Director `e982c3ce5`  
Source extracted to `docs/plan3/PO-DECISIONS-23-ROWS-20260730.extracted.txt`  
**Do not re-ask the PO.**

## The 10 `needs-info` rows (ledger applied)

| Ticket | PO answer | New status | Note |
|---|---|---|---|
| TAL-01784 | **NO** | `feature-request` | Time-only presets — not wanted |
| TAL-01814 | **NO** | `feature-request` | SMC webhook — not wanted |
| TAL-01849 | **AFTER** | `feature-request` | Text/drawing templates — post-canary |
| TAL-01851 | **AFTER** | `feature-request` | Layout template save — post-canary |
| TAL-01852 | **AFTER** | `feature-request` | Hide-future-candles mode — post-canary |
| TAL-01906 | **AFTER** | `feature-request` | SMT compare — post-canary |
| TAL-01907 | **AFTER** | `feature-request` | ATR bands — post-canary |
| TAL-01915 | **AFTER** | `feature-request` | COT / OI — post-canary |
| TAL-01891 | **YES** (same memory campaign) | `owner-blocked` → **A** | Normal session + trades on one pair → multi-GB; folds into A's 730 MB/h hunt |
| TAL-01892 | **NOT SURE** / wait for fix build | `blocked-on-build` | PO will not retest idle-lag until memory/lag train lands |

`needs-info` after apply: **0**.

## Other docx answers folded (not in the 10, still applied)

| Ticket | PO answer | Ledger action |
|---|---|---|
| TAL-01850 | **BLOCKER** | stays `owner-blocked` **A** (keyboard) — canary blocker confirmed |
| TAL-01677 | "We already fix this" | `verify-gone` — PO asserts fixed; no re-ask |
| TAL-01893 | skip forward; unsure if still present | stays `owner-blocked` **A** — confirm on next visual if time |
| TAL-01744 | snap like TV; no cross-layout inherit | already `intended` — no change |
| TAL-01941 | intermittent SL/TP; works in PO testing | already `fixed` (soak) — no change |
| TAL-01854 | **REAL** | reopen → `owner-blocked` **A** (TF downshift / auto-follow family) |
| TAL-01894 | missing label colour in template settings | stays `feature-request` (AFTER-class) |
| TAL-01912 | genuinely scratched | stays `closed-scratched` |
| TAL-01920 | PO wrote REOPEN | `po-eyes` — add to next visual if capacity; not in the 26 pack |
| Rayan #7 / #10 | REOPEN | stay `verify-gone` with positive-absent duty (already set) |

Rayan #2 / #8 recognition lines: #2 already on-wire by runtime probe; #8 build-blocked → B.
