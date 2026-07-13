# WORKER PROMPT — T0 step 6 (Lane 4): make the React MultichartGrid mountable under `dev:live`

> Hand to the Lane 1... no — Lane 4 (harness/tooling). This closes the remaining half of the fast-test gap: T0 step 5 got the single chart booting under `dev:live`, but the **React multichart grid does not mount** there, so React-multichart fixes (step 10 etc.) still can't be verified locally.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T0 step 6**, Lane 4.

## PROBLEM (evidence from T1 step 10 report)
Under `USE_LOCAL_CHART=1 npm run dev:live`:
```
window.chart: true
window.__multichartGrid: false
window.panelManager: false
iframes: 0
layout-selector-btn: display none, 0x0
dynamic import /src/MultichartGrid.jsx: failed
```
The `dev:live` route serves the single-chart document but never mounts the React `MultichartGrid` shell or exposes a panel/layout control. So a worker cannot open a real multichart panel locally to verify settings/selection/marquee behavior — the exact surface where our regressions live.

## TASK
Make `dev:live` able to render a **real multichart layout with panels** locally, so a dev can: pick a 2-panel (or 2x2) layout, place a drawing in a panel, and exercise select / settings-open / Esc / Ctrl+drag against the actual React `MultichartGrid`.
1. Diagnose why the React multichart shell / layout control isn't available on the `dev:live` route (entry wiring in `live/`, layout-selector visibility, panel iframe `chart-embed` source resolution against the local backend, the failed dynamic import of `MultichartGrid.jsx`).
2. Fix the **dev-only** wiring so the grid mounts and panel iframes load from the local chart tree/backend. Prefer reusing existing layout/panel code paths; do not fork multichart logic.
3. Confirm with a probe: `window.__multichartGrid` truthy (or panels present), ≥1 panel iframe loaded, layout control usable, and a drawing can be placed + its settings opened in a panel.

## MUST NOT
- No production build/behavior changes (`base`, `outDir`, rollup untouched). Dev-server/entry wiring only.
- No engine logic changes, no multichart ownership/lifecycle logic changes.
- No build id bump. Do not disturb the gate.

## DELIVER (report `.md`: `worker-reports/T0-step6-devlive-mount-multichart-grid-report.md`)
1. Root cause of the non-mounting grid (file:line).
2. The dev-only fix diff.
3. Probe evidence: grid mounted, panel iframe loaded, drawing placed + settings opened in a panel (screenshot/log).
4. Updated fast-test recipe for **multichart** local testing (commands + how to open a panel + how to flip `__TALARIA_*` flags).
5. Confirm no production/engine files changed; gate unaffected.
