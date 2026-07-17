# Lane 2 — DIAGNOSTIC: 1m replay intermittently jumps forward 10+ days

## Symptom (PO live, blessed 20260717b16)
Leaving the chart running on **1m replay**, the replay time **occasionally jumps forward 10 days or more** in one step. Intermittent; PO cannot pin the trigger (not sure if it's tab-defocus, continuous play, or a TF/click just before).

## Hypotheses to confirm/reject (rank with evidence)
1. **Background-tab / idle timer catch-up (lead):** the replay advance uses a wall-clock delta (`performance.now()` / `Date.now()` diff, or `requestAnimationFrame` elapsed). When the tab is backgrounded or the machine sleeps, timers throttle/pause; on resume the accumulated delta is applied in one frame → a huge forward jump. Check the replay tick: is the per-frame advance **clamped to a max step**? Look for `document.visibilitychange` / `hidden` handling around the replay loop. Trace the advance math in `replay-system.js` + the multichart mirror/cadence path.
2. **Interval-basis bug (TAL-01612 "date jumps weeks" — STAGED, supposedly fixed on b16):** the step uses a coarse interval basis instead of 1m. If this still repros on b16, it is a **staged-fix FAIL/incomplete** — flag loudly.
3. **H-S25 bar-boundary follow-leap:** the residual bar-boundary leap noted for H-S25 — does it manifest as a multi-day skip on 1m?
4. **Finest-TF cadence overshoot:** the unified finest-TF clock computing a wrong bucket count on 1m.

## Instrumentation (allowed, diagnostic-only, gated — no product behavior change)
Add a debug logger behind `window.__TALARIA_DEBUG_REPLAY_STEP_TRACE` (default OFF) that logs any replay advance whose step exceeds N× the expected 1m interval, with: step size, wall-delta, `document.hidden` state at the time, TF, interval-basis, and the code path. This is a log-only probe, default-off, both I8 trees — NOT a fix. If you prefer fully read-only, instead give the exact repro recipe (e.g. background the tab 5 min → refocus) so PO can reproduce deterministically.

## Deliverable
`docs/tickets-overhaul/worker-reports/REPLAY-10DAY-JUMP-diagnostic-report.md`: ranked verdict with file:line, whether it's a b16 staged-fix regression (TAL-01612) vs a known-open vs new clock-catch-up defect, a deterministic repro recipe, and a proposed switch-gated fix scope (e.g. clamp per-frame replay advance to a max step + `visibilitychange` pause). No product fix in this step (instrument only, if used).
