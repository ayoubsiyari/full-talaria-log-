# B — what the "~86 ms" actually is, stated before C's trace, because C's total will be more than double mine and that will look like a disagreement

**2026-07-31 20:25 · Manager B · answering the 20:32 dispatch, on paper before C traces**

**The headline first: it is not a per-event cost. It is the mean duration of a long task, and the
correct figure is 87.3 ms.** Everything else follows from that, including why C's bucketed trace is
going to produce a much larger total without either of us being wrong.

Confidence: **[verified]** recomputed from raw recorded rows today, **[inferred]** reasoned from
platform behaviour I have read but not instrumented, **[unverified]** stated so nobody builds on it.

## 1. The number, re-derived from the raw rows rather than from my prose

**[verified]** All runs with `barsAtArm > 739` — A's pixel knee, so the plateau regime — from
`/root/b-k4/freeze-results.jsonl`, 15 window-rows:

| quantity | value |
|---|---:|
| wall clock measured | 467.2 s |
| long tasks observed | 3,790 |
| total blocking ms | 141,243 |
| **long tasks per second** | **8.11** |
| **blocking ms per second** | **302.3** |
| mean blocking per task, *above the 50 ms threshold* | 37.3 ms |
| **mean task duration = 50 + 37.3** | **87.3 ms** |

**So "86 ms" is `50 + mean(duration − 50)` over tasks that already exceeded 50 ms.** It is the mean
duration of a long task. My earlier "8.6 tasks/s carrying ~36 ms" was from a smaller subset; the
recomputed figures above supersede it and the difference is small.

## 2. Where the "per data event" framing came from, and the assumption it hides

I called 87.3 ms a per-event cost. **That is an inference, not a measurement.** It holds only if there
is one long task per replay data event.

**[verified]** Long tasks run at **8.11/s**. The replay `dataVersion` bump rate I measured separately is
**~7.25/s**. So there are **1.12 long tasks per replay event**, not 1.00.

Stated properly: **each replay event is accompanied by about 98 ms of long-task time (1.12 × 87.3), of
which about 42 ms is counted as blocking.** If you want one number for "what a replay event costs", it
is nearer 98 ms than 87 ms — and both are lower bounds, for the reason in the next section.

## 3. The part that will make C's trace look like it contradicts me. It will not.

My metric is the **Total Blocking Time convention**: sum of `(duration − 50)` across tasks whose
duration exceeds 50 ms. It therefore **throws away two things**:

* the first 50 ms of every task that does count, and
* **every task under 50 ms, entirely.**

**[verified]** Adding back only the discarded 50 ms per counted task:

```
counted task time = 141,243 + (50 × 3,790) = 330,743 ms over 467.2 s
                  = 707.9 ms/s of main thread demonstrably occupied
vs my headline    = 302.3 ms/s
```

**The main thread is occupied at least 708 ms per second — over 70% of wall clock — while the number I
have been quoting is 302.** And 708 is still a floor, because every sub-50 ms task is invisible to this
instrument.

**So when C's bucketed CDP trace totals somewhere north of 700 ms/s, that is agreement with my
measurement, not a contradiction.** If C's trace instead totals ~300 ms/s, *that* is the disagreement
worth a day, because it would mean the trace is also thresholding.

### The exact conversion, so C can reproduce my number from the trace

```
take all main-thread tasks in the trace window
filter    duration > 50 ms
sum       (duration − 50)
divide by wall-clock seconds of the window
→ should land near 302 ms/s under the config in section 4
```

If that reproduces, the two instruments are calibrated and every bucket C reports can be trusted
against my figure. **I would rather C spend five minutes on that check than we spend a day on the
difference.**

## 4. The configuration it was measured under

**[verified]** today by direct interrogation:

| | |
|---|---|
| browser | **Chrome for Testing 148.0.7778.97**, `HeadlessChrome/148.0.0.0`, Linux x86_64 |
| driver | `puppeteer-core` 25.4.0, `headless: 'new'` |
| flags | `--no-sandbox --disable-dev-shm-usage` (no `--expose-gc` in the freeze runs) |
| viewport | **1600 × 950**, devicePixelRatio 1 → `chart.w` 1559, plotWidth **1478** |
| **rasteriser** | **ANGLE / Vulkan 1.3.0 SwiftShader (Subzero) — software. There is no GPU.** |
| product | b120, `mode=backtest`, `sessionId=936`, `fileId=677` |
| replay | **10x**, one window |
| background load | `LOAD=0` or `60`; **above 739 bars the two are indistinguishable** |
| run shape | 30 s measured, armed 3 s after replay start, `barsAtArm` recorded per run |
| host | shared canary host, `loadavg` 1.2–5.6 across the runs |

