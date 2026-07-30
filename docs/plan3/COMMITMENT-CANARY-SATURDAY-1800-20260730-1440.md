# COMMITMENT — Canary Saturday 1 Aug 18:00. What the Director is signing for.

**Date:** 2026-07-30 14:40
**Grant:** PO moved canary from Fri 21:00 to **Sat 1 Aug 18:00**. 51.5 hours from now.
**Authority:** `RULING-EVERY-MULTICHART-OPTIMISATION-IS-GATED-ON-SAME-PAIR-20260730-1430.md`
**Status:** binding. This document is the acceptance bar. Nothing else supersedes it.

---

## 1. Why the extension changes the outcome and not just the deadline

Diagnosis is finished. The mechanism is named and read from source: sixteen
`_multichartSamePairAsHost` guards mean the shipping configuration has no optimisation
coverage. There is nothing left to discover before we cut.

The binding constraint is now **wall clock, not effort**. `DUR-01` requires a
two-hour measurement series to establish a slope. Adding managers does not shorten a
two-hour run. At 22 hours I get three or four grading cycles and no room to be wrong.
At 51 hours I get nine or ten, which is enough for A to land, be graded, be wrong, and
land again. That is the whole value of the grant and it is why I accepted it.

---

## 2. What "pull it off" means — the five numbers

Measured under **CONF-01** (four panels, four different symbols, four different
timeframes, indicators loaded, orders open) and over **DUR-01** duration, not at an
instant. These are the only things that count on Saturday.

| # | Property | Bar | Confidence |
|---|---|---|---|
| 1 | **No leak** | Memory slope over a 2-hour CONF-01 session, after forced collection, is flat within measurement noise. Not "small." Flat. | **Committing.** This is a slope, and slopes are fixable. |
| 2 | **No lag** | PO's own eyes see no stutter, no self-pause, no delayed button response, at the end of a 2-hour session as at the start. Backed by continuous paint and no frame over budget. | **Committing.** |
| 3 | **No CPU issue** | Total across renderer + GPU + browser stays under a ceiling stated before the run, and does not climb over the session. | **Committing** to flat and stated. See §3 on the absolute number. |
| 4 | **Nothing unexplained** | Every suspect on the hit list either fixed with a number or killed with a number. No shrugs, no parks. | **Committing.** |
| 5 | **Memory floor** | Absolute MB at CONF-01, versus TradeZella's 597 MB / 104 MB live. | **Not committing to parity.** See §3. This is the one honest gap. |

### The distinction that matters, stated plainly

A **leak** is a slope. It is the thing that crashed sessions and made buttons take ten
seconds. I am committing to killing it.

A **floor** is an absolute number. Ours may still sit above TradeZella's on Saturday. A
higher floor that is flat, smooth and stable is not the defect you filed — but I am not
going to pretend it is a win either. If it is still above theirs I will hand you the
number and the named reason, before you launch, not after.

---

## 3. The two things that could still stop this, pre-declared

I am naming these now so that if they happen it is not a surprise at hour 50.

**Risk 1 — the oracle refuses A's landing.** Bounding and compacting the base series
touches price data. If the differential parity oracle finds any bar-for-bar divergence,
the landing does not ship, full stop, and the floor stays where it is. Correctness does
not yield to the schedule. `GATE-01` applies: the oracle must be shown RED on a
faithful reversal before I trust it GREEN.

**Risk 2 — the duration gate finds a second slope.** Nobody has ever run a two-hour
CONF-01 session. It is entirely possible C's first run surfaces a mechanism we have
not seen, because we have never looked here. That is the point of building it, but it
means the last discovery may land on Friday rather than today.

**Pre-committed escalation point: Friday 31 July 18:00.**
At that hour I give you a one-page trajectory call: on track, or not, with the numbers
behind it. If it is *not*, you get the choice then — 24 hours before launch, with
options — rather than a confession on Saturday afternoon. I will not let this run to
the wire and then tell you.

---

## 4. Schedule and the six points where I need you

| When | What | You needed? |
|---|---|---|
| Thu 20:00 | C publishes the CONF-01 reference baseline. First honest four-symbol numbers. | No |
| Thu 23:00 | A's Landing A1 (residency bound on `_panelFullRawData`) built and oracle-gated | No |
| Fri 02:00 | A1 deployed. **10 minutes of your eyes on smoothness.** | **Yes, 10 min** |
| Fri 09:00 | First 2-hour duration run result. The first real answer on the slope. | No |
| Fri 12:00 | A's Landing A2 (compact base series) deployed if A1 graded clean | No |
| **Fri 18:00** | **Trajectory call. Go / no-go with numbers.** | **Yes, 15 min** |
| Fri 22:00 | Second duration run, post-A2 | No |
| Sat 02:00 | Final cuts land. Last grading cycle. | No |
| **Sat 06:00** | **Code freeze.** Nothing lands after this except a launch-blocking correctness fix. | No |
| Sat 06:00–14:00 | **Your verification window.** D's five scripts, all staged to four symbols / four timeframes. | **Yes, ~4 hrs** |
| Sat 14:00–18:00 | Deploy, smoke, build-stamp verify, canary open | Brief |

Total call on your time before the verification window: about 25 minutes. The 2-hour
duration runs need nobody watching; that is what C's instrument is for.

---

## 5. What I am changing in how I work, for these 51 hours

**Shoot first.** Everything on the hit list goes behind a per-suspect kill-switch and
lands without waiting for a diagnosis it does not need. `KILL-02` stands: nothing is
parked by argument. The only things that get gated on review are the money path and
price data, and those two are non-negotiable.

**Parallel by default.** `PAR-01`. Four managers, multiple subagents each, tiered by
task. Serial only where the same file is written or where a real dependency exists.

**One measurement standard.** CONF-01. If a number was taken same-pair it does not
appear in a status report. I spent a week reporting the optimised path as the product
and I am not doing it twice.

**Duration before declaration.** `DECL-01` plus `DUR-01`: I do not call anything dead,
and neither does a thirty-second sample. C's two-hour instrument or your eyes.

---

## 6. Confirmation

I am confirming the following, in these words, so there is no room later to claim I
meant something softer:

> By Saturday 1 August 18:00 the chart will be measured in the configuration users
> actually run — four panels, four symbols, four timeframes, indicators, orders — over
> a session long enough to show a trend. It will not leak. It will not stutter, at hour
> two as at minute one. Its CPU will be flat and under a stated ceiling. Every suspect
> will be fixed or dead with a number against its name.
>
> Its absolute memory floor may still sit above TradeZella's. If it does, you will have
> the number and the reason at Friday 18:00, and you will decide what to do with it
> then — not on launch day.

That is what I will do.
