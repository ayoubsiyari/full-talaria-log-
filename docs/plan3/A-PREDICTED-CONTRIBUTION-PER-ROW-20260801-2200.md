# A: predicted memory contribution per cherry-picked row

Published before the soak, per the 14:55 ruling. Same form I used when I credited MEM-1b at
0 MB and MEM-1c at approximately 0 MB unprompted: the point is to be wrong in public and on
the record, not to claim credit.

Baseline for all figures: the ten-hour trade arm, against the 1,502 MB pre-fix reference.

## Rows landed

| Row | Commit | Predicted at 10 h | Confidence |
|---|---|---:|---|
| ABSENT-01 scale-in entry cap | `7608cd184` | **0 MB, conditionally** | high on the mechanism, low on the workload |
| ABSENT-02 CLUSTER-C paint starve | `b527a00bc` | **0 MB** | high |
| Whole-history indicator guard | `9fd71a460` | **0 MB, or −552 MB** | high |

### ABSENT-01, the entry-level cap — 0 MB unless the harness scales in

The defect is real and unbounded: `applyScaling` pushed into `group.entries` with no cap, and
each leg deep-clones the existing position's `tpTargets`, so it is a multiplier rather than a
single array.

**But it only bites if the workload scales in.** `applyScaling` is reached only when
`enablePositionScaling` is set *and* `scaleNextOrder` (or a pending order's
`scaleWithExisting`) is set. If the soak's trade generator places independent trades, this
path never executes and the row contributes exactly nothing tonight.

So my prediction is **0 MB**, with the caveat that it is a prediction about the harness, not
about the fix. If the trade arm does scale into the same direction repeatedly, the saving is
roughly `(legs − 4) × per-leg cost` per group, and the per-leg cost is dominated by the
cloned `tpTargets` array — small per leg, unbounded in aggregate. I would rather record 0 and
be corrected than claim a number the workload may not exercise.

This row was worth landing on correctness grounds regardless: it is a money-path invariant
that one writer enforced and another ignored.

### ABSENT-02, CLUSTER-C paint starve — 0 MB

A paint-cadence fix. It changes *when* a tile repaints, not how many bars are retained, and
it replaces N synchronous paints with one coalesced rAF handle per frame. If the memory arm
moves tonight it will not be this. Look for it in the CPU and paint-occupancy trace instead.

### The whole-history guard — 0 MB, or it forfeits the entire MEM-1a claim

This one has **negative expected memory value and positive correctness value**, and it is the
single most important line in this document.

OBV, VWAP, PSAR and seasonality accumulate from the start of the series. Trimming the master
changes the values they plot, not merely what is on screen. So both EVICT-03 and the
pre-session bound now stand down while one of those is active.

- With no whole-history indicator active: **0 MB**. Both trims behave exactly as predicted.
- With any one of them active: **both trims are inert**, residency grows as it did this
  morning, and **the entire 552 MB prediction is void** — not degraded, void.

**The soak must record which indicators are enabled**, in the passport beside bar count and
trade count. Without that record, a run that lands near 1,502 MB cannot be told apart from a
run where the trims never fired, and the attribution verdict is lost for a reason that has
nothing to do with MEM-1a.

## Rows dropped, not rushed

Both are residency/window rows in my territory, and both are dropped for the same reason the
Director flagged: they overlap what EVICT-03 already bounds.

| Row | Commit | Why dropped |
|---|---|---|
| A1 residency null/epoch playhead | `512207d3a0` | fixes a module this tree does not have |
| residency window ships inline | `9e0a8ad591` | adds a second trimmer over the same master |

`512207d3a0` is a good fix to a real `Number(null) === 0` trap — the same trap I hit in
`_oldestOpenPositionTimestamp` today, which is why I took it seriously. But its pre-image
(`const playheadTs = Number(this._resolveMultichartReplayPlayheadMs());` inside the
base-series residency window) **does not exist in this tree**, and neither does the enclosing
function or any of `mcBaseSeriesResidency` / `BASE_SERIES_RESIDENCY`. It is a patch to a
module carried by `9e0a8ad591`, which is the row that ships that module inline.

Taking the pair would put a second, independently-tuned window over the same master that
EVICT-03 bounds. Two trimmers with different floors, different runways and different
kill-switches, landing hours before an unattended ten-hour run, is how you get a
non-reproducible residency trace and cannot tell which cap produced it. **If they land, they
should land together, in daylight, with one owner reconciling the two floors** — not tonight.

## Rows still absent in my territory

Not picked, listed so they are not lost. All paint-cadence, all predicted at approximately
0 MB for the memory arm on the same reasoning as ABSENT-02.

| Commit | Row |
|---|---|
| `19445633da` | single-chart 60x paint cadence behind SC kill-switch |
| `2e283b3ae7` | bound candle setInterval tick via rAF paint split |
| `4c2823d410` / `fe9ec13326` | FIX1 skip by visibility, not focus (duplicates) |
| `5f2d137a89` | FIX1 paint-only background-panel render cadence |

## Standing summary of my own memory rows

Unchanged from this morning, restated so the whole predicted split is in one place.

| Row | Predicted at 10 h |
|---|---:|
| MEM-1a EVICT-03 | 552 MB (the entire claim) |
| MEM-1b LRU caps | 0 MB |
| MEM-1c pre-session bound | approximately 0 MB |
| MEM-1d dedupe | small, entry-time only |

MEM-1a carries the prediction alone, and the whole-history guard is now the condition on it.

## Attempted and aborted: `19445633da` (cpu-ceiling-60x paint cadence)

Attempted at 22:07, aborted at 22:10, tree reset to the committed tip. Recorded because the
next person to try it will hit the same wall and should not have to rediscover it.

It conflicts in four product files, but the blocking one is a single 30-line hunk in
`replay-system.js` that is a **semantic collision, not a mechanical one**:

- **HEAD** is my mirror-paint coalescing fix. It clears `chart.renderPending` *before*
  painting, deliberately. Setting it first left the coalescer armed, `animate()` saw the
  flag on the next frame and repainted the same state — two host paints per tick.
- **Incoming** adds the 60x paint budget and, in its non-passive branch, restores
  `chart.renderPending = true;` immediately before `chart.render()` — precisely the
  ordering that fix removed.

Taking incoming silently reverts the coalescing fix. Taking HEAD drops the paint budget.
The correct resolution interleaves them: apply the budget *and* keep clear-before-paint. That
is a real design decision in the paint path and needs the mirror-paint cadence oracle and the
60x gate both green, plus mutants, which does not fit before the cut.

The root cause is ordinary: this row was authored against a tip that did not yet have the
coalescing fix, so the two rows genuinely disagree about `renderPending` ordering. Whoever
takes it should treat reconciling that ordering as the work, not the conflict markers.

Predicted contribution unchanged at approximately 0 MB for the memory arm, so nothing in
tonight's verdict turns on it.