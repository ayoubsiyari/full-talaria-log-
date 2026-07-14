# A3 step 3 (Lane 3) — replay cadence + mode-routing fixes (two gated commits)

**Cold-start:** read `INVARIANTS.md`, `WORKER-REPORT-STANDARD.md`, `D-009` in `DIRECTOR-DECISIONS.md`, the A3 diagnostic (`worker-reports/A3-lane3-replay-mode-cadence-diagnostic-report.md`), and your A3 step-2 harness scenarios (the RED acceptance contract). Engine mirrored both trees (SHA256).

**Authorized by D-009.** Two mechanisms → **two separate gated commits**, in this order.

## Fix 1 (FIRST) — interval cadence correctness (TAL-01581)
- **Switch:** `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` (default ON).
- Unify interval ownership: wire the V9 slider (`setByIndex()` / `applyReplayIntervalFromClone`) to `replaySystem.setStepTimeframe()`; delete the dead `_replayIntervalRawCandles` write; implement the empty `timeframeSelect` change handler (`setStepTimeframe` + `_restartPlaybackAfterControlChange` when playing); align multichart `replaySetStepTf` payload to the resolved interval.
- Deterministic step bars: 4h interval on 4h TF / 1m master steps a consistent bucket (no mixed 1-bar/240-bar); no double-step on play start.
- Acceptance: A3 step-2 cadence scenarios (deterministic step bars, single interval owner) RED→GREEN; switch OFF RED.

## Fix 2 (SECOND) — mode-play routing (TAL-01582), behavioral ruling (A)
- **Switch:** `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (default ON).
- **Ruling (A):** **tick mode persists** when an explicit interval is set; the **interval bounds step size only** — tick + interval must play as **tick animation with the interval as step bounds**, NOT a silent fall to the candle loop. **UI shows both** (mode = Tick, interval = e.g. 4h).
- Acceptance: A3 step-2 mode scenarios (tick survives explicit interval; UI/behavior agreement) RED→GREEN; switch OFF RED.

## Constraints
- I3: one mechanism per switch/commit; land Fix 1, then Fix 2. I11: do not touch `applyReplayFrame`/seek/follow. Both trees byte-identical (SHA256). Full gate green (I9). Build id via Manager. P6: quote TAL-01581/01582.

## DELIVER
`worker-reports/A3-step3-replay-fixes-report.md` per WORKER-REPORT-STANDARD — per-fix diff + switch, RED→GREEN on the A3 step-2 harness, gate result, SHA256. **PO live confirm** (handoff): Tick + 4h interval → tick animation with 4h step bounds; candle + 4h steps consistent buckets.
