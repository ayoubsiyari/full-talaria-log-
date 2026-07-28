# ESCALATION — `multiInstrumentSession.current_time` has an undeclared invariant that three writers violate

**From:** Manager B · **Row:** M10 · **Raised:** 2026-07-28
**Status:** mechanism confirmed by code reading; symptom matches the PO's Test-2 report
**Requires:** a Director ruling on the ownership split, and a Manager A packet for the `chart.js` consumers

---

## One-paragraph summary

`orderService.multiInstrumentSession.current_time` is documented in `chart.js` as *"the global session clock"* and is trusted, above the actual replay position, to decide where to seek the replay playhead. It is supposed to hold a **bar time**. Three separate writers can put a **wall clock** in it, and the value is persisted to the server and restored behind a guard that cannot tell the two apart. The visible symptom is the PO's report — after a rollback and a new order, an open trade's duration reads wildly wrong and far too large — but the same field also steers `goToReplayTimestamp()`, so the blast radius is larger than a label.

## The mechanism

| Step | Location | What happens |
|---|---|---|
| 1 | `order-manager.js:28776` `placeAdvancedOrder()` | placing an order calls `recomputeSharedMarginState()` |
| 2 | `order-service.js:446` | a **margin** function stamps `current_time = Date.now()` |
| 3 | `order-manager.js:32937` `_m19DockNowTs()` | reads `current_time` as **tier 1**, above both replay-time tiers |
| 4 | `order-manager.js:32955` `_m19DockTimeLabel()` | `mins = (nowTs − openTs)/60000` → wall clock minus a replay bar time |
| 5 | `order-manager.js:32957` | the clamp corrects **only** when `mins > 60*24*365` |

Step 5 is why this reads as intermittent: replaying data older than a year self-corrects and looks fine; anything newer displays the wrong figure uncorrected. A defect whose visibility depends on the age of the dataset gets closed as unreproducible.

**Why the repro is "rollback, *then* a new order":** `updatePositions()` (`order-manager.js:31987`) does rewrite the value back to `activeCandle.t`, but a rollback pauses replay. No ticks, so nothing re-runs it, and the bad stamp persists for as long as the trader looks at it. *(ASSUMPTION: I verified the pause call and the early returns, not that no other caller re-runs `updatePositions()` while paused.)*

## Why this is not only a display bug

**It is persisted.** `session_current_time` is serialised into the runtime patch (`order-manager.js:4177-4180`) and restored (`:7474-7479`) behind a guard that is only `Number.isFinite` — which a wall-clock millisecond value passes trivially. The patch reaches sessionStorage, localStorage, and a `PATCH /api/sessions/.../state`.

**It is treated as authoritative.** `chart.js:10194-10200`, on a pair switch during replay, ranks it **above** `replay.replayTimestamp` and feeds it to `goToReplayTimestamp()`. A wall-clock value seeks the playhead past the end of the historical data. `_captureReplayPlayheadMs` (`chart.js:24191`) uses it as a last-resort playhead.

## Three independent sources, not one

| # | Source | File | Owner |
|---|---|---|---|
| 1 | construction seed `current_time: Date.now()` | `order-service.js:38-49` | **B** |
| 2 | margin recompute stamp | `order-service.js:446` | **B** |
| 3 | restored persisted value, guarded only by `Number.isFinite` | `order-manager.js:7474-7479` | **B** |

Source 1 is reachable and not theoretical: the initial panel update runs on a timeout, and `updatePositionsPanel()` calls `persistRuntimeOrderState()` at its end, so the construction wall clock can be **persisted before any bar-time writer has ever run**.

**Removing the margin stamp alone is insufficient.** It would leave sources 1 and 3 live and reduce the duty cycle without removing the defect — which is worse than not fixing it, because it would read as fixed.

## The hard part

A bar time and a wall clock are both epoch milliseconds. **They cannot be told apart by inspecting the value.** So the restore path cannot simply validate it. The two sound options:

1. **Make absence representable.** Seed `null` instead of `Date.now()`, never write a clock from a margin function, and make every consumer handle *absent* explicitly rather than coercing. This is the honest model — "we do not yet know the session time" is a real state and the code currently has no way to say it.
2. **Bound against loaded data.** A legitimate `current_time` never exceeds the last loaded bar of the dataset. This is checkable, but it needs the dataset in scope at every write and restore site.

I am not choosing between these unilaterally: option 1 changes what A's consumers receive, and option 2 needs data A owns.

## What I am asking for

**Manager A packet** — the three consumers in A's territory, once the field's contract is decided:

- `chart.js:10194-10200` — pair-switch seek. Should `current_time` really outrank `replay.replayTimestamp`? The ranking comment asserts a reliability this field does not have.
- `chart.js:24191` `_captureReplayPlayheadMs` — last-resort playhead.
- `chart.js:11411` `_writeTradingSessionLocalBackup` — serialises it into the local backup.

**Director ruling** — whether the field's invariant is declared as option 1 or option 2. That decision belongs above me because it changes an interface two managers depend on.

**Mine either way, and I will proceed on these:** the three writers, `_m19DockNowTs` tier ordering, and `_m19DockTimeLabel`. RED first, and the RED must fail on **all three** sources — a gate that only catches the margin stamp would certify the partial fix.

## Not claimed

- I have not reproduced this in a browser. The chain is established by reading code, and every link is cited above.
- I have not established that a wall-clock `current_time` has *actually* been persisted on the PO's deployment — only that the path exists and is reachable.
- The `dist-v9` minified bundle contains `current_time` references I could not attribute to a function; unassessed.
