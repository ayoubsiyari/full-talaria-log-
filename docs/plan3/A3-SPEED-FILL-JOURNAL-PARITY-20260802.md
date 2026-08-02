# A3 Speed Fill / Journal Parity — 2026-08-02

## Verdict
PASSED on today's candidate build.

Same deterministic session setup at `1x` and `10x` produced identical fills and an identical normalized journal.

## Surface
- Local served `chart/dist-v9` candidate bundle.
- Build read-back: `20260728b85`.
- Scenario: one `BUY` market order at replay timestamp `1785547740000`, take-profit target in the next bar, real replay playback at `1x` and `10x`.

## Result
- `1x`: one closed trade, one journal row, zero open positions.
- `10x`: one closed trade, one journal row, zero open positions.
- Normalized digest for both arms: `b4a999ca9828f1ecebb54a8d98e97dc6ec332f7a6b03fdb030018e67013cfeff`.

Matched money-path fields:
- `ticker`: `EURUSD`
- `direction`: `BUY`
- `entryPrice`: `0.94722`
- `closePrice`: `0.98615`
- `pnl`: `3893`
- `quantity`: `1`
- `openTime`: `1785429540000`
- `closeTime`: `1785547800000`
- `takeProfit`: `0.94736208`
- `stopLoss`: `0.899859`

## Caveat
This was a bounded one-off browser measurement using existing harness helpers and local candidate bytes, not a new committed product gate. It did not mutate a deployed user ledger.
