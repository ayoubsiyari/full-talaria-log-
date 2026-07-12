# T4 step 3 replay interaction report

## Scope

Prompt: `docs/tickets-overhaul/worker-prompts/T4-step3-replay-interaction.md`

Rows covered:

- `TAL-00752#21` — replay fill occurs on wrong candle vs entry candle.
- `TAL-00752#3` — TP/SL connector line flickers/disappears each replay candle.

Constraints honored:

- RED-first harness work was done in `chart v 1.4/chart/multichart-prod/harness`.
- Mechanism was diagnosed before applying an engine fix.
- No aggregate-model or SL/TP display/parse helpers from prior T4 steps were touched.
- No build ID bump was made; prompt says Manager coordinates the bump for this step.

## Harness additions

Added focused replay-topology scenarios:

- `H-S36` — pending replay fill must remain guarded on the placement candle and then anchor `openTime` / `entryMarkerTimeMs` to the next candle that touches the entry.
- `H-S37` — open-position TP visuals must be reused across replay redraws; redraw should reposition existing DOM, not remove/recreate it.

Updated `known-failing.json` `expectedTests` to include `H-S36` and `H-S37`.

## RED-first evidence

Command:

```powershell
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S36,H-S37
```

Initial result after adding probes:

- `H-S36` initially failed due to probe construction (`no cur/next idx=1200`). Diagnosis showed the probe was reading the visible chart slice at its end instead of the replay master. This was a harness-probe issue, not a replay-fill bug.
- After correcting the probe to read `replaySystem.fullRawData`, `H-S36` passed.
- `H-S37` failed stably:
  - `FINAL H-S37 FAIL-REAL-BUG`
  - failing detail: `sameNodeAfterRedraw=false (drawSLTPLines removes/recreates TP DOM)`

Corrected pre-fix diagnostic run:

```powershell
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S36,H-S37
```

Result:

- `FINAL H-S36 PASS`
- `FINAL H-S37 FAIL-REAL-BUG`

## Diagnosis

### `TAL-00752#21` / `H-S36`: no deterministic RED

Corrected replay-master probe shows:

- Guard candle does not fill the pending order.
- Next touch candle fills the pending order.
- Filled order stores both `openTime` and `entryMarkerTimeMs` on the touch candle.

Classification: **NO-REPRO in this harness pass**.

This row did not trace to mirror-frame application policy in the observed harness behavior, but it also did not produce a stable RED after the diagnostic probe was corrected. No fix was applied for this row.

### `TAL-00752#3` / `H-S37`: RC-5-owned order visual redraw

Mechanism:

- `drawSLTPLines(order, targetChart)` unconditionally called `removeSLTPLines(order.id)` before drawing.
- Replay/order refresh paths that re-enter `drawSLTPLines()` for an unchanged order therefore tear down and recreate TP DOM.
- The harness captures this as `sameNodeAfterRedraw=false`, matching the visible TP-line flicker class.

Classification: **RC-5-owned order-entry visual lifecycle**.

This did not trace to mirror-frame application policy, so it was fixed in this task.

## Fix

Added kill-switch:

- `window.__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX`

Implemented in both chart trees:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`

Behavior:

- Compute a stable SL/TP/BE visual signature for an order.
- Store that signature on the existing SL/TP/BE line records.
- When `drawSLTPLines()` is called again with the same structure on the same chart, reuse existing DOM and call `updateSLTPLines()` / `updateBELines()` instead of removing and redrawing.
- If SL/TP/BE structure changes, the existing redraw path still runs.

## GREEN evidence

Command:

```powershell
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S36,H-S37
```

Result:

- `FINAL H-S36 PASS`
- `FINAL H-S37 PASS`

## Kill-switch RED-again evidence

Command:

```powershell
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S37 --bugswitch=__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX
```

Result:

- `FINAL H-S37 FAIL-REAL-BUG`
- failing detail: `sameNodeAfterRedraw=false (drawSLTPLines removes/recreates TP DOM)`

## Additional verification

### Current-tree re-verification (2026-07-12)

Command:

```powershell
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S36,H-S37
```

Result:

- `FINAL H-S36 PASS`
- `FINAL H-S37 PASS`

Kill-switch proof, current tree:

```powershell
node "chart v 1.4/chart/multichart-prod/harness/run.mjs" --only=H-S37 --bugswitch=__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX
```

Result:

- `FINAL H-S37 FAIL-REAL-BUG`
- failing detail: `sameNodeAfterRedraw=false (drawSLTPLines removes/recreates TP DOM)`

Current disposition:

- `TAL-00752#21` / `H-S36`: PASS on the corrected replay-master diagnostic; no mirror-frame policy mechanism observed, and no additional fix applied.
- `TAL-00752#3` / `H-S37`: fixed as RC-5-owned TP visual lifecycle; kill-switch still restores RED.

Syntax:

```powershell
node --check "chart v 1.4/chart/modules/order-manager.js"
node --check "chart v 1.4/chart/multichart-prod/harness/scenarios.mjs"
```

Result: pass.

Lints:

- `ReadLints` on canonical/public `order-manager.js` and `scenarios.mjs`: no linter errors.

Byte identity:

- `order-manager.js` canonical/public SHA-256 match: `E7A5AEC4FCB67B2541A1C5F35C87422EA7B63B2D4E76E3FDE5C6A700BD8969A2`
- `scenarios.mjs` canonical/public SHA-256 match: `46D6127CCFB2C0EBE9FE303738D87B8C11244F9690C7CE5F9D453F2A90E634F1`
- `known-failing.json` canonical/public SHA-256 match: `A66C71365BE4F169D678EB914C4BF984E2AEF3F84BAB3BE2C329B62C94314CF9`

## Files changed

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `chart v 1.4/chart/multichart-prod/harness/scenarios.mjs`
- `homepage/public/chart/multichart-prod/harness/scenarios.mjs`
- `chart v 1.4/chart/multichart-prod/harness/known-failing.json`
- `homepage/public/chart/multichart-prod/harness/known-failing.json`
- `docs/tickets-overhaul/worker-reports/T4-step3-replay-interaction-report.md`

## Manager notes

- `TAL-00752#21` remains unmodified because corrected replay-topology diagnostics pass. If live retest still shows wrong-candle fills, the next pass should capture the exact replay mode, timeframe, pending order type, and whether the fill happened on host or mirrored panel.
- `TAL-00752#3` is fixed behind `window.__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX`.
- Build ID bump was intentionally not performed by this worker.
