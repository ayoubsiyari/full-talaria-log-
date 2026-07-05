# Multichart Baseline Results

This is the permanent regression matrix. Phases 1-4 all measure against these exact scenarios, and S1/S11 are the frozen single-chart reference.

## Capture Header

- Deployed build id: 20260627b586
- Baseline capture date: 2026-07-05 (D-008 gate scenarios S1, S6, S11 COMPLETE; S2–S5, S7–S10 still TODO)
- Diagnostic fields exposed by `window.__mcDiagReport()`: `panelId`, `fetches`, `fetchedBars`, `extendsFromParent`, `resamples`, `renders`, `seams`, `lastFetchMs`

## How to run

Use the live deployed browser build after Task 0.1 diagnostics have been signed off and deployed.

For each scenario:

1. Configure the chart exactly as listed in the scenario.
2. Open the browser console on the top window.
3. Before the scenario, run:

   ```js
   window.__mcDiagReset()
   ```

4. Perform the scenario's exact gesture.
5. After the gesture completes, run:

   ```js
   window.__mcDiagReport()
   ```

6. Paste the resulting table into that scenario's results table.
7. Also record:
   - Console error count and first error line.
   - Subjective smoothness score from 1-5, where 1 is unusable and 5 is smooth.

## S1 - Single Chart Drag Right

**Do this:** Single chart, backtest replay paused, drag right 3 screen-widths (old data loads).

**Configuration:**

- Layout: single chart.
- Date-Range/viewport sync: N/A.
- Symbol sync: N/A.
- Pair configuration: single active pair.
- Replay state: backtest replay paused.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | 3 | 6000 | 0 | 6 | 899 | 0 | 674 |

- Console errors: flagcdn.com flag-image CORS/ERR_FAILED (external asset, pre-existing; unrelated to engine)
- Smoothness 1-5: (PO reports single-chart pan fast/perfect)
- Build: 20260627b586. Capture: `reset → drag → report`.
- Supplementary single-chart reference (1d drag, same build): HOST fetches 5, fetchedBars 4359, extendsFromParent 0, resamples 11, renders 800, seams 0, lastFetchMs 98.

## S2 - 2×2 Same-Pair Sync ON, Drag Tile A

**Do this:** Same as S1 but 2×2 same-pair, sync ON, drag TILE A.

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: ON.
- Symbol sync: ON.
- Pair configuration: all panels same pair/fileId.
- Replay state: backtest replay paused.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Console errors: TODO
- Smoothness 1-5: TODO

## S3 - 2×2 Same-Pair Sync ON, Drag Panel B

**Do this:** Same as S2 but drag PANEL B.

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: ON.
- Symbol sync: ON.
- Pair configuration: all panels same pair/fileId.
- Replay state: backtest replay paused.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Does B fill while dragging or only at mouse-up?: TODO
- Console errors: TODO
- Smoothness 1-5: TODO

## S4 - 2×2 Same-Pair Sync OFF, Drag Panel B Right

**Do this:** 2×2 same-pair, sync OFF, drag panel B right.

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: OFF.
- Symbol sync: OFF, with all panels manually kept on the same pair/fileId.
- Pair configuration: all panels same pair/fileId.
- Replay state: backtest replay paused.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Console errors: TODO
- Smoothness 1-5: TODO

## S5 - 2×2 Independent Panel B, Replay Playing, Drag B Right

**Do this:** 2×2, panel B independent pair, replay playing, drag B right.

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: not constrained by the scenario matrix.
- Symbol sync: OFF, so panel B can remain independent.
- Pair configuration: panel B uses a different fileId; the other panels keep the original pair/fileId.
- Replay state: replay playing.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Console errors: TODO
- Smoothness 1-5: TODO

## S6 - 2×2 Same-Pair Sync ON, Topbar TF Switch

