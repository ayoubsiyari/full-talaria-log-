# RULING — one renderer, and JS heap is a third of the tab

**Director · 2026-07-30 10:00 · binding on A, B, C, D**

## The measurement

PO, Brave Task Manager, All tasks, JavaScript memory column enabled. Deployed b103,
`sessionId=924`, **single chart**, EUR/USD 1m, **DevTools closed**.

| Task | Memory footprint | CPU | JavaScript memory |
|---|---|---|---|
| Private Tab: Talaria — V9 Live | **304,808K (~298 MB)** | 16.1 | **104,928K (~102 MB), 101,215K live** |
| GPU Process | **269,584K (~263 MB)** | 11.3 | — |
| Browser | 146,068K (~143 MB) | 3.5 | — |
| Utility: Network Service | 41,468K | 0.1 | 0K |
| Spare Renderer | 16,548K | 0.0 | 0K |
| Utility: Storage Service | 11,588K | 0.0 | 0K |
| Utility: Audio Service | 9,868K | 0.0 | 0K |

## Ruling 1 — the multi-process split hypothesis is DEAD

**One renderer row for the application.** C's leading candidate for the PO's 789 MB —
that a many-pair session spreads frames across additional renderer processes and the
console therefore counted only some of them — does not hold on this evidence. There is
one row, one isolate, and a console reading taken in it is complete for JavaScript.

Recorded as killed, not parked. C stops work on it.

Caveat stated honestly: this reading is a **single-chart** session, and the 789 came
from a fifteen-pair session. A split could still appear at fifteen pairs where it does
not at one. **C re-runs this exact Task Manager reading at the heaviest configuration
before I close it permanently.** Until then it is dead on the evidence in hand and
nobody spends another hour on it.

## Ruling 2 — WE HAVE BEEN MEASURING A THIRD OF THE PROBLEM

This is the finding, and it reframes the whole memory hunt.

The tab's renderer process is **~298 MB**. Its JavaScript heap is **~102 MB**. So
**~196 MB of the renderer — roughly two thirds — is not JavaScript at all.** That is
DOM nodes, style data, layout boxes, canvas backing stores, compiled code and
framework bookkeeping. And sitting beside it, **the GPU process is at 263 MB on a
single chart**, which is textures, layers and canvas surfaces.

Every memory instrument we have built and every measurement we have argued over for a
week — `performance.memory.usedJSHeapSize`, Performance Monitor's JS heap line, C's
snapshot censuses, the constructor tables, the retainer paths — reads the **102 MB**.
None of them can see the 196 MB or the 263 MB.

That is not a small correction. **The application costs roughly 560 MB across renderer
and GPU on a single chart, and our entire diagnostic apparatus has been pointed at
under a fifth of it.**

Two consequences follow immediately.

**The DOM node lead is now much stronger.** Fifty-one thousand nodes do not live in
the JS heap; they live in exactly the ~196 MB of non-JS renderer memory we have never
measured. Ruling 2 of the 09:30 ruling and this one are the same finding arriving from
two directions on the same morning, and that convergence is the most encouraging thing
to happen in this plan.

**The GPU process is a brand new line item and nobody has ever looked at it.** 263 MB
on one chart. Canvas backing stores are allocated at device-pixel-ratio, so a
high-DPI display quadruples them, and a chart that allocates a separate canvas per
overlay, per indicator or per panel multiplies that again. C's fourth CPU cut —
promote the canvas so unchanged content composites instead of re-rastering — was aimed
at CPU and may turn out to be a memory cut of comparable size. It moves up the list.

## Ruling 3 — every JS heap number we hold is probably inflated, and one test settles it

The 3-day session read **181 MB** of JS heap on Performance Monitor. This session reads
**102 MB** of JavaScript memory in Task Manager. Both are single-chart views of the
same deployed build. The obvious difference is that the first had **DevTools open** and
this one did not, and C has already proven the mechanism: an Error created in a panel
realm closes over that realm through its stack accessor, so an attached console holds
realms the product has released. C measured 4 product-held against 8 console-held.

If that is the whole difference it is a factor of about **1.8x**, and it applies to the
PO's cycle numbers, the baselines, the before-and-afters, and several conclusions I
have written down as fact.

**I am not asserting it.** Two readings from different sessions with different ranges
is precisely the error I made with the gauge comparison at 09:15, and I am not making
it twice in an hour. It needs the same-instant discipline.

**The test, and it takes two minutes.** One session, unchanged, untouched. Read Task
Manager JavaScript memory with DevTools **closed**. Open DevTools, wait ten seconds,
read it again. Same page, same session, same range, one variable. If the number jumps,
every JS heap figure in this plan taken with DevTools open is an upper bound and gets
labelled as one — and it means the product is in better shape than our numbers have
been saying, which would be the first pleasant surprise of the week.

## Ruling 4 — what changes, and what does not

**Unchanged:** the DOM node census is still the top lead and C's node census is still
the top task. The document staircase is still the retention mechanism. Residency still
ships. The columnar bar-store change stays cancelled — nothing here revives it, and if
anything the case is weaker, since the JS heap that would have shrunk is the small
part of the total.

**Added to C, after the node census:** measure the non-JS renderer memory and the GPU
process the way this reading does, and give us a composition for both. We cannot cut
what we cannot see, and for a week we have not been able to see two thirds of it.

**Added to A, read-only for now:** count the canvases and their dimensions, and report
whether any are allocated per overlay, per indicator or per panel rather than shared.
Do not cut. C's census names the culprit.

## The standing lesson, and it is the same one twice today

At 09:15 I withdrew a claim because I compared two gauges from different sessions. At
09:30 a five-minute measurement cancelled an eight-hour refactor built on arithmetic.
At 10:00 a column that was one right-click away showed that our entire instrument
suite reads a fifth of the application's memory.

**None of these needed a subagent, a harness or an overnight run. They needed someone
to look at the whole number before theorising about part of it.** Before any manager
builds another instrument, it states what fraction of the system that instrument can
see. An instrument with an unstated blind spot has been worse than no instrument at
all this week, because it produced confident numbers.
