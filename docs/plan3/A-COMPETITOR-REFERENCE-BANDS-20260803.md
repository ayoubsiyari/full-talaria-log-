# The competitor reference: one-up TradingView, and our own 1 → 2 → 4 curve

**A lane · first pass 21:10+01:00 to 21:30+01:00, 2026-08-03 · witnessed re-take in flight**

Instrument `scripts/competitor-arena-reference.mjs`, assembler
`scripts/competitor-reference-report.mjs` (`COMPETITOR-REFERENCE-REPORT-V2`, 22 cells,
22 mutants). Artifact `docs/plan3/evidence/competitor-reference-oneup.json`.

---

## Coverage limit, stated before any number

- **One chart per competitor arm.** TradingView free is a single chart per layout.
- **No multi-chart competitor data at any panel count.** Paid tiers were not
  purchased, so competitor multi-chart layouts were never reachable.
- **TradeZella and FX Replay are absent, not null.** Dropped by the PO.
- **Nothing here licenses a statement about competitor four-up cost.**

Every figure below is an **interval with an n on it**. No point value is published,
and where two intervals are compared the gap is quoted from the **nearest edges** —
the smallest difference the observations support, not the largest available.

---

## 1. The like-for-like headline — one chart against one chart

| arm | n | total private | GPU private | grade |
|---|---|---|---|---|
| TradingView free, 1 chart | 3 | **760.24 – 825.26 MB** | **432.95 – 501.03 MB** | `BAND_READ`, spread 8.6%, unwitnessed |
| Ours, 1 chart | — | *withdrawn, see §4* | — | `SINGLE_OBSERVATION_NOT_A_BAND` |

**The reference band for one chart is 760–825 MB total and 433–501 MB GPU.** That is
the empirical normal the row existed to establish, and it is a band because our own
idle series moved 411.59 → 396.52 MB at dpr 1 and 460.33 → 489.58 at dpr 2 across a
single wait — one reading of a competitor is not that competitor's cost.

The headline pair is **not yet complete**: our one-up arm has no admissible band, so
the assembler returns `HEADLINE_PAIR_INCOMPLETE` and refuses the obvious substitution
of dividing our four-up by four. Browser, GPU and network process overhead is fixed
and does not scale with panel count, so that division is not our per-chart cost.

---

## 2. Our own scaling curve — ours only, not a comparison

No competitor arm exists at 2 or 4 panels, so these figures have nothing to be
compared against. They answer how **our** cost grows.

| panels | n | total private | GPU private | spread |
|---|---|---|---|---|
| 2 | 3 | 379.33 – 383.93 MB | 138.97 – 141.50 MB | 1.2% |
| 4 | 2 | 447.22 – 452.35 MB | 138.95 – 142.95 MB | 1.1% |

**Marginal cost, 2 → 4 panels: 31.6 – 36.5 MB of total private per added panel.**
Computed from the extremes: (447.22 − 383.93)/2 at the low end, (452.35 − 379.33)/2 at
the high end. The 1 → 2 step is pending our one-up band.

**GPU private is flat across 2 and 4 panels: 138.95 – 142.95 MB at four panels against
138.97 – 141.50 at two.** Two more panels cost, within these observations, **nothing at
all** in GPU. Both intervals overlap almost completely and the spread inside each arm
(1.1–1.2%) is smaller than any difference between them.

This is the number the four-up debate needed, and it points the opposite way to the
assumption behind it. The advisor's arithmetic said 130–180 MB of GPU is expected for
a 4-up at dpr 2 with four to five layers per panel; the four-up reads **138.95–142.95
MB**, at the bottom of that range — and **two panels cost the same**. GPU is fixed
cost here, not per-panel cost, so a hunt for per-panel GPU savings at four-up is
hunting something these readings say is not there.

---

## 3. What the first pass got wrong, and how it was caught