**Do this:** 2×2 same-pair sync ON: TF switch 1m→1h→1m from the topbar.

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: ON.
- Symbol sync: ON.
- Interval/timeframe sync: ON.
- Pair configuration: all panels same pair/fileId.
- Replay state: not constrained by the scenario matrix.

### S6-a — build b586 (viewport-first era, 1m→1d→1h→1m)

Captured build 20260627b586. PO did switches to 1d → 1h → 1m; table below = final (1m)
report. Per-step HOST fetches/fetchedBars: 1d = 87 / 170000, 1h = 90 / 176000,
1m = 91 / 178000.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | 91 | 178000 | 0 | 210 | 1152 | 0 | 199 |
| B | 0 | 0 | 89 | 216 | 638 | 0 | 0 |
| C | 0 | 0 | 89 | 218 | 614 | 0 | 0 |
| D | 0 | 0 | 89 | 218 | 686 | 0 | 0 |

- Switch duration feel: PO reports "loads candle by candle slow" on 1d.
- Console errors: `No candles drawn ... Skipped: 6` (minor); flagcdn CORS (external).
- Smoothness 1-5: (slow — this is the target of B-FIX-3)
- Single-chart TF-switch reference (same build, 1h): HOST fetches 4, fetchedBars 4000, resamples 20, renders 530, seams 0, lastFetchMs 204. → delta ≈ 22× fetches / 44× bars vs multichart.

### S6-b — build b604 DEFAULT-OFF ROLLBACK (1m→1h→1m) — CLEAN 3c "before"

Captured build 20260627b604. `window.__TALARIA_MC_ENABLE_VIEWPORT_FIRST` = `undefined`
(viewport-first confirmed OFF). PO switched host 1m → 1h → 1m; all four panels same pair
(fileId 25), all on 1m. Two snapshots (after reaching 1m, then after 1h):

**After host on 1m (mirror state):**

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | 4 | 8000 | 0 | 12 | 372 | 0 | 201 |
| B | 0 | 0 | 0 | 12 | 23 | 0 | 0 |
| C | 0 | 0 | 0 | 12 | 23 | 0 | 0 |
| D | 0 | 0 | 0 | 12 | 23 | 0 | 0 |

**After host switched to 1h (panels stay 1m):**

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | 4 | 8000 | 0 | 14 | 408 | 0 | 201 |
| B | 0 | 0 | 0 | 18 | 32 | 0 | 0 |
| C | 0 | 0 | 0 | 18 | 32 | 0 | 0 |
| D | 0 | 0 | 0 | 18 | 32 | 0 | 0 |

- **Rollback VERDICT: HELD.** Same-pair same-TF panels B/C/D = `fetches 0` (pure mirror),
  matching pre-viewport-first ownership. Durable (default-OFF build, not runtime flag).
- **D-015 `extendsFromParent=0` anomaly: SETTLED (not a bug).** It is proportional to how
  much 1m history the host loaded. Here host loaded only an 8000-bar viewport master
  (fast 1m→1h→1m, no deep pan / no 1d), so panels had nothing beyond the mirrored window
  to extend and just resample it (`resamples 12→18`). In S6-a the host loaded a 178k master
  (1d switch) so panels extended 89×. Both are correct copy-from-host behavior; the counter
  differs only because the host master size differs.
- Host TF switch cost (1m→1h): +2 resamples, +36 renders, 0 extra fetches. Fast.
- seams 0 everywhere; no self-fetch; no errors reported.

### S6-c — build b604 DEFAULT-OFF, MIXED-TF layout (host 1m, panels 4h) — cross-TF gap

Same build, but panels B/C/D carried a stale 4h TF from a saved layout (host on 1m). All
share fileId 25.

| panelId | fileId | tf | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|--------|-----|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | 25 | 1m | 15 | 24000 | 0 | 34 | 611 | 0 | 219 |
| B | 25 | 4h | 10 | 20000 | 1 | 70 | 136 | 0 | 198 |
| C | 25 | 4h | 10 | 20000 | 1 | 70 | 134 | 0 | 221 |
| D | 25 | 4h | 19 | 22000 | 118 | 197 | 197 | 0 | 206 |

