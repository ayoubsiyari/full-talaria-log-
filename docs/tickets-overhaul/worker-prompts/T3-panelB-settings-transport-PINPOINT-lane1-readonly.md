# Lane 1 — READ-ONLY pinpoint: exactly what dismisses the panel-B settings modal (pre-fix, ESC-023 pending)

## Why
Reconcile verdict = (B) real transport race: panel-B dbl-click actuates, dom-ready is honest (`panelId:B, domReady:true`), but the parent settings modal ends `{open:false, hasStyleSection:false}` intermittently. ESC-023 is filed for a gated fix. This task **does not implement** — it pinpoints the exact dismiss so the authorized fix lands precise and minimal.

## Constraints
- **READ-ONLY. No product edits, no harness edits, no dist rebuild.** Trace + instrument via logging only if needed (do not commit instrumentation).
- Freeze-safe. Deploy frozen.

## Pin these
1. On a RED run, does `MultichartGrid.openDrawingSettingsForPanel('B', …)` (~5281) actually get **invoked**? If not, why (guard rejected, wrong panelId, race before parent listener attached)?
2. If invoked, does it **mount Style content** and then get **torn down**? Identify the exact dismiss caller — candidates:
   - `clearDrawingUiOnOtherPanels` / peer-clear on `multichart-drawing-selected`
   - a focus side-effect (`focusReactPanelSoft`-style) firing after open
   - the `__v9DrawingSettingsOpenGuardUntil` window expiring / not covering the open
3. Timing: measure the gap between dbl-click actuation, `openDrawingSettingsForPanel` invocation, and the dismiss. Is the guard window too short, or armed too late?
4. Confirm the GREEN-run ordering vs RED-run ordering (what's different in the event sequence when it works).

## Deliverable
`docs/tickets-overhaul/worker-reports/T3-panelB-settings-transport-pinpoint-report.md`:
- The exact dismiss call site (file:line) and the event-order diff GREEN vs RED.
- Whether the correct fix is (a) extend/re-arm `__v9DrawingSettingsOpenGuardUntil` to cover the open, (b) suppress the peer-clear/focus dismiss while an open is in flight, or (c) both.
- A minimal proposed hunk (preview only, NOT applied) scoped to `openDrawingSettingsForPanel` / `requestMultichartParentDrawingSettings` / the guard window, behind `__TALARIA_DISABLE_MULTICHART_PANELB_SETTINGS_TRANSPORT_V1`.
- STOP — implementation waits on the ESC-023 ruling.
