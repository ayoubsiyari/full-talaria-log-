# Lane 4 — wire the V9 chrome DOM-ready wait primitive into H-R05/H-R01, then bless 20260716b10

## Context
Worker 1 landed the D-024 chrome DOM-ready fix (product commit `2537d3d0b`, dist b10). Report: `T3-panelB-chrome-dom-ready-FIX-report.md`.
- Product now emits a durable ready-signal AFTER `#tl-sett` DOM commit.
- Kill-switch: `window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4` (unset = fix ON).
- **H-R04: 10/10 ON, 1/10 OFF** — accepted (non-vacuous discriminator).
- **H-R05: 9/10 ON, 5/10 OFF** — product fix is in, but the H-R05 harness row does NOT wait on the ready-signal, so it races the DOM commit. Worker 1 stopped per D-024 (no masking sleeps).

D-024 made the ready-signal a **legitimate harness wait primitive**. Your job: consume it honestly, then bless.

## Ready-signal surface (from Worker 1)
- `window.__talariaV9QuickBarDomReady = { drawingId, panelId, domReady:true, settledAt }`
- Event `talaria:v9-quickbar-dom-ready` (same detail)
- DOM `#tl-sett[data-v9-chrome-dom-ready="1"]`

## Tasks
1. **Add wait primitive** `waitForParentV9ChromeDomReady(panelId)` to the harness lib: resolve when the event fires OR the DOM flag is set OR `__talariaV9QuickBarDomReady` already present (whichever first), with a real timeout that FAILS (not passes) on timeout. This is a wait-on-real-product-signal, NOT a sleep and NOT retry-until-green.
2. **Wire it into H-R05** (Esc-close) and **H-R01** (select→chrome) at the point after the panel-B settings/gear actuation and before asserting Esc/close behavior. Do not add it anywhere it would mask a genuine failure — it only gates on the product's own readiness signal.
3. **Add `--chrome-dom-ready-off` A/B hook** that sets `window.__TALARIA_DISABLE_MULTICHART_CHROME_DOM_READY_V4 = true` so the discriminator is runnable from the gate (mirrors how other switch-off runs work).
4. **Re-run isolation** (`REACT_PARITY_ISOLATE_SESSION=1`, fresh browser per scenario) for H-R01/H-R04/H-R05:
   - Fix ON: each must be **10/10 PASS**.
   - `--chrome-dom-ready-off`: H-R04 and H-R05 must **FAIL** (non-vacuous discriminator, as H-R04 already does 1/10).
5. If and only if all three are 10/10 ON with a genuine RED on switch-off:
   - Run **3 consecutive clean `gate:react`** runs (no rotating failures across the 3).
   - Run the manager gate (`npm run gate`) — confirm 0 regressions vs the b10 baseline (H-S27/H-S83 remain tracked flakes, not new).
   - **Bless `20260716b10`** for PO parity-checklist: stamp the build, update `T3-COMBINED-BUILD-MANIFEST.md` bless section, record the 3-clean evidence file names.

## Honesty guardrails (I15)
- The wait primitive gates on the **product's real ready-signal only**. If you find yourself adding a fixed `sleep`, retry-until-pass, or lowering an assertion to reach 10/10 — STOP and report instead; that means the product still races and it's a fresh escalation, not a bless.
- Every GREEN names actuation + what it measured. Keep the switch-OFF RED as the discriminator of record for H-R04/H-R05.

## Deliverable report
`docs/tickets-overhaul/worker-reports/T0-lane4-chrome-dom-ready-wait-plus-bless-report.md`:
- Wait-primitive implementation (file:line), the `--chrome-dom-ready-off` hook.
- Isolation results: H-R01/04/05 10/10 ON, discriminator FAIL OFF (with counts).
- 3-consecutive-clean gate:react evidence (file names) + manager gate 0-regression line.
- Bless stamp for 20260716b10 (or, if not reached, an honest STOP with the residual and a proposed escalation).
