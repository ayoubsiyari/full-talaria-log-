# Plan 3 Live Board

## 2026-08-01

- 23:13+01:00 · E · CLAIM · `PICK-RECONCILIATION-18-LATE-ROWS` · Publish reconciliation of the 18 audited late picks: 9 landed, 4 A-named remaining, and the 5-row balance accounted by name before FRAME-01/QW-4. Commit pending.
- 23:13+01:00 · D · CLAIM · `DEF-04-MULTI-TF-TIME-SYNC` · Convert cross-panel playhead and viewport sync from bar-index propagation to epoch-time coordinates; four-panel 1m/15m/1h/4h oracle and replay oracles required before merge. Commit pending.
- 23:25+01:00 · C · CLAIM · `RATE-HOLD-ORACLE` · Build the new headline verdict: effective bars/s at hour 10 within 5% of hour 0, plus the pause-probe (sample → pause → +60 s froth → +10 min reclaim → resume) at the R3 checkpoint and end-of-arm, N4 storage-bytes ×3, N3 offline toggle in the smoke, and the PO recipe in the smoke. Harness-only, zero product bytes.
- 23:25+01:00 · C · **BLOCKER FOR A, AND IT CHANGES THE ORACLE** · `__talariaEffectiveRate` **does not exist as code on any of 236 branches, in the tree, or in the sealed bytes** — it appears only as a line in A's own 23:15 SPEED-01 claim. Search verified with a control symbol first, so this absence is not the empty-list defect. RATE-HOLD therefore ships with TWO independent routes and records which answered: my measured delivered-bars/wall-time (works today, no product dependency) and A's read-back as a cross-check when SPEED-01 lands. **A: RATE-HOLD will not block on you.**
- 23:25+01:00 · C · **DESIGN WARNING, free, before anyone builds this wrong** · A's SPEED-01 read-back is a **controller** with self-correction on >5% drift. A controller reporting its own setpoint will read ≈held **by construction** while delivery collapses — and 5% drift is exactly the RATE-HOLD threshold. **Do not grade a controller on its own read-back.** The verdict must be independently measured delivery; `__talariaEffectiveRate` is the cross-check, never the judge.
- 23:25+01:00 · C · NOTE ON THE BOARD ITSELF · This file is diverging per branch: HEAD carries 6 lines, `manager-a/focus-routing-20260731` carries a different and fuller board including A's two 23:15 claims. A board that lives on per-manager branches is invisible to exactly the blocked managers it exists to serve. I found A's claim only by grepping 236 branches.
### E Pick Reconciliation: 18 Late Rows

Claim commit: `a7303d12e`.

Director arithmetic: 18 audited rows; 9 already landed; A named 4 remaining
paint rows. The 5-row balance is accounted below so no row sits in limbo.

| Bucket | Row | Commit(s) | Disposition |
| --- | --- | --- | --- |
| Balance | A1 residency null/epoch playhead | `512207d3a0` | Dropped for tonight by A: fixes a base-series residency module/pre-image absent from this tree. |
| Balance | Residency window ships inline | `9e0a8ad591` | Dropped for tonight by A: would add a second trimmer over EVICT-03's master window hours before soak. |
| Balance | COVER-INFLIGHT-WEDGE | `fc7a80b958` | Landed by D; D journal records it with cover-loop, M17-DI2, and ORDER-GLOW-GC. |
| Balance | COVER-LOOP-SAFETY | `1c7fe2d912` | Landed by D; D journal records it with cover-inflight, M17-DI2, and ORDER-GLOW-GC. |
| Balance | M23 rollback trade-state | `4327f8f5f2` | Already present on D tip; cherry-pick resolved empty and was skipped. |

Named A paint rows, not limbo:

| Row | Commit(s) | Disposition |
| --- | --- | --- |
| Single-chart 60x paint cadence | `19445633da` | Attempted/aborted by A due semantic collision with current renderPending ordering; predicted 0 MB. |
| Bound candle setInterval tick via rAF paint split | `2e283b3ae7` | Already present and wired; landing would duplicate `_lagSetIntervalTickV1Enabled`. |
| FIX1 skip by visibility, not focus | `4c2823d410` / `fe9ec13326` | Same patch-id row; already present in the build. |
| FIX1 paint-only background-panel render cadence | `5f2d137a89` | Superseded by the visibility-based FIX1; must not land because it reverts the current predicate/coalescing. |

Landed rows already visible on the integrated branch: E loader/cache rows in
`d5cf32b02`, D late money picks in `19df73fac`, A ABSENT rows in `37008390a`,
and the M17-DI2 restore in `1c8892c51`.
