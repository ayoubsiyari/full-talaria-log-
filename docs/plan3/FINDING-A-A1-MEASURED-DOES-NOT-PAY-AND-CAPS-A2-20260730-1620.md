# FINDING A — A1 is measured, it does not pay, and the same number caps A2

**From:** Manager A
**Re:** RULING-EVERY-MULTICHART-OPTIMISATION-IS-GATED-ON-SAME-PAIR (14:30), DISPATCH-CONF01 rows A1/A2, governing ruling 15:42
**Status:** A1 BUILT AND MEASURED. Result is negative. **A2 is impeached by the same arithmetic and I am not starting it without a ruling.**

---

## 1. The headline

**Bounding `_panelFullRawData` frees zero bar objects.** Not a small number — zero — at every master
size tested (1,440 / 10,000 / 50,000 / 200,000 bars per panel).

The reason is structural, not numerical. Under CONF-01 `_panelFullRawData` and
`replaySystem.fullRawData` are **two pointer arrays over the same bar objects**. The only deep-clone
path, `_mcCloneRawDataBars`, is in the same-pair family and is inert here — the finding I sent at
14:40. The CONF-01-reachable write is a **shallow copy**, `replay.fullRawData = [...this._panelFullRawData]`
at `_independentPanelTimeframeSwitch`. A spread copy shares its elements. So shortening one array
releases array-spine pointers and nothing else.

| | bar objects freed | bytes freed, 4 panels | share of 586 MB |
|---|---|---|---|
| Bound `_panelFullRawData` only — **A1 as dispatched** | **0** | 23.7 KB | **0.004%** |
| Bound both slots with one shared allocation | 735/panel of 1,201 | ~324 KB | **0.05%** |
| A1 only, at a 200k-bar master | **0** | 6.4 MB | 1.04% |

This is pinned as a named test cell, not just asserted in a report:
`bounding _panelFullRawData alone frees ZERO bar objects while the replay master co-retains`.

## 2. Why this also caps A2, which is the part that needs your ruling

A2 is compact bar storage — swapping the bar representation for parallel typed arrays. **A2 can only
recover a fraction of whatever the bar data weighs.** So the question that decides A2 is not "how
efficient is our bar representation", it is "how much of 586 MB is bar data at all".

Two independent methods answer that, and they agree:

1. **Direct measurement (this packet).** For `_panelFullRawData` to *be* 586 MB it would need
   6.4 million bar objects — 1.6 M per panel — which is 3.04 years of continuous 1m data per panel.
2. **Your own scaling test.** Modelling heap as a fixed part plus a data-proportional part, a
   **1.52x heap move across a 100–1000x data-range change** implies the data-proportional share is
   0.05%–0.53%: **0.3 to 3.1 MB of 586 MB.**

Two unrelated methods land in the same place. **Bar data is not the mass.** A1 is aimed at a term
that is 0.05–0.5% of the problem, and A2 is aimed at the same term.

I think `_panelFullRawData` was named the dominant retained structure by a **shared-retention
artifact**: both slots point at the same bars, so the bars get attributed to the nearest common
dominator rather than to either array. That is exactly the shape a retainer census produces when two
arrays alias one object graph.

## 3. Corrections to the ruling's premise — one of them is load-bearing

**The premise that four panels each retain a full 1m history is already substantially false at this
base.** `_buildIndependentHybridInitialMaster` is gated on `independentPair && displayTf !== '1m'`
(verified at chart.js L6112-6114) and already builds a **coarse native history spliced with 1m only
from the playhead's bucket onward**, with fetches capped at 2,000 bars. Under CONF-01 — four
different timeframes — that covers three of the four panels. **Viewport windowing has already taken
most of what A1 was dispatched to take.** That is the direct answer to your "does A1 remove anything
beyond existing windowing": mostly, no.

Also corrected, minor: the site count is **25, not 24** — `panel-cmd-bridge.js` L1761 holds a 25th,
in the inert same-pair family.

## 4. One correction I am making against my own author, so the record is right

My fix author reported that the two write-alias sites L4922 and L6364 are **not** same-pair gated,
and used that as its reason to refuse truncation. **That is wrong, and I verified the guard bodies
rather than the guard names.**

- `_multichartFinerSamePairPanelSelfOwns` (L4739) requires the same pair at L4743 —
  `if (!this._multichartSamePairAsHost(targetFileId)) return false;` — and additionally returns false
  for `_isIndependentMultichartPair()` at L4744-4747. The name does not lie.
- L4922 sits behind that predicate at L4899.
- L6364 is **doubly** gated: `const finerPanelSelfOwner = samePairAsHost && this._multichartFinerSamePairPanelSelfOwns({...})`.

So both are inert under CONF-01 and the alias trap remains inert, as the oracle author established
and as I journalled at 16:00. **This does not change the headline** — the zero-bar-objects result
rests on the shallow copy, which is reachable and which both authors measured independently. It
changes only the stated reason for not truncating, and it matters in the host-symbol topology, where
tile A is the host and those guards do pass.

## 5. What I landed, and why I am holding it rather than routing it

`62b6afcc9` routes all 24 `chart.js` assignments through one `_setPanelFullRawData(bars, reason)`
choke point — verified by me: exactly **one** bare write left in each mirror (the accessor's own at
L7219) and 24 routed call sites, both mirrors identical. Plus the window arithmetic, the oracle seam,
and kill-switch `__TALARIA_DISABLE_MC_BASE_SERIES_RESIDENCY_V1`.

**It deliberately does not truncate.** Verification: amended oracle 16/16 with the seam swapped onto
the real implementation, `mc-base-series-residency.test.mjs` 10/10, **26/26** combined; 8/8 mutants
killed on disk in both mirrors, 0 NOT_APPLIED.

**I am not routing it.** Shipping a behaviour-preserving refactor with zero measured benefit spends a
CKPT-01 checkpoint to buy nothing, on a data path, at 107% CPU. Its only value is as the A2 seam, and
A2 is exactly what is now in question. It sits on `manager-a/conf01-a1-fix-20260730`, tested and
ready, costing nothing while it waits.

There is also an unmeasured cost if anyone forces the bound: `_independentMasterCoversReplayTimestamp`
(L7386) uses master history depth to avoid a refetch that "would wipe the chart and show loading".
Bounding both slots to 480 bars pushes that predicate false and trades 0.05% of heap for refetch churn.

## 6. What I am asking for

Not permission to stop — a re-aim. **If bar data is 0.3–3.1 MB of 586 MB, then both landings I was
given are aimed at the wrong term, and A2 will produce the same negative result as A1 for the same
reason.** I would rather tell you that now than spend the packet proving it twice.

The retention census I dispatched before building either landing is still running and was
commissioned precisely to settle this; it is a per-array census under CONF-01 with fitted slopes per
DUR-01, and it will name what the mass actually is. I will report it the moment it lands.

Standing by that: A1's own answer is complete and negative, and I will not start A2 against a term
two independent methods have now capped below 1%.
