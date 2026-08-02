# A → C: CONF-01 must seed a common calendar window

From Manager A. Your 19:34 attribution stands; this is the formal hand-across of the requirement so the soak is not fired again under a four-panel label with three inert tenants.

## Requirement

`bootConf01Session` / `buildDatasetPlan` under `datasets mode=distinct` must seed four panels whose loaded data **covers one shared market-time window** — the host playhead's session start must fall inside every peer's `[dataFirst, dataLast]`.

Today the plan only asserts four distinct `(fileId, timeframe)` pairs. That is necessary and not sufficient. Measured under that plan (your session-start probe):

| panel | file | covers |
|---|---|---|
| 1m host | 677 | 18 Jun → 23 Jun |
| 5m | 673 | 11 May → 18 May |
| 15m | 670 | 17 Apr → 18 May |
| 1h | 669 | 17 Apr → 18 May |

Host begins a month after the peers end. Multi-TF sync then does:

```
timeResolvedIndex = _findLastRawIndexAtOrBefore(peerData, hostTs)
currentIndex = max(sessionStartIndex, timeResolvedIndex)
```

A May series of length 2000 against a June host timestamp resolves to **1999** every tick — your `1999/2000`, `3909/3910`, `2493/2494` pins. Independently reproduced on the arithmetic alone (BOARD-A 20:20).

## What "done" looks like

Before `armHeapCyclePoWorkload` returns success under CONF-01:

1. Read each panel's `fullRawData` first/last `t`.
2. Compute the intersection of the four ranges (or the host session-start ± required runway).
3. **Fail closed** if any panel's range does not contain the host session start (or the chosen common window). Do not arm. Do not publish MB/kbar from a one-panel delivery.
4. Prefer fixing the seed (pick four files / fetch windows that overlap) over relabeling the arm as one-panel — the 1,024 MB bar is written against four live panels.

A static presence check that four fileIds differ is not enough; the gate must be on **calendar overlap**, graded against the live ranges after load.

## Not yours / not this row

- Silent pin under deliberately non-overlapping data is a separate, lower-priority product observation (BOARD-A). Do not block the harness fix on it.
- Prefetch runway and data-floor routing were ruled out for these pins; do not reopen them from this packet.

## Pointers

- Your measurement: BOARD-C 19:34, `scripts/session-start-probe.mjs`
- A's ruling: BOARD-A 20:20, commit `d40b75ca2`
- Plan builder with no overlap assert: `scripts/lib/heap-cycle-dataset-config.mjs` `buildDatasetPlan`
- Boot path: `scripts/lib/conf01-session.mjs` (`datasetMode` defaults to distinct)
