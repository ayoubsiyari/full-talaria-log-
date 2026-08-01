# PO Check — Completed Bar Changes After It Closes

Goal: verify whether a closed candle changes after the replay playhead has moved on.

This is visually observable in multichart replay if a same-symbol panel's completed bar is being patched by the host current price.

## Setup

1. Open a multichart layout with two panels on the same symbol.
2. Put the host/left panel on the finest available replay interval, for example `1m`.
3. Put the second panel on a coarser timeframe for the same symbol, for example `15m`.
4. Start replay and pause after the second panel has at least one fully closed candle.

## Check

1. On the second panel, pick the most recent candle that is already closed.
2. Note its close value from the OHLC/header/crosshair readout, or take a screenshot.
3. Step the replay forward on the host panel so the host current price changes, but do not let the selected second-panel candle become the active forming candle.
4. Move the crosshair back over the same closed second-panel candle.

## Pass Condition

The old candle keeps the same close, high, and low after the host price changes. Its body/wicks do not move, and the OHLC readout for that same timestamp is unchanged.

## Fail Condition

The already-closed candle changes shape or its close/high/low readout changes after the replay has moved on. That is the canary blocker: history changed without an edit, reload, or new data import.

## If The PO Cannot See It

If the PO cannot make the closed candle visibly change using the steps above, record that. It means the product defect may be limited to internal data mutation in a sync path, not a visible canary blocker, and engineering should decide using the RED gate rather than PO visual confirmation alone.
