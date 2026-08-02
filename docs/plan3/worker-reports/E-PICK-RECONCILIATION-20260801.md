# E Pick Reconciliation

**Manager:** E  
**Date:** 2026-08-01  
**Row:** `PICK-RECONCILIATION-18-LATE-ROWS`  
**tier=MID**  
**model=GPT-5.5 Medium Fast**

## Verdict

No audited late-pick row is in limbo.

Director arithmetic:

- 18 audited rows.
- 9 landed.
- 4 A paint rows closed as already-present-or-superseded.
- 5 remaining balance rows are named below.

## Five-Row Balance

| Row | Commit | Disposition |
| --- | --- | --- |
| A1 residency null/epoch playhead | `512207d3a0` | `CANNOT-APPLY`: the base-series residency module/pre-image is absent from this tree. Evidence from A's report: neither the enclosing function nor `mcBaseSeriesResidency` / `BASE_SERIES_RESIDENCY` exists here. |
| Residency window ships inline | `9e0a8ad591` | `CANNOT-APPLY`: A answered on `BOARD-A.md` that the pre-image is absent from this tree (`_residencyWindowMarginBars()`, `_estimateResidencyVisibleBarCount()`, `chart v 1.4/chart/modules/residency-window.js`, `TalariaResidencyWindow`, `preferHead`, `anchor:'end'`, and `estimateTailLookback` are absent). A also stated EVICT-03 could not absorb it because EVICT-03 trims `fullRawData` behind the playhead during replay, while this row is a chart.js load-path windowing fix. |
| COVER-INFLIGHT-WEDGE | `fc7a80b958` | Landed by D; D journal records it with cover-loop, M17-DI2, and ORDER-GLOW-GC. |
| COVER-LOOP-SAFETY | `1c7fe2d912` | Landed by D; D journal records it with cover-inflight, M17-DI2, and ORDER-GLOW-GC. |
| M23 rollback trade-state | `4327f8f5f2` | Already present on D tip; cherry-pick resolved empty and was skipped. |

## A Paint Rows

| Row | Commit(s) | Disposition |
| --- | --- | --- |
| Single-chart 60x paint cadence | `19445633da` | Attempted/aborted by A due semantic collision with current `renderPending` ordering; predicted 0 MB. |
| Bound candle setInterval tick via rAF paint split | `2e283b3ae7` | Already present and wired; landing would duplicate `_lagSetIntervalTickV1Enabled`. |
| FIX1 skip by visibility, not focus | `4c2823d410` / `fe9ec13326` | Same patch-id row; already present in the build. |
| FIX1 paint-only background-panel render cadence | `5f2d137a89` | Superseded by visibility-based FIX1; must not land because it reverts current predicate/coalescing. |

## Landed Anchors

- E loader/cache rows: `d5cf32b02`.
- D late money picks: `19df73fac`.
- A ABSENT rows: `37008390a`.
- M17-DI2 restore after ABSENT-02 collision: `1c8892c51`.