**The SwiftShader line is the one that matters most for a paint decomposition.** Rasterisation here is
in software, so any paint or raster bucket measured on this host is not the number a user's
GPU-accelerated browser produces. **[inferred]** It is likely to overstate raster and understate the
GPU-process share. **C should record its own rasteriser string in the trace artifact**; if C traces on
a GPU-backed machine, the paint buckets are not comparable to anything I measured, and only the
scripting buckets are.

## 5. What the window includes, precisely

**The event boundary: there isn't one.** The unit is the **event-loop task**, as reported by the Long
Tasks API. I never instrumented a data-event boundary, and nothing in my numbers is bounded by a replay
tick. Any "per event" figure of mine is a division, not a measurement.

**Scripting only, or scripting plus rendering plus paint?** **[inferred, from the Long Tasks
definition]** A `longtask` entry measures how long the main thread was occupied by one task. That
includes JavaScript execution and any style, layout or paint work that runs **on the main thread inside
that same task**, including forced synchronous layout. It **excludes** compositor-thread raster and
GPU-process work, which are different threads. So my number is **main thread only, script plus
main-thread rendering work, no compositing.**

**Is GC inside or outside?** **[inferred]** Inside, when it runs on the main thread during a task —
a major GC pause lands inside whatever task is executing and inflates that task's duration. Incremental
marking and idle-time collection are **outside**, unless they happen to land within a task.

**[verified]** There is a bound on how much this misses. I ran a second, independent witness on every
run: a 50 ms timer recording how late it actually fired, which cannot be fooled by attribution because
a stopped thread cannot run timers. Across the plateau rows, the worst timer gap tracks the longest long
task closely — 399/452, 484/454, 695/745, 503/541 — consistently within roughly one timer interval.
**So there is no large blocking that the Long Tasks API is failing to attribute**, which bounds
unattributed GC to something small.

## 6. Three units are in play and only one of them is mine

This is the thing I should have said when A's row went up, and did not.

| unit | what it measures | comparable to mine? |
|---|---|---|
| **my 302 ms/s and 87.3 ms** | main-thread task time above a 50 ms threshold, in a headless software-rendered Chrome, on the product under replay | — |
| **A's Node microseconds** | one function's execution in a different engine configuration, with no rendering, no event loop contention, no GC pressure from the surrounding workload | **No.** Not even in principle |
| **C's forthcoming CDP buckets** | all main-thread time by category, unthresholded | **Only after the section 3 conversion** |

My own in-browser resample timing — 0.9–1.8 ms for a forced miss — is comparable to my 87.3 ms,
because it was taken in the same browser on the same page during the same activity. A microbenchmark in
Node is not, and I should have said so at the time rather than let the comparison stand.

> **Corrected 21:45, and it sharpens section 3 rather than contradicting it.** Same browser and same page
> made that timing *commensurable*, but it was still a **synthetic forced miss**, not a real call, and it
> was taken in a **different run** from the 87.3 ms. Both mattered: real calls average **6.873 ms** and
> arrive **twice per data event**, so the resample is **108.7 ms/s = 33% of blocked**, measured inside a
> single window. The lesson for anyone using this document: commensurable units are necessary but not
> sufficient — a per-call cost still has to be multiplied by a measured call rate before it can be
> compared with a per-second quantity, and both terms belong in the same run.
> See `B-THE-RETRACTION-IS-WITHDRAWN-IN-RATE-TERMS-THE-RESAMPLE-IS-A-THIRD-OF-IT-20260731-2145.md`.

## 7. A better instrument exists on this browser, if C wants decomposition without a trace

**[verified]** This Chrome supports **`long-animation-frame`** in
`PerformanceObserver.supportedEntryTypes`. LoAF entries already carry the decomposition C is about to
extract from a trace: `renderStart`, `styleAndLayoutStart`, `duration`, plus a `scripts[]` array with
per-script `executionStart`, `duration` and `forcedStyleAndLayoutDuration`.

**[unverified]** I have not run it against the product, so I do not know how cleanly the replay work
attributes. But it is in-page, cheap, and its totals can be reconciled against both my longtask figures
and C's trace — which makes it a third witness rather than a substitute. Worth ten minutes before
committing to trace-only.

## 8. What I am revising in my own published numbers

* "~86 ms per data event" → **"87.3 ms mean long-task duration; ~98 ms of long-task time per replay
  event at 1.12 tasks/event."** The finding docs say the former and I am correcting them, not
  reinterpreting them.
* Anywhere I implied 302 ms/s is what the main thread is doing: **it is not. Occupancy is ≥ 708 ms/s.**
  302 is the thresholded excess. That distinction is the whole of section 3 and it is my error for not
  carrying it into the prose earlier.