The 20:55+01:00 pass read our 1-up at **564.3 MB total / 356.77 GPU** and our 4-up at
**448.87 / 142.63** — four charts cheaper than one, a marginal of **−38.48 MB per added
panel**, a fixed share of **125.7%**. More panels cannot cost less, so at least one arm
was not measuring a resident cost: 356.77 MB of GPU for a single chart against 142.63
for four is a transient of exactly the kind the settle protocol exists to wait out.

The assembler now refuses this shape as `CURVE_NOT_MONOTONIC_IN_PANELS`, publishes no
marginal, and keeps the readings so the inversion stays inspectable. **A negative
marginal is a measurement artefact reported as a property of the product**, and it
would have gone into a report as "our four-up is cheaper than our one-up".

The boundary is deliberate: no overlap at all is an impossibility; a partial overlap
is noise and must not suppress a usable curve. A mutant that weakened the test from
`hi.max < lo.min` to `hi.max < lo.max` survived until a fixture was built where the
2-up interval sits inside the 1-up one.

---

## 4. Why our one-up band is withdrawn rather than reported

Three separate reasons, and each alone is sufficient:

1. **n = 1.** One reading is not a range.
2. **Its two peers were refused.** Rounds 2 and 3 of the one-up arm exited 3 on
   `UNLOCKED_FOREIGN_RUN_DETECTED`, so the arm never had the repeats that would have
   exposed a transient — precisely the failure §3 describes.
3. **It predates the host-exclusivity witness**, so it cannot say whether the box was
   shared during the reading.

I deleted that artifact before building the mechanism that would have graded it. That
was the wrong instinct — the correct move is to admit a reading and name its
limitation, which is what `unwitnessed` now does. Recorded here rather than tidied
away.

---

## 5. The contamination the lock granted, which matters more than the arms

At 21:18+01:00 to 21:24+01:00, E's `heap-cycle-browser.mjs` (pid 25764) held the box without
the lock. The series **refused three arms against it and let two through** — at
21:19:03+01:00 and 21:21:41+01:00, against the same live process. Both ran to completion
beside E's next Chrome launch.

That instrument opens and closes Chrome in a loop, and the scan demoted a named
measurement with no browser under it *at that instant* to advisory rather than
blocking. So the lock did not fail to warn. **It granted permission to share a box.**

Fixed in two halves, because they answer different questions
(`c2e31529f`, 27 cells stable over three consecutive runs):

- **The observation is sticky.** A pid seen owning a browser counts as a browser run
  for as long as it lives: a cycling instrument is between launches, not idle. Dead
  pids are reaped so the memory cannot become a permanent refusal. One file per pid,
  not one shared map — the map version failed its own cell within minutes, because two
  concurrent scans each read it, added an observation and wrote it back, and the
  second write erased the first.
- **`hostExclusivityWitness()` is stamped into every artifact at both ends.**
  Acquiring the box is not holding it; the lock is checked once, at launch. The two
  contaminated arms produced JSON indistinguishable from the clean ones and I
  reconstructed which readings were spoiled from a terminal log. Now a reading says
  it itself: `HOST_EXCLUSIVE`, `HOST_SHARED_DURING_RUN`, or
  `HOST_EXCLUSIVITY_UNKNOWN`, which is explicitly not the same as clear. The
  assembler refuses on it (`ARM_HOST_SHARED`), because a witness nothing refuses on
  is decoration.

---

## 6. What is quotable tonight

**Quotable:** the TradingView one-chart reference band, 760–825 MB total and 433–501
MB GPU at n=3. Our 2-up and 4-up bands. The 2 → 4 marginal of 31.6–36.5 MB per panel.
The flat GPU finding across 2 and 4 panels.

**Not quotable:** any per-chart comparison, because our one-up band does not exist
yet. Any competitor multi-chart figure, because none was measured. The 20:55+01:00
pass in either direction — neither the flattering total nor the impossible curve.

The witnessed re-take now running produces all four arms at three rounds with
exclusivity stamped on each, which closes §1 and the 1 → 2 step of §2.
