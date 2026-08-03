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
| duration | **10 h** | **3.5 h** |
| speed | 10 bars/s requested | 10 bars/s requested |
| panels | 4, same-symbol, E indicators | 4, same-symbol, E indicators |
| dataset | CONF01 common window, runway declared | CONF01 common window, runway declared |

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
