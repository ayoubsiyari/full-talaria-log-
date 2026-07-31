# FINDING C — B6: the duration gate finally ran, and RED is now quotable

**2026-07-31 08:20** · Manager C · overnight battery B6 · tier=mid model=claude-opus-5-thinking-high
**Instrument:** `CONF01-DURATION-GATE-V1` with the corrected DUR-01 grader
**Build read off the page:** `20260730b116` · **CONF-04:** four realms `candle` · **CONF-02: satisfied**
**Artifact:** `_evidence\manager-C\B6-CONF01-DURATION-SOAK-20260731.json` (440 KB, 58 samples)

## Verdict: RED, over 3.78 hours, with intervals I am willing to quote

The gate has been cut short five times. This run held CONF-01 for **3.78 hours** and accumulated
**84 closed positions**, which satisfies CONF-02 as well.

| series | slope | CI95 | verdict |
| --- | --- | --- | --- |
| **footprint total** | **+513.3 MB/h** | **[494.2, 532.4]** | CLIMBS |
| page renderer footprint | +512.2 MB/h | [493.6, 530.9] | CLIMBS |
| **post-GC heap** | **+55.0 MB/h** | **[53.1, 56.8]** | CLIMBS |
| live heap | +96.5 MB/h | [65.9, 127.2] | CLIMBS |
| **elements** | **+448.8/h** | **[410.8, 486.8]** | CLIMBS |
| **elements per closed trade** | **+27.79** | **[26.1, 29.4]** | CLIMBS |
| excursion samples | +23,300/h | [23,136, 23,464] | CLIMBS |
| excursion samples per closed trade | +1,392 | [1,335, 1,450] | CLIMBS |
| renderer CPU % | −1.29/h | [−2.89, +0.30] | **BOUNDED** |
| GPU CPU % | −1.32/h | [−1.69, −0.96] | **BOUNDED** |
| order-loop ms/tick | −0.003/h | [−0.018, +0.013] | **BOUNDED** |
| order-loop % of main thread | −0.07/h | [−0.083, −0.057] | **BOUNDED** |
| heavy field MB (screenshots) | 0 | [0, 0] | BOUNDED |

**Compare with the 45-minute partial that died on 30 July:** footprint +730.8 MB/h with
CI **[30, 1432]**. The Director declined to ship a number that loose and was right to. This run says
**+513 MB/h ± 3.7%**. The point estimate came down by 30% and the interval narrowed by a factor of
about 37.

## What newly closes

**Monster 1 is trade-driven, and now tightly.** Elements climb **+27.79 per closed trade
CI[26.1, 29.4]**. My 20:45 figure was +31.7 with CI[10.9, 52.5] — same answer, interval 12x tighter,
and the point estimate lands inside the old interval. The element writer being on the order path is
no longer an inference from a short run.

**The order loop does NOT degrade with trade count.** This is a negative result I owed the Director
and it closes the order-accumulation re-run. Regressing per-tick cost against closed-trade count
across **5 → 84 closed positions** gives a slope of **−0.28 microseconds per tick per closed trade** —
flat, and if anything mildly negative. Cost stayed in 0.332-0.708 ms/tick throughout. So the earlier
observation stands in its correct form: the jump is from an **empty** book to a **non-empty** one
(0.012 → ~0.4 ms/tick), and there is **no further growth with count**. Nobody needs to cut a
per-trade loop.

**CPU does not degrade over hours.** Renderer and GPU CPU are both BOUNDED across 3.78 hours. This
does **not** contradict Monster 2: utilisation was pinned at 114-134% the whole time, and a saturated
gauge cannot climb. Monster 2 is cost *per bar*, which this instrument does not measure. Anyone
reading "renderer CPU BOUNDED" as "the decay is gone" would be misreading it, so I am saying it here.

## One number I cannot yet explain, and will not paper over

**Excursion samples: +1,392 per closed trade CI[1,335, 1,450]**, reaching 144,540 samples at 84
closed positions. At 22:00 I measured **~318 samples per closed trade** and reported the arrays
bounded under their 1,024 ceiling.

That is a 4.4x disagreement between my own two measurements and I do not have the answer. The
plausible explanation is that sampling is **duration-dependent, not count-dependent**: a position
held for minutes accrues more excursion samples than one opened and closed quickly, and this run held
positions far longer than the 22:00 test did. If that is right, then "per closed trade" is the wrong
denominator and the real driver is position *hold time*.

Two things keep this from being alarming: `heavyFieldMB` is **0** throughout, so the samples are not
carrying screenshot payloads, and I previously established the per-array ceiling. But the
reconciliation is open and it is mine.

## Why this scenario reads "measurement COMPLETE, process VOID"

The soak wrote sample #58 at 3.78h, logged `BROWSER DISCONNECTED`, printed its graded verdict and its
CONF-02 line — and then never exited, so the driver's 237-minute cap killed the process tree at
08:08:21 and filed it `VOID` by the rule that a run must exit cleanly.

The rule is right and I am not weakening it. But the exit code and the data are different questions,
so the driver now also records `measurementComplete` when the artifact carries a graded verdict, and
the summary distinguishes "died mid-measurement" from "finished, then hung in teardown". Tonight's
data is complete; only the teardown failed.

## Honest limits

- `nodesAfterGc` and `listeners` came back INDETERMINATE with intervals straddling zero. Consistent
  with the node-counter noise floor I measured on 30 July; no conclusion either way.
- The bar axis oscillated in the 6,400-7,000 band because the re-arm helper re-seeks at end of data,
  so this run is not a clean throughput series. It was never meant to be — the throughput question is
  B1's.
- One session, n=1. Every interval here is a within-run fit and carries no between-session variance.
