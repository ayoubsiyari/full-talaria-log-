# FINDING — bars are straight too: 24 MB per thousand, and bars beat trades three to one

**2026-07-31 13:15** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** the item I added at 11:06 on the Director's instruction — `UNIT-01`'s per-bar half
**Rules applied** `UNIT-01`, `FIT-01`, `MEAS-01`, `KILL-02`
**Instrument** `MONOTONIC-BARS-GATE-V1` · **Artifact** `_evidence\manager-C\MONOTONIC-BARS-GATE-20260731.json`
**Build read off the page** `20260730b116` · four panels, two indicators each, **speed 5x, zero trades,
zero re-seeks**, 33 samples over 39.95 minutes

## Verdict first

**`UNIT-01`'s per-bar half is satisfied: +23.98 MB per thousand resident bars, CI[22.75, 25.21].**

The axis was clean — **33 samples, zero of them fell**, 6,700 → 36,810 resident bars. And the fit is
genuinely straight, which is the part that matters: **runs z = −0.04** against the time axis's −6.57.

**Bars are straight, trades are straight, only time is bent.** Both drivers decelerate, which is why
every per-hour figure this plan has produced was a chord across a curve.

Two more results came out of the same run, and one of them is bigger than the rate itself.

## 1. The per-bar rate, and why it is trustworthy

| fit | MB per thousand resident bars |
|---|---|
| all 33 samples | **23.98** CI[22.75, 25.21], r² 0.981 |
| first half | 24.80 |
| second half | 23.30 |
| excluding sample 1 (boot settle) | 23.37 |

Every split lands within 6% of the whole. Per `FIT-01`, the residual structure is what licenses this:
**runs 17 against 17.1 expected, z = −0.04, lag-1 autocorrelation 0.252.** No curvature, no sign runs.
Unlike `+513 MB/h`, **this one may be extrapolated** — within the declared configuration.

**Only 4.26 MB of the 23.98 is JS heap** (CI[3.35, 5.17], r² 0.744). **82% of the per-bar cost is not
JavaScript**, which matches the baseline composition exactly: 72% of the renderer is not JS. Anyone
watching `usedJSHeapSize` while bars accumulate sees less than a fifth of what is happening.

**A suspect dies** per `KILL-02`: **DOM nodes do not grow with bars.** −378.71 per thousand, CI spanning
zero, r² 0.116, correctly graded INDETERMINATE. Bars are not creating DOM. The node growth measured
earlier this week is trade-driven (+27.79 elements per closed trade), not bar-driven.

## 2. A forty-minute replay with ZERO TRADES reaches 1,778 MB

Footprint went **1,025.7 MB at first paint to 1,778.4 MB after 39.95 minutes** with **no trades at all**.

This is the most PO-relevant number of the day. **You do not need to trade to exhaust the memory budget.
You only need to let it play.** Every memory investigation this week has been organised around trades,
and trades turn out to be the smaller driver:

| driver | rate | at this run's observed workload |
|---|---|---|
| **bars** | 23.98 MB per thousand bars | 45.2 kbar/h → **1,084 MB/h** |
| **closed trades** | 16.61 MB per closed trade | 20 closes/h → **332 MB/h** |

**Bars beat trades roughly three to one** at a moderate 5x on four panels. `UNIT-01` compliance: both
figures are stated per driver, and the per-hour conversions carry the workload that produced them —
754 bars/min and 20 closes/h respectively. At half the bar rate the first figure halves.

### A correction to my own 10:10 headline

The **+16.61 MB per closed trade** figure came from a two-driver model of hours and closed trades.
**Bars were not in that model**, because the soak's bar axis was non-monotonic and I refused to fit on it.
Trades and bars both accumulated during that soak, so **the per-trade rate is an upper bound** — it can
be carrying bar-driven growth that happens to correlate with trades. The per-bar rate here is the cleaner
of the two, because it was measured with the other driver held at exactly zero. The per-trade figure
should be re-estimated with bars in the model once tonight's soak provides a usable bar axis.

## 3. The lag tracks TOTAL loaded bars, not visible bars — item 8, answered

Visible bars were pinned at 488 for the whole run. Total loaded rose from 6,700 to 36,810. Throughput:

| | bars/min | % of intended (1,200) |
|---|---|---|
| first three intervals | **1,122** | 94% |
| last three intervals | **503** | 42% |

**Throughput fell to 45% of its opening rate**, at **−19.2 bars/min lost per thousand resident bars**,
with zero trades, zero re-seeks and the speed control untouched.

**That is O(total), not O(visible), measured directly with no confound.** Item 8's declared question is
answered: the cost scales with what is loaded, not with what is drawn. Combined with R-1 — where 82% of
resident bars sit before the session start and are never drawn — this says the engine is paying, on every
bar, for history the user cannot see and did not ask for.

### This also reframes S1's ceiling, and I am correcting it here

S1 concluded the engine "flattens against a ceiling of about 13 candles/s". That ceiling is **not a fixed
engine limit — it is the ceiling at whatever bar count the measurement had reached.** This run opened at
18.7 candles/s and decayed to 8.4 while nothing changed but resident bars. S1's 30x and 60x points were
12-minute runs that had accumulated different amounts of history by the time they were sampled, so **the
knee position is bar-count dependent** and the "ceiling" is a moving floor. The tracking range (to 5x),
the inversion (60x slower than 30x) and the pinned CPU all stand; the word "ceiling" was too strong.

## What this means for the canary

1. **The largest memory driver is bars, and R-1 says 82% of them are never displayed.** The two cuts
   already escalated to A — `chart.js:7975`'s fetch cap and the `fullRawData`/`fullData` spreads — now
   have a price attached: **23.98 MB per thousand bars retained**.
2. **Trades are the second driver, not the first.** Worth fixing, worth fixing second.
3. **A zero-trade session reaching 1.78 GB in 40 minutes is a canary blocker on its own**, independent of
   every leak argument this week.
4. **The felt lag has a mechanism and a rate**: −19.2 bars/min per thousand resident bars. Cutting
   retained bars fixes memory and lag with one change, which is the only place on this plan where that is
   true.

## Instrument notes, including one loss

- The run **ended honestly rather than rescuing itself**: no re-arm, no re-seek. Had playback stopped it
  would have reported the span it achieved. It did not need to — all 33 samples advanced.
- `playingRealms` read 1 of 4 throughout while bars accumulated at four-panel rates. **Panels advance
  because the host drives them, not because each runs its own playing loop.** The gauge undercounts and
  `advancingPanels` is the correct one; the early-stop guard required both to be zero, so it never
  misfired.
- **A stale `C_OUT` in my shell made this run overwrite the bfcache-disabled session-reset artifact.**
  Recovered by re-running it with the environment scoped to the process instead of the shell — and the
  re-run replicated independently: documents **[2,2,2]** identical, heap within 0.16 MB, and footprint
  growth **−9.5 MB** against +14.7 MB before, which strengthens the "reset is clean" verdict and confirms
  that 14.7 MB was noise I was right not to call growth.
- The census's account-hydration section is missing because my `onSingleReady` hook destructured
  `({ page })` when the harness calls it as `onSingleReady(page)`. The harness logged
  `Cannot read properties of undefined (reading 'on')` and **I read the artifact without reading the run
  log.** Fixed; all three other callers were already correct.
