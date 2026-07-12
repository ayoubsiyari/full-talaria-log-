# WORKER PROMPT — T1 step 5 (Lane 1): fix multichart panel select + settings teardown

> Hand to the Lane 1 (lifecycle) worker. **Live regression from T1 step 4** — single chart is fine, but multichart panels can't select/open-settings normally, and Esc doesn't close settings. Fix + add the missing RED coverage that let this through.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 5 (regression fix)**, Lane 1.

## SYMPTOMS (PO live, build `20260712b6`)
- **Single chart:** selection + settings work correctly (do not regress this).
- **Multichart panel (iframe tile):**
  - **A —** clicking a tool does **not** select it and does **not** open its settings menu. Only **double-click** opens settings.
  - **B —** pressing **Esc** deselects the tool but **leaves the settings menu / settings bar open** (should close).

## READ FIRST (binding)
- `docs/tickets-overhaul/worker-reports/T1-step4-lifecycle-migration-report.md` — your step-4 changes (esp. `multichart-manager.js` `clearDrawingUiOnOtherPanels`/`deselectDrawingsOnNonFocusedPanels`, and `toolSelected`/`toolDeselected` subscribers)
- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — D-001/D-003
- `docs/tickets-overhaul/INVARIANTS.md` — binding; **I5** (state matrix), **I7**, **I9**

## LIKELY MECHANISM (confirm, then fix)
- **A:** the step-4 `toolSelected` cross-panel cleanup (`clearDrawingUiOnOtherPanels`) is likely clearing the **just-selected panel's own** UI (it should clear *other* panels only, not the focused one), so the selection/settings never stick on single click. Verify the "other panels" predicate excludes the focused/selecting panel.
- **B:** the `toolDeselected` path (Esc) in panel/iframe context doesn't drive `settingsPanel.hide()` / settings-bar teardown. The deselect subscriber must close the settings surface the same way `toolDeleted` does.

## TASK — gated fix
Fix both A and B so that, in a multichart panel:
- single-click selects the tool and opens/enables its settings (parity with single chart), and
- Esc (toolDeselected) closes the settings menu/bar AND deselects.

- Reuse the existing `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` gate (this is within the step-4 lifecycle scope). If a slice needs its own switch, name it.
- Do NOT change single-chart behavior (prove it unchanged in the matrix).

## MANDATORY RED COVERAGE (the gap that let this through)
Add harness scenario(s) that exercise the **intra-panel** flow (coordinate new IDs with the Manager/Lane 4 per the scenario-ID rule):
1. In a multichart panel: **single-click** a drawing → assert it becomes selected AND its settings surface is openable/enabled.
2. Open settings → press **Esc** → assert the drawing is deselected **and** the settings menu/bar is closed.
These must be **RED before** your fix and **GREEN after**. Existing H-S32–H-S37 + H-S43 must stay green (I9).

## BINDING CONSTRAINTS
- **RC-1 only.** No RC-2/RC-3 work. **I11:** no mirror-frame guard work. **L2:** production trees only.
- **I8:** both engine trees byte-identical (SHA256 both). Coordinate with the Manager if you touch `drawing-tools-manager.js` (Lane 2's Row-2 fix also lives there — do not clobber `_suppressNextIframeCtrlSelectToggle`/`isMultichartIframeEmbed`).
- **Build id:** do NOT bump — report the diff, Manager coordinates.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T1-step5-multichart-select-settings-fix-report.md`)
1. Confirmed mechanism for A and B (file:line).
2. Diff summary; kill-switch used.
3. New RED scenarios + RED→GREEN evidence; full gate output (no regressions; H-S32–37/H-S43 still green).
4. State matrix (I5): single chart (unchanged) vs multichart panel (fixed), select/settings/Esc-close.
5. SHA256 both trees; `node --check` clean; build-id diff left for Manager.

## STOP CONDITIONS
If fixing the panel select requires reworking the cross-panel cleanup in a way that risks H-S34/H-S35, report before proceeding. If the mechanism is actually in the React `MultichartGrid` (production) vs the harness `multichart-manager.js` and they diverge, report which surface owns it.
