# Plan 3 — 48-hour conclusion plan

**Issued:** 2026-07-28 09:30 · **Deadline:** 2026-07-30 09:25 · **Authority:** PO decision, this document supersedes all prior sequencing in `DIRECTOR-RULINGS-20260727.md` where they conflict.

## 1. What "concluded" means — PO ruling

Plan 3 will be **concluded, not completed.** At 09:25 Thursday the product is open to a canary cohort of 10–20 experienced traders, seeded with Ninja, Ibrahim and Rayan.

The PO's two decisions, which settle every trade-off below:

1. **Ship honest and non-lossy.** The chart must not state a falsehood about market data, and must not lose the user's work. Speed is not the bar.
2. **If the cheap memory fix is weeks rather than days, disclose the ceiling and ship anyway.** Do not slip, do not cap panels.

**The reasoning, so nobody re-litigates it at hour 40:** an experienced trader will forgive a heavy chart that is documented as heavy. They will not forgive a Saturday candle on a forex pair, a stop-loss line that vanishes, or a trade that goes missing — because each one destroys confidence in every other number on screen. Trust is the ship gate; performance is a disclosure.

## 1.5 PRIORITY ZERO — CPU (PO directive, 2026-07-28 11:03)

**"Get the CPU usage down."** Evidence: `FINDING-CPU-NOT-MEMORY-20260728.md` — 129.3% tab CPU against FX Replay's 24.0 on the same machine with **no indicators loaded**, memory at parity. Owner: **A**. This outranks everything except M4's trade-loss path.

**No CPU work is authored before the five measurements below land.** Every performance number this project holds was taken on a build whose optimisation module was not loaded, and we have twice spent days on a mechanism that measurement then destroyed. Measure, then cut.

### The measurements, all cheap, all today

**0. FIRST, because it decides which of the rest matter: a Chrome Performance recording with the Scripting / Rendering / Painting / System breakdown**, taken on the PO's protocol. Thirty seconds of work, and it partitions the whole problem:

- **Dominated by Scripting** → the cost is computation and render amplification. GPU offload is irrelevant; the fixes are items 1–3 below.
- **Dominated by Painting/Rendering** → surface and layer strategy is the cost, item 4 becomes primary, and GPU/compositing work is justified.

**This answers the PO's GPU question with a measurement rather than an argument.** The prior expectation is Scripting-dominant, on three grounds: canvas is already GPU-composited so no switch is unflipped; the GPU cannot resample arrays or recompute indicators, which are our two leading suspects; and our GPU residency is already **4.5x the competitor's**, which reads as over-rendering rather than underuse. **Prior expectations have been wrong three times this week — take the recording.**

1. **`_mcDiag.resamples` per replay tick.** The standing hypothesis is that M20-Q9's correctness-driven cache invalidation forces a **full-array resample every tick** — O(history) work per tick, which alone would account for a multiple of CPU. The counter already exists. **This is the highest-yield single number available and it has been outstanding since yesterday.** Run it pinned to A's tip per TREE-01.
2. **Render amplification: renders per data commit.** A's own 12-second window measured **50 paints, 50 renders, 2 commits** — **25 renders per data change.** Establish whether that ratio is necessary. A chart whose data changed twice should not repaint fifty times, and forming-candle animation does not obviously justify 25:1.
3. **Main-thread share.** What fraction of per-tick work executes on the main thread versus the indicator worker. The competitor runs several dedicated workers while our tab burns more than a full core with no indicators — the hypothesis is that our deficit is *where* work runs, not algorithmic cost.
4. **Live canvas/SVG layer count and dimensions**, ours against FX Replay's. Our GPU residency is 154 MB against their 34 MB for a comparable chart, which points at unpooled or oversized render surfaces rather than data volume.
5. **Orphaned per-frame work after multichart teardown** — already dispatched as the residue census. Orphaned rAF loops are CPU by definition and this measurement serves both rows.

### Acceptance and honesty

**Acceptance criterion for any CPU change: measured tab CPU on the PO's protocol** — two panels, replay running, stated indicator count, fresh window. Not a synthetic benchmark, not a frame counter in isolation.