- Same-symbol panels on a **different TF** than the host still SELF-FETCH (`fetches 10/10/19`)
  even sharing fileId 25. Root: the host's 1m viewport master (24k bars) does not span the
  4h panels' calendar viewport, so `_tryExtendReplayMasterFromParent` finds nothing to
  extend and the panel falls through to `_fetchCandlesCursor` (DIAG-B5 §Verdict).
- This is the only remaining same-pair ownership gap on the rollback build. It is the
  scope of B-FIX-3c / ESC-007.

## S7 - 2×2 Panel B Only TF Switch

**Do this:** 2×2: TF switch on panel B ONLY (interval sync OFF).

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: not constrained by the scenario matrix.
- Symbol sync: not constrained by the scenario matrix.
- Interval/timeframe sync: OFF.
- Pair configuration: not constrained by the scenario matrix.
- Replay state: not constrained by the scenario matrix.
- Regression check: does B revert TF?

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Does B revert TF?: TODO
- Console errors: TODO
- Smoothness 1-5: TODO

## S8 - 2×2 Sync ON, Replay Playing for 60s

**Do this:** 2×2 sync ON, replay PLAYING for 60s.

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: ON.
- Symbol sync: ON.
- Pair configuration: all panels same pair/fileId.
- Replay state: replay playing for 60 seconds.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Console errors: TODO
- Smoothness 1-5: TODO

## S9 - 2×2 Zoom Out Far on Tile A, Then Drag Right

**Do this:** 2×2, zoom out far on tile A, then drag right.

**Configuration:**

- Layout: 2×2.
- Date-Range/viewport sync: not constrained by the scenario matrix.
- Symbol sync: not constrained by the scenario matrix.
- Pair configuration: not constrained by the scenario matrix.
- Replay state: not constrained by the scenario matrix.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Console errors: TODO
- Smoothness 1-5: TODO

## S10 - Open 2×2 Layout from Single Chart

**Do this:** Open 2×2 layout from single chart (boot).

**Configuration:**

- Layout: start from single chart, then open 2×2.
- Date-Range/viewport sync: normal app setting for 2×2 boot; record actual setting during capture.
- Symbol sync: normal app setting for 2×2 boot; record actual setting during capture.
- Pair configuration: panels use the normal 2×2 boot pair assignment from the single chart.
- Replay state: not constrained by the scenario matrix.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| B | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| C | TODO | TODO | TODO | TODO | TODO | TODO | TODO |
| D | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Time until all 4 painted: TODO
- Console errors: TODO
- Smoothness 1-5: TODO

## S11 - Return to Single Chart, Drag Right

**Do this:** S2 then close layout back to single chart, drag right.

**Configuration:**

- Layout: start in 2×2 as S2, then close back to single chart before the final drag.
- Date-Range/viewport sync: ON during the S2 setup; N/A after returning to single chart.
- Symbol sync: ON during the S2 setup; N/A after returning to single chart.
- Pair configuration: all panels same pair/fileId during S2 setup; single active pair after returning to single chart.
- Replay state: backtest replay paused.
- Regression check: single chart must behave like S1.

| panelId | fetches | fetchedBars | extendsFromParent | resamples | renders | seams | lastFetchMs |
|---------|---------|-------------|-------------------|-----------|---------|-------|-------------|
| HOST | 10 | 8000 | 0 | 33 | 1541 | 0 | 232 |

- Single-chart comparison to S1: PASS — single-chart magnitude (10 fetches / 8000 bars) vs multichart S6 (90 fetches / 178000 bars). Returning to single sheds the 1m-master eager load.
- Console errors: none notable (flagcdn CORS external).
- Smoothness 1-5: (single-chart fast)
- Build 20260627b586, tf 4h, `reset → drag → report`.
