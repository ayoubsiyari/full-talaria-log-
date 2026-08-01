# FINDING — the multichart leak collapsed on b85 (2026-07-29 13:40)

PO measurement on the canary, `31.97.192.82:3000/chart/index.html?mode=backtest&sessionId=903`.
Surface verified from the PO's console: `chart.js?v=20260729b85`. All four leak kill-switches
confirmed ON (absent) in the same console output. The instrument is `usedJSHeapSize` after forced
collection, per the instrument ruling that retired Task Manager.

## Result

| | Baseline | Cycle 1 | Cycle 2 | Cycle 3 | Deltas | Accumulated |
|---|---|---|---|---|---|---|
| **b82** | 124 | 188 | 218 | 288 | +64, +30, +70 | **+164 MB** |
| **b85** | 75 | 80 | 72 | 90 | +5, −8, +18 | **+15 MB** |

Per-cycle growth fell from ~55 MB to ~5 MB. Accumulated growth fell 91%. Idle baseline fell 40%.

## Why this is a kill and not noise flattering us

**Cycle 2 went down.** Memory dropped from 80 to 72 across a full multichart open/close. A leak
cannot return memory. Monotonic accumulation was the defining property of every measurement we took
for two days, and it is gone. What remains — +5, −8, +18 — is a series that changes sign, which is
the signature of collection timing around a flat line.

**The session-size confound does not apply.** The PO's baseline fell from 124 to 75, which would
normally raise the question of whether a smaller session was used, making the comparison unfair.
It does not matter here: `FINDING-LEAK-CONFIRMED-DATA-INDEPENDENT-20260729-0255.md` established by
direct measurement that the leak ran at ~50 MB per cycle **independent of data volume and symbol
count**. A smaller session cannot take 55 MB/cycle down to 5.

## What killed it — not yet attributed

Four fixes shipped together across b83–b85, deliberately, under the multi-fire ruling:

- `__TALARIA_DISABLE_MC_PANEL_STATE_PURGE_V1` (b83) — parent-side per-panel state purge
- `__TALARIA_DISABLE_MC_GRID_STATE_PURGE_V1` (b83) — grid releases panel refs
- `__TALARIA_DISABLE_MC_BAR_STORE_REALM_V1` (b84) — bar store constructed in host realm
- `__TALARIA_DISABLE_MC_CLEARFILE_ON_REMOVE_V1` (b85) — removeChart releases bar-store file refs

We do not know which one did the work, and under the multi-fire model we accepted that trade
deliberately: speed first, attribution by flag bisect afterwards. Attribution is now optional for
canary and mandatory before we delete any of the four.

Note that the bar-store realm fix landing effectively is interesting given
`RETRACTION-BAR-STORE-AND-SWEEP-ORDER-20260729-0350.md` refuted the bar store as the *dominant*
mechanism. Both can be true: disabling the shared store did not stop the leak, but constructing it
in the correct realm may still have removed a large retainer. Do not treat the retraction as
overturned without a bisect.

## Honest limits

- **Three cycles is a short run.** A genuine 5 MB/cycle residual would still cost 300 MB over sixty
  cycles. The sign reversal argues against it being real, but three points cannot prove flatness.
  Extension to six cycles requested from the PO.
- **One run, one operator, one session.** C's `HEAP-CYCLE-MEMORY-V1` gate must reproduce this
  independently. If C's gate disagrees with the PO's numbers, that disagreement outranks both.
- **This is the multichart teardown leak only.** It says nothing about the single-chart CPU ceiling
  (111% at 60x), which remains uncharacterised, and nothing about smoothness.

## Status changes

- The memory leak is **downgraded from canary blocker to open-and-bounded**, pending the six-cycle
  extension and C's independent grade.
- M26 and FIX 3 remain `ungraded`; they were measured with the retired instrument and C still owes
  a re-grade. It is possible one of them was working all along and we could not see it.
- A's remaining leak shots are **demoted from urgent**. A's priority returns to FIX 1 remediation
  (the blank-grid regression) and the CPU ceiling.

## Credit where it is due

This came from the PO's directive to stop diagnosing and start shooting. Four suspects were killed
simultaneously behind independent switches instead of being investigated one at a time. On the
prior operating model we would still be arguing about which one to try first.
