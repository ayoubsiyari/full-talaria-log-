# RULING — `_mcCloneRawDataBars` is 75.55% of playback allocation; ship the cut, and ship the countdown guard today

**Director · 2026-07-30 11:50 · binding on A, B, C**

## The finding

A's playback allocation profile, deployed build, playback advancement proven per panel:

- **`_mcCloneRawDataBars` accounts for 75.55% of all allocation during playback** —
  4,002 MB of 5,298 MB in thirty seconds, **~176 MB/s across four panels**.
- Each of three panels calls it **115 times in thirty seconds**, each call
  **deep-copying the entire 70,989-bar master**, while the parent's master grows by one
  bar per tick.
- **24.5 million bar objects created in thirty seconds to acquire roughly one hundred
  new bars.**
- Cross-checked: bytes ÷ independently counted bars = **231.4 bytes/bar**, which is what
  a six-scalar-key object actually costs. The arithmetic closes against an independent
  count, which is why this is a finding and not a profile artifact.

Four competing candidates are dead **with numbers, not argument**: indicator series
0.06% (7.28% with four indicators loaded, still outweighed eleven to one), marker and
order rebuilds 0.56% across 63 sites, countdown and price-label string formatting 0.04%,
animate-loop `Error` construction **zero bytes, zero call sites**.

## The fix and its measured ceiling

Copy once and append the tail, rather than re-cloning the master. Realm detachment
unchanged. Based on the live tip, independently cherry-pickable, does not ride with the
P0 branch.

**A/B measured: allocation −75%, script CPU −44%, renderer CPU −35%, heap −71%, no
throughput regression.**

Against this morning's baseline of 186% renderer CPU on four-chart playback, −35% puts
it near **120%**. Against +412 MB of playback growth, −71% of heap is the largest single
memory reduction anyone has produced in this plan.

**APPROVED. Ships today.** Behind a flag per standing order, verified OFF against a
working-product assertion per FLAG-03.

## Why the earlier reading misled, and what it costs us to know

A's original 0.258% GC-overhead figure was **correct and measured the wrong quantity**.
Collection is cheap precisely because this garbage is short-lived; a generational
collector reclaims it before a naive sampler ever counts it. **GC-inclusive sampling
flags changed the answer by roughly thirty times.**

176 MB/s of allocation and 0.258% collection overhead are entirely compatible, and I
cancelled FIX 2 on the assumption that they were not. Reopening it was right; **the
original cancellation was mine and it cost approximately a day.**

**Promoted to a standing rule — MEAS-02.** A profiler's default configuration is part of
the measurement. Any allocation, timing or memory profile states the sampling
configuration it ran under, and any null result from a profiler states what
configuration would have been required to see a positive. A null result from an
unstated configuration is not evidence of absence.

## ESCALATION ACCEPTED — the countdown guard has missed three builds

A reports the null guard absent from the live wire, verified **by fetching live bytes
rather than reading a branch**: `CHART_ENGINE_BUILD = '20260730b107'`,
`_countdownNullGuardEnabled = 0`, control symbol present at 2. The negative control is
decisive — nulling `fullRawData` reproduced the exact reported signature
(`Cannot read properties of null (reading '2052')`) on every panel, which proves both
that the instrument works and that the guard is not deployed.

`684e3e5cb` has been ready since this morning, cut from the live tip, zero conflicts. It
has now missed **b105, b106 and b107**. **A has raised this twice.**

**This is a Director routing failure, not a B failure.** A raised it, I read it, and I
did not convert it into an order with a named owner and a deadline. A P0 correctness fix
that is ready, conflict-free and cut from the live tip does not miss three consecutive
builds unless someone above the managers is not doing their job. That was me.

**Order: B cherry-picks `684e3e5cb` and it is in the next build. Not the one after.**
If anything blocks it, one line to me within the hour naming the blocker.

**DEPLOY-03, standing:** a fix that is ready, conflict-free and cut from the live tip
ships in the **next** build. Missing one build requires a written reason in the ship
record. Missing two is an escalation the Director must answer in writing.

The countdown is now **settled as a correctness item and eliminated as a performance
one** — zero throws across four panels, four runs, three stack shapes, at 581 countdown
calls per panel. It needs a state playback never reaches: panel spawn before hydration,
or a symbol switch mid-replay. It ships as a guard, not as an optimisation.

## A's correction against its own profile's recommendation — accepted

The profile argued against shipping the existing alias kill-switch on the grounds that
aliasing would hand iframes live references into the host realm. A read the deployed
source and found that argument false: nine lines below the clone, the same function
already performs `this.rawData = parent.rawData` and `this.data = parent.data`
unconditionally for same-timeframe panels, four occurrences each on live bytes against a
control of ten clone-wrapper calls. **Cross-realm aliasing is already pervasive**; the
clone buys detachment for one array while its immediate neighbours alias two others.

The conclusion holds on a better reason: the A/B showed the cost **relocating**, with
`_reseedReplayFullRawFromLoadedData` climbing 101 MB → 995 MB and becoming the new top
site. Right answer, wrong reason, corrected by reading the live bytes. **That is the
standard.**

## The apparent contradiction that was actually the finding

A's earlier verdict — "laggy is latency, not CPU" — survives intact. The clone is an
enormous cost that does not cause the felt lag. Both are true simultaneously, and the
asymmetry that looked like a contradiction for two days *was* the result: a cost can be
enormous and not be the symptom, which is exactly why we kept cutting things and feeling
nothing.

## Orders

**A** — ship the clone cut behind a flag. Then the two verified unbounded appends
(LabelTool handles, order glow filters). Then the remaining CPU cuts, re-baselined
against the new ceiling, since −35% renderer CPU changes what is left to find.

**B** — `684e3e5cb` in the next build, no exceptions. Then A's clone cut. Then the logo
resize. Report the build stamp the PO must read on screen.

**C** — grade the clone cut on the deployed build: allocation, renderer CPU and heap,
against the same-gauge baselines from this morning. This is the first change in the plan
with a predicted magnitude attached; **grading it tells us whether our A/B harness
predicts live behaviour**, which is worth as much as the cut itself.
