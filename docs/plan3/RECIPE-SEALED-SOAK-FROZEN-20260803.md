# FROZEN RECIPE — sealed two-arm soak · standing reference for all future soaks

**Frozen 2026-08-03 16:40+01:00 by C, on the Director's ruling of 16:26+01:00.** This file is the
standing reference. A soak that deviates from it is a different experiment and must say so in its own
artifact rather than quietly inheriting this one's authority.

---

## 1. The recipe

| knob | trade arm | zero-trade arm |
|---|---|---|
| governor | **30 closed round-trips/hour** | **0 — no governor at all** |
| trade interval | one every **120 s** | n/a |
| orders across the arm | **300** | **0** |
| **play** duration | **10 h** | **3.5 h** — see the matched window below |
| **paused settle curves** | 2 × 33 min (hour 0, hour 10) | 2 × 33 min (hour 0, hour 3.5) |
| **wall-clock duration** | **11.1 h** | **4.6 h** |
| speed | 10 bars/s requested | 10 bars/s requested |
| panels | 4, same-symbol, E indicators | 4, same-symbol, E indicators |
| dataset | CONF01 common window, runway declared | CONF01 common window, runway declared |

### AMENDMENT — PAUSED SETTLE WINDOWS, 2026-08-03 22:40+01:00

The hoard floor binds at each end of the arm, and it is the soak's second gate behind RATE-HOLD. As of
`SETTLE-CRITERION-V2` a reading is not settled unless the page is **verifiably paused**, the collection
did not land in re-allocation, and there is a **curve** of at least 3 reads at 600 s rungs. One reading
after a sleep cannot certify a floor however long the sleep.

**Designed into the arm, not bolted on:**

- Each arm opens with a **paused settle curve at hour 0** and closes with one at its end. **These ARE
  the hoard-floor readings** — not additional measurements taken near them. One curve, one number,
  both gates reading the same row.
- **The curves sit outside the play clock.** Play time stays at 10 h and 3.5 h, because the governor
  and every prediction in §2 are stated in *played* hours: 300 orders at 30/hour needs 10 h of play,
  not 10 h of wall clock minus an hour of pausing. Wall clock grows to 11.1 h and 4.6 h instead.
- **Both arms take the same two curves**, so `ARM-EQUALITY-01` is unaffected: the curve count, rung
  ladder and pause discipline are identical and only the trade knob differs.
- The pause is `quiesce()` from `settle-protocol.mjs` and its per-realm verification is recorded on the
  reading. A curve whose pause did not verify is `NOT_QUIESCENT` and does not produce a floor.

**Cost of the amendment: 2.2 h of exclusive box across both arms.** That is the price of the hoard
floor being a floor rather than a sample.

### MATCHED COMPARISON WINDOW — ruled 2026-08-03 19:10+01:00

**The between-arm delta is taken over the first 3.5 h of BOTH arms, and only there.** Both arms are
measured from boot, so the two windows are directly comparable.

The arms differ in duration, and `ARM-EQUALITY-01` correctly refused the fire because of it — with
within-arm separability predicted to fail, a second difference between the arms would leave the
attribution with nothing to stand on. Two ways to fix that: make the zero-trade arm 10 h (+6.5 h of
exclusive host window in seal week), or narrow the claim. **The claim is narrowed.**

Precisely what that means, because the distinction is the whole point:

- **Certification claim — unchanged.** The trade arm still runs 10 h and still certifies total growth
  under a realistic session for its full duration.
- **Attribution claim — bounded to 3.5 h.** The bars-versus-trades split is stated over the window
  only. **Samples beyond 3.5 h must not be differenced against the other arm**, because after that
  point there is nothing to difference them against.

This is a **reconciliation, not a waiver**. The window is declared in code
(`COMPARISON_WINDOW_HOURS` in `fire-sealed-soak.mjs`), passed to the run, and recorded on **both**
arms' artifacts as `betweenArmComparisonWindowHours` — so the analysis reads the bound off the run
rather than off this document, which it may not have. The gate refuses a window that does not fit
inside the shorter arm (`ARMS_WINDOW_UNSATISFIABLE`), and the window reconciles **duration only**: a
second difference still refuses.

