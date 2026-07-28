# Plan 3 — 48-hour conclusion plan

**Issued:** 2026-07-28 09:30 · **Deadline:** 2026-07-30 09:25 · **Authority:** PO decision, this document supersedes all prior sequencing in `DIRECTOR-RULINGS-20260727.md` where they conflict.

## 1. What "concluded" means — PO ruling

Plan 3 will be **concluded, not completed.** At 09:25 Thursday the product is open to a canary cohort of 10–20 experienced traders, seeded with Ninja, Ibrahim and Rayan.

The PO's two decisions, which settle every trade-off below:

1. **Ship honest and non-lossy.** The chart must not state a falsehood about market data, and must not lose the user's work. Speed is not the bar.
2. **If the cheap memory fix is weeks rather than days, disclose the ceiling and ship anyway.** Do not slip, do not cap panels.

**The reasoning, so nobody re-litigates it at hour 40:** an experienced trader will forgive a heavy chart that is documented as heavy. They will not forgive a Saturday candle on a forex pair, a stop-loss line that vanishes, or a trade that goes missing — because each one destroys confidence in every other number on screen. Trust is the ship gate; performance is a disclosure.

## 2. Ship gates — MUST be true, no exceptions

These are the only items that can block the canary. Anything not on this list does not block it, regardless of how annoying it is.

| # | Gate | Owner | Why it blocks |
|---|---|---|---|
| **M1** | `indicator-performance.js` present and executing on **every** servable surface; presence assertions per §A4c live at build and runtime | A | Absent, the host computes displayed values with a different algorithm than the panels. Two unproven answers on one screen. |
| **M2** | Session calendar correct per §A16.3 — no phantom Saturday, no missing Friday, weekly anchored to the instrument class | A | The chart currently states a falsehood about the market. |
| **M3** | Order lines do not vanish and do not cross-delete siblings — eviction discriminator plus the substring-selector narrowing, with the collision hypothesis tested | B | A missing stop-loss line is a money-path visual defect. |
| **M4** | M23/M24 re-verified **on the deployed build**, by PO and Rayan — trades not lost, not duplicated, IDs stable | B | A journal that loses trades is worse for a tester cohort than a slow chart. |
| **M5** | Differential parity oracle green on **the families the canary will actually use**, not all families | C | `rollingSmaFast` versus the naive path have never been proven equal, and the fast path just went live on the host. |
| **M6** | `degradedModules[]` live in the support passport | C | Our only early-warning if a surface silently loses a module during canary. |
| **M7** | Known-limitations note published; ticket Area field pre-flagged for the multichart ceiling | Director | Converts the ceiling from a surprise into a disclosure, and auto-clusters those reports into one row. |

**Deliberately narrowed:** M5 is scoped to canary-used families. Full coverage is post-conclusion. Long-series drift cells stay in scope for the families in M5, because a running add-new/subtract-old sum drifts on the three-year ranges these testers load.

## 3. High value, does not block

Land if ready; do not hold the canary for any of them. In priority order: V8 pin persistence · trade duration clock after rollback · unmarked-forming-candle presentation fix · remaining V6 drag defects · crosshair time label during replay · timeframe-reset on multichart reload.

## 4. Deferred, named, disclosed — not abandoned

- **C3a-full single-data-owner refactor.** Weeks. Not attempted.
- **The multichart memory ceiling.** If §1.2's residency cap is days, it ships; if weeks, it is disclosed. Either way the 3.5 GB single-layout figure must be re-measured on the corrected build before anything is claimed about it, per §A2.
- **Full differential oracle coverage** beyond M5's families.
- **The remaining ticket corpus** past the rows above.

Each carries a one-line disposition in the closing report. **A deferred item is a stated decision, never a silence** — that distinction is the whole difference between concluding and trailing off.

## 5. Schedule

| Mark | Time | Required |
|---|---|---|
| **T+6h** | Tue 15:15 | Chain clear: M1 closed · real re-measurement on the fixed build (§A2) · **written answer to §1.2** (residency cap independently shippable: yes/no, effect on mixed-4, days). Director makes the foundation-shape call in that hour and does not revisit it. |
| **T+12h** | Tue 21:25 | First canary-candidate build on TEST. One batched PO session, ~30 min. |
| **T+24h** | Wed 09:25 | M1–M3 landed and gated. M5 green on its narrowed set. |
| **T+36h** | Wed 21:25 | Canary build sealed. **M4 re-verified on the deployed build.** M6 live. M7 published. PO go/no-go. |
| **T+48h** | Thu 09:25 | Canary open. Closing report issued with the §4 dispositions. |

## 6. Go/no-go — pre-registered, not negotiated later

Unchanged from §Part 5 and restated because it now has a date:

- **HARD STOP:** any wrong-value report — indicator values, PnL, trade ledger, lost or duplicated trades. Halt promotion, do not widen the cohort.
- **HARD STOP:** any novel mechanism that is not already a row on the board.
- **PROCEED:** complaints matching the documented multichart ceiling. Those confirm the model rather than surprising it.
- **WATCH:** tickets per tester per hour. If 15 testers extrapolate to a flood at 100, stagger the remaining cohort rather than opening at once.

## 7. Standing constraints for the next 48 hours

1. **The two managers on the chain take on nothing new until the chain clears.** Breadth is how three days produced motion without closure.
2. **Side lanes run in parallel and are not cut** — C's oracle and B's independent rows do not touch the chain, and holding free parallel capacity is waste, not discipline.
3. **No manager idles waiting for a person.** Blocked on a ruling → log `ASSUMPTION` with a default-in-force and continue. Six hours were lost to silence on the night of the 27th.
4. **§A16.5 holds even under deadline:** an ungated file is not part of an automated-GREEN chain, and review confidence is not gate coverage. **Schedule pressure is not a reason to relax a gate** — it is the exact condition under which this project has previously shipped things it had not verified.
5. **Every remaining verdict states `surface=`, `coverage=`, and whether it is a wiring or a soundness check** (VER-01). A closure without verification context is what made us believe a cure was live for days.
