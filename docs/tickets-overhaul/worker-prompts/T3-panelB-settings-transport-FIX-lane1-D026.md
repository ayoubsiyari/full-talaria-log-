# Lane 1 — IMPLEMENT (D-026): panel-B settings-open transport fix (gated)

## Authorization
ESC-023 → **D-026 APPROVED** the 3-hunk scoped fix from the pinpoint report (`T3-panelB-settings-transport-pinpoint-report.md` §5), with a **binding hunk classification** — do not silently re-weight.

## Root (causal, from pinpoint)
Panel-B Style panel mounts, then is torn down: duplicate dbl-click → two open cycles (~80ms) each zero+re-arm `__v9DrawingSettingsOpenGuardUntil` → late `multichart-drawing-selected` coincides with iframe background `deselectAll({fromCanvasBackground:true})` → iframe posts `multichart-drawing-deselected` → `MultichartGrid.jsx:6501-6505` dispatches `multichart-dismiss-drawing-settings` **without checking the guard** → `onDismissMcSettings` (`TalariaV8bLive.jsx:19888`) sees guard=null → tears down the fresh panel. **The guard isn't expiring — it's cleared mid-open and then ignored on the deselect path. Ordering defect.**

## Switch (I3)
`window.__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1` — default unset = fix ON. Switch present = full revert to current (frozen/flash-close) behavior.

## Hunks — BINDING classification (D-026)
- **Hunk B — CAUSAL CURE (load-bearing, must not be dropped):** honor `__v9DrawingSettingsOpenGuardUntil` AND `editingDrawingRef` on BOTH dismiss paths:
  - `MultichartGrid.jsx:6501-6505` (`multichart-drawing-deselected` handler) — do not dispatch `multichart-dismiss-drawing-settings` while the guard is active / an open is in flight.
  - `TalariaV8bLive.jsx:19888` (`onDismissMcSettings`) — skip flash-close while `editingDrawingRef.current` + `__v9DrawingSettingsOpenSource` indicate an in-flight panel-B open.
- **Hunk C — dedupe (legitimate):** coalesce duplicate `openDrawingSettingsForPanel` for same `source`+`drawingId` within ~120ms (skip the second `v9DismissAllDrawingSettingsImmediate` preamble). **Report note required:** this is the 2nd duplicate-actuation instance on this surface after H-R03 ctrl-select double-fire.
- **Hunk A — DEFENSE-IN-DEPTH ONLY (fix must NOT depend on it):** don't zero the guard in `v9DismissAllDrawingSettingsImmediate` while a panel-B open is in flight; optional ~200ms extension. **Prove the fix passes WITHOUT relying on A** (see proof leg 4).

## Proof bar (D-026 full — honest, I15, real `hasStyleSection`)
Isolated, `REACT_PARITY_ISOLATE_SESSION=1`, on the rebuilt dist:
1. **ON:** H-R04 panel-B **10/10** AND H-R05 panel-B **10/10** (real parent Style modal).
2. **OFF** (`--chrome-... ` n/a; use `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1=true`): honest **RED** (non-vacuous).
3. **STRESS LEG (D-026 mandatory):** H-R04+H-R05 **10/10 with `focusReactPanelSoft` amplifier still in place** — this proves Hunk B cured the ordering, not that Hunk A widened the window.
4. **A-independence:** with Hunk A neutralized (guard extension = 0 / not applied) but B+C ON → still 10/10. If it drops without A, STOP — B is not carrying it; report rather than lean on A.

## Discipline riders (D-026)
- **I13 switch-OFF diff** on BOTH `TalariaV8bLive.jsx` and `MultichartGrid.jsx` (they are re-migration shared surfaces): with the switch OFF, behavior is byte-for-byte the prior path.
- **Own-PR hunk-staging:** this fix is its own file-scoped commit (one phase per PR); do not mix with other phases. I8 mirror both trees. Rebuild `dist-v9`, bump build id.

## Non-blocking registry follow-up (report, NOT in scope)
Investigate why the iframe fires `deselectAll({fromCanvasBackground:true})` during a dbl-click **on a drawing** (`drawing-tools-manager.js:10229-10230`). If the second click is misread as background, that is a latent hit-test defect → log as a **registry candidate in the duplicate-actuation family** (with H-R03). Do NOT fix it here.

## Deliverable
`docs/tickets-overhaul/worker-reports/T3-panelB-settings-transport-FIX-report.md`:
- The hunks A/B/C (both trees) with the binding classification honored; switch name; build id bump.
- Full proof: legs 1–4 above with evidence file names.
- I13 switch-OFF diff confirmation on both files.
- Hunk C dedupe note (2nd duplicate-actuation instance).
- The `deselectAll(fromCanvasBackground)` registry-candidate finding.
- Commit hash (own PR, file-scoped). Then hand to Lane 4 for 3× clean gate:react + manager gate → bless.