If the 3.5 h delta turns out to be interesting, extend the zero-trade arm then — with evidence, rather
than now on a guess.

### FROZEN PREDICTION — recorded 2026-08-03 18:40+01:00, before the run

> **At 30 closed round-trips/hour the trade term will NOT be separable from the time term inside the
> trade arm. I predict `hoursVsClosedTrades_r2` comes back ≥ 0.99, and
> `soak-trade-correlation.mjs` grades the pair inseparable (`closesPerHourSpread.sd` ≤ 3).**
>
> **Why:** a governor holding a steady 30/h makes closed trades a near-exact linear function of wall
> clock. Steadying the rate is what makes the workload realistic and is the same thing that destroys
> the within-arm contrast. Raising 20 → 30 does not cause this; it *deepens* it, because the tighter
> the governor holds, the more perfectly collinear the two axes become.
>
> **Falsifier, stated in advance:** `hoursVsClosedTrades_r2` below 0.99, **or** the correlation script
> grading the terms separable. Either outcome means the governor drifted enough to create usable
> contrast, and this prediction was wrong.
>
> **Consequence if confirmed:** the trade arm certifies total growth under a realistic session — which
> is what a certification workload is for — and attributes none of it. **The entire bars-versus-trades
> split then rests on the between-arm delta**, which is why `ARM-EQUALITY-01` refuses to fire when the
> arms differ in anything but the trade knob.
>
> This is recorded **before** the number exists so that, when it arrives, it reads as a confirmed
> prediction and not as an explanation invented afterwards. It is dated, and it does not move.

Set in exactly two places, both committed: `scripts/fire-sealed-soak.mjs` (`ARMS.trades`) and the
`closesPerHour` default in `scripts/sealed-two-arm-soak.mjs`. The artifact's `armMeaning` and
`tradeGovernor` block are **derived from the knob**, not restated beside it, so an artifact cannot
describe a rate the run did not use.

**This is a CERTIFICATION workload, not a stress test.** The rate must be one a real trader could
produce. Raising it to find a breaking point would make this a different experiment with a different
claim attached, and the seal quotes this one.

**The zero-trade arm is unchanged and must stay unchanged.** It is the control that removes the trade
term by construction; moving it would destroy the comparison the pair exists to make.

---

## 2. Predictions, restated against 30/hour

**Predictions adjust to the recipe, never to the results.** These are recorded before the run. Every
one is stated with the assumption it rests on and the observation that would falsify it, because a
prediction you cannot lose is not a prediction.

### 2.1 The bars-versus-trades ratio — the headline change

Measured at 20/hour: bars contribute **~1,084 MB/h** against **~332 MB/h** from trades, so bars beat
trades **3.27 : 1**. That ratio is the reason every memory investigation this week was organised
around bars.

At 30/hour, holding per-trade cost constant, the trade term scales by 1.5:

| term | at 20/h | **at 30/h** |
|---|---|---|
| bars | ~1,084 MB/h | ~1,084 MB/h (unchanged — bar rate is set by speed, not by the governor) |
| trades | ~332 MB/h | **~498 MB/h** |
| **ratio** | 3.27 : 1 | **2.18 : 1** |

**Bars still beat trades, but by roughly two to one rather than three to one.** The strategic reading
does not flip; it narrows. *Assumption:* per-trade cost is independent of trade rate. *Falsifier:* if
the measured trade term at 30/h comes in materially below ~498 MB/h, per-trade cost is rate-dependent
— most likely because a faster cadence gives eviction less time to run between round-trips, which
would be a finding in its own right and is the one I would most like to be wrong about.

### 2.2 Per-trade element growth

**+27.79 elements per closed trade**, trade-driven only (DOM node growth against *bars* was graded
INDETERMINATE — r² 0.116, CI spanning zero). At 300 orders that predicts **~8,337 elements** added
across the arm, against ~5,558 at 200. *Falsifier:* a measured per-trade element coefficient whose CI
excludes 27.79.

