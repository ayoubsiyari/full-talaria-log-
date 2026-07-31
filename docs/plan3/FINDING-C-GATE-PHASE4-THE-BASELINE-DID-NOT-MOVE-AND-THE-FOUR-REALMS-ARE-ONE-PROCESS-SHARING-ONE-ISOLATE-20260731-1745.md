# FINDING C — `GATE-PHASE4`: the baseline did not move, so the 497 MB premise survives. But the four realms are **one renderer process sharing one V8 isolate**, which changes what Phase 4 can recover.

**2026-07-31 17:45** · Manager C · build **b120** · `CONF01-BASELINE-GATE-20260731.json` (signature `CONF01-BASELINE-GATE-V1`, filename checked)
**bfcache: ENABLED (Chrome default); irrelevant to a first-paint baseline, declared per `RESET-01`.**
**Five reps, fresh browser each, `CONF-01` four panels / four symbols / four timeframes / two indicators each / no order.**

The Director asked whether the baseline now sits comfortably under 1 GB, because if it does the prize from a
665-hour refactor is small. **It does not. It is essentially where it was.**

## The answer, like for like

The b116 premise was recorded **after a forced collection**, so it must be compared against the post-GC
column. Comparing my live reading to their collected one would manufacture a result out of a methodology gap.

| | b116, pre journal fix | **b120, now** | delta |
| --- | ---: | ---: | ---: |
| Total footprint, post-GC | 1,122.1 MB | **1,159.7 MB** CI[1098, 1221] | **+37.6, inside the CI** |
| Non-JS renderer, post-GC | 497.2 MB | **477.7 MB** | **−19.5** |
| Total footprint, **live** | not recorded | **1,342.9 MB** CI[1318, 1368] | — |

**Both numbers are unchanged within noise.** 1,122.1 sits inside my CI. **`A`'s journal fix did not move the
`CONF-01` chart baseline at all** — which is consistent with my own census finding that the journal is not
fetched during chart load on this account. The 2.49 GB of decoded pixels that fix removed was never part of
*this* baseline. The fix is real and it lands somewhere else.

**So `GATE-PHASE4`'s first measurement does not clear Phase 4's premise away.** Baseline is 1.34 GB live
against a 500 MB bar — **842.9 MB over** — and it is not reachable while the per-realm cost stands.

## Three defects in how the 497 was derived, and correcting them lands in the same place

I would not put a 665-hour decision on the old derivation, because it subtracted **two differently scoped
numbers**: `pageRendererPrivateMB` is the **largest single renderer process**, while the JS heap came from
**one isolate**, and the **worker heap row was `null`** — two worker isolates existed unmeasured, so their
bytes were being counted as native cost.

Corrected: every renderer process summed, JS heap summed across every isolate, workers read per-isolate.

| | measured |
| --- | ---: |
| Renderer processes | **4**, summing **989.0 MB** CI[970, 1009] |
| Renderer breakdown | **906.3 / 23.2 / 19.9 / 17.3 MB** |
| JS heap, all isolates | **254.8 MB** CI[192, 318] |
| Isolates found | page **269.5**, workers **0.34 / 0.34 / 9.49** |
| GPU process | **246.1 MB** |
| Non-JS renderer, live | **730.1 MB** CI[666, 794] |

**The corrected post-GC figure is 477.7 MB against the premise's 497.2.** The derivation was wrong and the
magnitude was right, which is the good case: the number survives on better evidence.

## The finding that changes what Phase 4 buys: one process, one isolate

**The four realms are not four heavyweight processes.** One renderer holds **906 of the 989 MB — 92%** — and
the other three hold about 20 MB each. And **`Target.getTargets` returned no `iframe` targets at all**: the
panels are same-origin and in-process, so they **share the main frame's V8 isolate.**

Two consequences.

**Phase 4 cannot recover three process overheads, because they do not exist.** The saving has to come from
**duplicated per-realm structures inside a single process** — 7 documents becoming 2, per-realm script parses
and compiled code, per-realm DOM and style and layer tiles. That is consistent with the 44.26 MB of decoded
script bytes and the 251 script requests already on the budget, and it is a smaller and more specific target
than "the native cost of four browser realms."

**And the JS heap does not go away.** 254.8 MB of heap survives the collapse, because one realm still holds
four datasets. So the recoverable pool is bounded above by the non-JS figure, **and even that is an upper
bound**, since a single realm still needs DOM, style, compiled code and tiles to draw the same four charts.
**Nobody should price Phase 4 as recovering 730 MB, or 497.**

### It also retires a measurement worry, in this configuration only

It has been carried since 29 July that `usedJSHeapSize` is wrong-scoped because it cannot see iframe heaps.
**That is true for out-of-process iframes and false here** — same-origin in-process frames share the isolate,
so the page figure already covers all four realms. The concern was correct in general and does not apply to
`CONF-01`. I would not have been able to say that without walking the targets, and I had the row labelled
"page isolate" as though it were a gap.

## What the forced-GC confound was hiding: 183 MB that users actually carry

Live 1,342.9 MB against post-GC 1,159.7 MB. **The gap is 183.2 MB — memory a user is holding that only a
forced collection returns, and no user gets one.** That is the size of the perturbation I was introducing, and
it is why the arm was worth voiding rather than reporting.

I have removed it from the soak as well: `bend-soak.mjs` sampled with `forceGc: true`, collecting every three
minutes for ten hours — repeatedly resetting the very quantity whose slope it exists to measure. It now
samples live, with the post-GC field explicitly labelled null-by-design so no grader reads it as a broken
gauge.

## An escalation I am walking back before anyone acts on it

I escalated the browser dying at **~1.38 GB** as a P0 capping every long run. **With forced GC removed, the
clean-arm check reached 1,526.1 MB and kept going.** Combined with the fourth reload arm surviving 1,395.8 MB,
**I no longer believe 1.38 GB is a hard ceiling**, and A and B should not spend a cycle hunting one. The deaths
were real, but the threshold was not a constant, and my forced collections were part of the pattern I was
measuring. The honest statement is: **the browser has died three times between 1.38 and 1.40 GB and has also
survived 1.53 GB, so the ceiling is soft and load-dependent.**

## Caveat on the live non-JS figure

JS heap across reps ran **135 to 324 MB** — CI[192, 318] — and it is subtracted to get non-JS, so it is the
dominant uncertainty in the 730.1 MB live figure. The post-GC comparison is the tighter one and it is the one
I would put in front of the PO. **A single rep of this measurement should not be quoted at all.**

## Status

Ten-hour `CONF-01` soak relaunched **17:44 on b120 with the clean arm**, four `RESET-01` exits appended
(reload, logout in both bfcache arms, tab close), segmented so a death is recorded and the run continues.
`GATE-PHASE4`'s second measurement — how much of the per-realm cost `A-L3` panel shell stripping recovers — is
A's, and it is the one that now decides whether the remaining pool is worth 665 hours.
