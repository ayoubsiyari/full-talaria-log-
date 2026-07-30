# RULING — the scaling test cancels the representation change, and hands us a better lead

**Director · 2026-07-30 09:30 · binding on A, B, C, D · supersedes Block 3 of PLAN-CANARY-36H**

## The measurement

PO, three fresh sessions, four pairs each, Performance Monitor, deployed b103.

| Range | JS heap | DOM nodes | Documents | CPU |
|---|---|---|---|---|
| 3 days | 181 MB | 51,303 | 4 | 25.4% |
| 3 months | 188 MB | 48,290 | 4 | 77.2% |
| 3 years | 275 MB | 94,131 | 7 | 24.7% |

## Ruling 1 — LANDING 2 IS CANCELLED

Between the 3-day and 3-year sessions the underlying bar count rises by **two to three
orders of magnitude**. The heap rises **1.52x**. Three months is statistically
indistinguishable from three days at 188 vs 181 MB.

Candle data is **not** the mass of this application. The objects→columnar
`Float64Array` conversion would have been eight hours of the highest-risk refactor
available to us, touching every price calculation in a money-path product, in pursuit
of a saving that this table says is not there. It is cancelled outright, and it is not
rescheduled after canary either — not until a measurement says data is the weight,
which this one says it is not.

I authorised it ninety minutes ago on an arithmetic estimate of bar-object overhead.
The estimate was sound and the conclusion was still wrong, because it was never
checked against the running product. **A calculation is a hypothesis. This is what it
cost to test it: five minutes of PO time, and it saved a day.** Whoever proposes the
next large refactor states the five-minute measurement that would falsify it first.

**Residency survives** and still ships. It is cheap, it has a small blast radius, and
holding three years resident to display five hundred bars is wrong regardless of how
few megabytes it returns. But it is now expected to be a **modest** win, and nobody
plans the floor around it.

## Ruling 2 — 51,303 DOM NODES ON A CANVAS CHART IS THE NEW PRIMARY LEAD

This is the number that should have been the headline all week and nobody looked at
it, including me.

The chart renders to a canvas. A canvas chart's DOM should be the shell, the axes, the
toolbars and the order rows — hundreds of nodes, perhaps low thousands with panels
open. We are carrying **fifty-one thousand on the smallest configuration measured**,
and ninety-four thousand on the largest.

It is the best lead in the plan on four counts at once:

**It is the right size.** Fifty to ninety thousand nodes, with attached styles,
listeners and framework bookkeeping, is tens of megabytes of the floor rather than a
rounding error.

**It explains the CPU and the smoothness, which nothing else has.** Style recalculation
and layout are superlinear in node count. The 62 stylesheet rule-set invalidations per
second, the `Forced reflow took 30ms`, the 137% ceiling and the felt jitter are all
what a node count like this does to a frame budget. We have been treating memory and
smoothness as two monsters. This is one mechanism producing both.

**It explains the retention.** ~12 MB per retained document is unremarkable for an
empty realm and entirely expected for a realm carrying twelve thousand nodes. The
document staircase and the node count are the same fact counted two ways.

**It is cheap to attribute and cheap to cut.** A node census is one command. If a
single wrong loop is producing per-bar or per-tick elements, the fix is small, local
and flag-gated — the opposite of the refactor I just cancelled.

## Ruling 3 — what is measured before anything is cut

Two facts are missing and both are minutes of work. **DECL-01 applies: nobody names a
culprit before the census returns.**

**C — the node census.** Group `document.querySelectorAll('*')` by tag, class and
parent chain; report the top ten subtrees by count on a fresh chart. Then answer the
one question that decides the shape of the fix: **does the node count scale with
visible bars, with total loaded bars, with ticks elapsed, or with none of them?** Take
it at 500 bars visible and at 2,000, and take it again after sixty seconds of replay
without touching anything. A count that grows while nothing happens is a leak; a count
that is high but flat is a design cost. Those want different fixes and I will not have
A guessing which.

**C — confirm the test measured what it claims.** The scaling result assumes selecting
a 3-year range actually loads three years. Report the bar count actually resident at
each range. If the app windows the fetch regardless of the selector, Ruling 1 is
premature and I will reopen it on your evidence alone.

**A — hold, then cut.** Read-only audit of the top subtrees the moment C names them,
so the cut is minutes behind the census. Do not start cutting from this ruling; there
is no named culprit in it yet.

## Ruling 4 — the four-panel ambiguity is C's to settle

The PO's sessions were configured with four pairs while the screenshots show a single
chart. Whether 51,303 is one chart's node count or four panels' is a 12,800-vs-51,300
difference in how alarming this is, and the answer changes nothing about it being the
lead. C states which, from its own instrument, and no one quotes a per-chart figure
until it does.

## What this does to the schedule

Block 3 was eight hours of representation work. It is now the DOM node hunt, and that
hunt is cheaper, safer and aimed at all three monsters instead of one. **The 36-hour
plan just got easier, not harder.**

Block 2 is unchanged and continues in parallel: the animate-loop error, the four CPU
cuts, the trade ID defect, the four visual defects, the ledger.