### 2.3 Per-trade memory cost

**+16.61 MB per closed trade is an UPPER BOUND and is expected to be wrong high.** It was fitted with
hours but without bars, on a soak whose bar axis was non-monotonic, so it may be carrying bar cost. A
later smoke run put the coefficient at **−37 MB with a CI spanning zero** once bars entered the model,
on five trades — a hint, not a number. Stated at 30/h purely so the bound is on the record: 300 ×
16.61 = **≤ 4,983 MB**, and I expect the true figure to land far below it. Quoting 4,983 MB as a
prediction rather than a ceiling would be quoting a known-inflated coefficient.

### 2.4 A consequence of the change that cuts against it — SEPARABILITY GETS WORSE

Raising and steadying the governor improves realism and **degrades the statistics**, and this is the
one place where the new recipe is worse than the old one. `soak-trade-correlation.mjs` grades the
trade term separable from the time term only when the closes-per-hour spread is wide enough
(`closesPerHourSpread.sd > 3` marks it inseparable). A governor holding a *steadier* 30/h makes
closed trades even more perfectly collinear with wall clock than 20/h did, so:

**Prediction: the trade arm will report `hoursVsClosedTrades_r2` closer to 1.0 than the 20/h run did,
and separability is more likely to fail, not less.** If it does fail, the arm still certifies total
growth under a realistic workload — which is what a certification workload is for — but it will not
be able to attribute that growth between the bar term and the trade term. **The zero-trade arm is
what rescues the attribution**, and this is precisely why it must not be changed: it is the only place
the bar term is observed with the trade term at zero.

*Recommendation, not a change:* if attribution matters more than realism for a future soak, deliberately
vary the governor within the arm rather than holding it steady. Not done here, because the Director
ruled this a certification workload and a varying rate is not a realistic session.

---

## 3. Validity — no number leaves this run unqualified

**COV-01: the authoritative memory number is not quotable without ≥95% named coverage.** Bound in
code at `scripts/lib/memory-validity.mjs` (`assessQuotability`), consumed by the floor instrument.
States are `QUOTABLE`, `NOT_QUOTABLE_COVERAGE`, `NOT_QUOTABLE_NO_TOTAL`, and `COVERAGE_UNKNOWN` —
the last kept separate because a broken coverage instrument must never be reported as a low-coverage
reading.

**Where that leaves us today: the published canonical floor is NOT quotable.** Pass 3 on b126 reads
59.84% coverage on the post-play curve with **271.05 MB unattributed**, and 58.54% on the boot curve.
`FLOOR_FOUND` and `quotable` are different claims and the artifact now carries both.

`TOTAL-01` continues to apply underneath it: no single-arena delta without its total row.

---

## 4. Host conditions — exclusivity, not relocation

**The soak runs on the RTX box. It does not move to the EC2 r6i.** The r6i has no GPU, so paint and
arena measurement there would run under software rasterisation — reintroducing by choice the exact
condition that was disproved as the explanation for the GPU-to-renderer swap. A measurement taken
under a condition we already excluded cannot certify the product.

Binding for an authoritative read:

1. A **calendar-level exclusive window** on the RTX box, booked in advance.
2. **Cursor fully closed.** Not idle, not minimised — closed. Its helper processes are resident on the
   box for every reading, and they are the largest thing on it that is not the product.
3. **A's `RUN-LOCK-01` host scope** acquired and `await`ed, on top of the window rather than instead
   of it.
4. `npm run gate:orphan-servers` reads `NO_HARNESS_SERVERS` before the run starts.

A second GPU-bearing box is endorsed and **blocks nothing** — it buys parallelism later, not validity
now.

---

## 5. What freezing means

Changing anything above requires a ruling and a new dated version of this file. Instruments read the
recipe from committed code, not from this document, so this file and the code can only disagree if
someone edits one without the other — if you find them disagreeing, **the code is what ran** and this
file is the defect.