**Stated plainly so nobody discovers it at hour 40:** the 4–5x gap is architectural and predates Plan 3. **Closing it fully inside 46 hours is not credible and will not be claimed.** What is credible is finding and cutting the largest contributors — and if measurement 1 or 2 comes back as expected, one of them is a large multiple rather than a percentage. **Any reduction is reported as a measured before/after pair on the PO's protocol, never as a description of work done.**

**§1.2 is restated:** the foundation increment is chosen on **CPU per tick and per frame**, with memory secondary. A proposal that halves memory and leaves CPU unchanged does not address the deficit and will not be selected.

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

Land if ready; do not hold the canary for any of them. In priority order: **replay speed cap (below)** · V8 pin persistence · trade duration clock after rollback · unmarked-forming-candle presentation fix · remaining V6 drag defects · crosshair time label during replay · timeframe-reset on multichart reload.

### 3.1 Replay speed cap — PO decision, 2026-07-28 09:32

**The existing 10x becomes the hard maximum.** No redefinition of the speed scale: every option above the one currently labelled 10x is removed, and the current speeds keep their present meaning and feel. Hard ceiling — no hidden flag, no user unlock.

Owner: **A** (replay scheduler). Non-blocking for the canary.

**WITHDRAWN — the payoff claim was false and is retracted (Director, 09:55, on A's measurement).** I wrote that a 10x ceiling makes `updateChartDataFast` unreachable and therefore retirable. Measurement destroys the premise in both directions:

- **Single-chart:** the fast-mode threshold is **1875x**, and `normalizeSpeed()` already clamps to 100. The path is **already unreachable on single-chart today at any speed the product offers** — cap or no cap.
- **Multichart** with two or more panels including a finer peer: the 1D host engages fast mode above roughly **1.30x**. It therefore runs at 10x, at 5x and at **2x**. The cap is irrelevant to its only live reachability.

**Also correcting my own figure:** the "~60x" above is accurate only for the *legacy* branch, which runs solely when the coherence kill-switch is disabled. The default branch is the `realTimeCandleDuration < 32` one.

**Ruling:** the cap ships on its own merits; `updateChartDataFast` **stays**. Retiring a reachable renderer would change multichart 1D replay behaviour rather than delete dead code — a new risk, 46 hours from a canary, on the surface we can least afford to destabilise. Declining a new risk under deadline is the same discipline as declining to weaken a gate under deadline. The duplicate-implementation risk becomes a **named open row**, re-planned on multichart finest-TF cadence grounds, which is where it actually lives.

**Three requirements that decide whether the cap is real or cosmetic:**

1. **Cap the work, not the label — SATISFIED on the default deployment, by measurement (A, 09:52).** My concern was that the 1,440 daily subdivision would keep 1D far more expensive than 1m. **It does not.** Over 12-second windows, single-chart 1m and 1D are *identical* — 50 paints, 50 renders, 2 commits each — and multichart 1D in fast mode does **less** work, 2 renders against 50.

   **The real mechanism, and it is a defect in its own right:** subdivisions divide `realTimeCandleDuration`, which **selects the mode**, while `fastModeInterval` is computed from `rawCandlesPerSecond`, which **ignores subdivisions**. One input picks the renderer; a different input sets the pace. Opened as a row — it is a better candidate for genuine multichart 1D cost than speed is, and unlike the retirement question it can be characterised without changing replay behaviour.
2. **Clamp every entry point, not just the picker** — restored sessions, saved preferences, URL parameters and internal setters. A stored 60x that survives restore defeats the ceiling silently, which is this project's signature failure mode.
3. **Measure the CPU claim rather than assume it.** Before/after on the same replay. The PO suspects high speed drives CPU cost; every performance figure we hold was taken on a broken build, so take the real number.

**Disposition of the lag family under this cap — recorded so it cannot be misread later.** The cap **bounds** the indicator lag; it does not cure it. The row closes as **"bounded by product cap"**, never as "fixed", and the disposition states that raising the cap reopens it with no test guarding the higher range. **Open question that decides whether the cap mitigates the PO's actual symptom: does the lag still occur at 5x?** If it does, the cap changes nothing the user sees and the mechanism is still unfound. One observation on the next build settles it and must be taken before any mitigation is claimed.

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
