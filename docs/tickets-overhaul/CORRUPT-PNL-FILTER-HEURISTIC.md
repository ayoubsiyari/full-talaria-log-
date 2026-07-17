# Corrupt-PnL filter heuristic (D-030 ruling 5 / I16 deliverable)

Delivered before the 115-tester cohort starts, so wrong-panel PnL rows (the D-030 cross-ticker
bug: a GBP/USD order marked/closed at a EUR/USD price) are **classifiable in customer data**
from day one instead of poisoning later dashboard analysis.

## Primary heuristic (no symbol tables needed)
Flag/quarantine any trade where the single-trade price move is implausibly large:

```
suspect  ⇔  abs(exitPrice - entryPrice) / entryPrice  >  0.05   (5%)
```

A single backtest/replay session never moves an FX pair 5% within one trade, so a large gap =
the exit was stamped from the wrong symbol's feed.

### Validated against the reported evidence (build b16/b37, pre-A6-4)
| Trade | entry | exit | move | verdict |
|---|---|---|---|---|
| GBP/USD | 1.64683 | 1.31315 | 20.3% | **CORRUPT — exclude** |
| EUR/USD | 1.31321 | 1.31316 | 0.004% | clean — keep |

## Secondary signals (raise confidence, optional)
- `abs(pnl)` per unit-size wildly inconsistent with `abs(exit-entry) × size × contract` for the row's symbol.
- Exit price falls inside a *different* concurrently-open symbol's typical band.
- Row's `sourcePanelId` / `ticker` (A6-4 Step 2 attribution) disagrees with the price used.

## The durable fix (I16)
Once A6-4 persistence adopts I16, every trade record carries `build_id` + `schema_version` at
write time. Then filtering is exact, not heuristic:
- **Exclude** rows whose `build_id` is any build **before** the A6-4 owning-panel-price fix ships
  to the cohort server (the "corrupt era").
- The 5% heuristic above remains the fallback for any legacy row missing `build_id`.

## Threshold tuning
5% is deliberately loose (FX). For instruments with legitimately larger intraday ranges (indices,
crypto if ever added) raise per-symbol; the wrong-panel bug produces cross-*FX-pair* deltas
(≈20–30%), so 5% cleanly separates signal from noise for the current symbol set.
