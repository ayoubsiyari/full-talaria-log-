# PO protocol — grade the four leak shots on b85

Four leak fixes are live on the canary and none has been graded. This test answers one question:
**did the ~50 MB per multichart cycle get smaller?**

## Before you start

Surface: `http://31.97.192.82:3000/chart/index.html?mode=backtest&sessionId=903`

In the console, confirm the build:

```js
document.querySelector('script[src*="chart.js"]')?.src
```

**It must read b85.** If it reads lower, stop and tell me — B deployed b85 at 13:09 and anything
older means you are testing the wrong code.

Then confirm all four fixes are actually ON (they are ON when the flag is absent or false):

```js
['__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1',
 '__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1',
 '__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1',
 '__TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1'
].map(f => f + ' = ' + (window[f] === true ? 'OFF (fix disabled!)' : 'ON'))
```

All four must say ON. If any says OFF, you still have a flag set from a previous test — clear it
with `delete window.<flagname>` and re-check.

## How to measure (this is the only valid instrument)

Task Manager is retired — it over-reports by about 2.9x because it counts allocator pages the
browser hasn't handed back. Every number below is JS heap after a forced collection:

1. DevTools → **Memory** tab → click the **trash-can (collect garbage)** icon.
2. Wait 3 seconds.
3. In the **Console**, run:

```js
(performance.memory.usedJSHeapSize/1048576).toFixed(0) + ' MB'
```

Do all three every time. The trash-can step is what makes the number mean "retained" rather than
"allocated."

## The test

Use the **same session shape as your last run**: 12 symbols, 3 months of data. That run on b82 gave
124 → 188 → 218 → 288 MB, so we have something real to compare against.

| # | Do this | Then measure |
|---|---|---|
| **Baseline** | Load the session as a single chart. Let it settle 30s. Do not replay. | Record |
| **Cycle 1** | Switch to 4-panel multichart. Let it load. Switch back to single chart. | Record |
| **Cycle 2** | Switch to 4-panel multichart again. Let it load. Switch back to single chart. | Record |
| **Cycle 3** | Once more: to multichart, back to single. | Record |

Record: baseline ___ / cycle 1 ___ / cycle 2 ___ / cycle 3 ___

## What the answer means

The number that matters is the **gap between consecutive cycles**, not the totals.

- **Gap around 50 MB and steady** — the four shots missed. The Hoarder is something none of them
  touched, and A goes back out with the remaining suspects.
- **Gap clearly smaller, say 10-20 MB** — we wounded it. Partial win; we bisect by flag to find
  which of the four did the work, then hunt the remainder.
- **Gap near zero and flat across all three cycles** — the leak is dead. This is the result that
  clears the biggest canary blocker.
- **Gap grows each cycle** — worse than before, and one of tonight's four fixes caused it. Tell me
  immediately and I will have B roll the build back; that is exactly what the kill-switches are for.

## If it's still leaking — the bisect

Only do this if the gap is still large. It tells us which fix, if any, is doing anything:

Set one flag to `true`, reload, and repeat two cycles. Repeat for each flag in turn.

```js
window.__TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1 = true   // then reload
```

The flag whose removal makes the gap *jump* is the fix that was carrying the weight. All four are
verified flippable without a reload, so you can also toggle mid-session if you prefer.

## Time

About 12 minutes for the main test. The bisect is another 15 and only runs if we're still leaking.
