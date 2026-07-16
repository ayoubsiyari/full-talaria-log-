# T3 Phase 4 (Lane 1) — H-R06 Delete-in-panel IMPLEMENT (D-021 reduced scope)

D-021 reduced Phase 4 to **the Delete leg only** — H-R05/H-R09-Esc flipped genuinely green (measurement-artifact) and become verify-only rows. Implement **H-R06 (Delete does not remove drawing from store)** per your Phase-4 PREP (`T3-remig-phase4-lane1-PREP-report.md`).

## STEP 0 (mandatory) — commit Phase 1 first, then region map
1. If the **Phase-1 commit** is not yet landed, fire it first (your banked manifest — 7 file-scoped paths + build `20260716b1`). Report the hash.
2. Region-map the Delete touch zones and confirm disjoint from: T8-owned `panel-cmd-bridge.js` regions (per PREP §6), D-017 snap-back, cadence (`d6d9822f`), and **Lane 2's H-R07 peer-isolation** `MultichartGrid.jsx` hunks (one-phase-per-PR on `MultichartGrid.jsx` binds — if your Delete forwarder edit at `MultichartGrid.jsx:5901–5920` overlaps Lane 2's selection-routing hunks, STOP and report for sequencing).

## Scope — Delete only
Per PREP §5 Delete paths + §6 touch window:
- `panel-cmd-bridge.js` — `onDeleteDrawingKey` (~4049–4079) + `deleteSelectedDrawings` cmd case (~2638–2657), gated on **new** `multichartPanelKeyboardV1EnabledInEmbed()`.
- `MultichartGrid.jsx` — parent Delete forwarder (~5901–5920) + `deleteSelectedDrawings` runCommand (~4321–4341) on the new switch.
- `drawing-tools-manager.js` — iframe Delete/Backspace `handleKeyDown` (~5605–5624) migrated to the keyboard-V1 predicate.
- `keyboard-shortcuts.js` — `deleteSelected` multichart branch (host A).
- **Do NOT touch the Esc paths** in this PR (Esc is now verify-only). Do NOT extend the quickbar-settings switch (D-018 #2).

## Switch (D-018 #2)
`window.__TALARIA_DISABLE_MULTICHART_PANEL_KEYBOARD_V1` (new master, unset = ON). OFF → panel-B Delete reverts to broken store posture.

## LANDMINE (integration contract) — multi-delete reads dm.selectedDrawings
The lifecycle store collapses to single-select; multi-select lives **only** in `dm.selectedDrawings`. The Delete set MUST read `dm.selectedDrawings` (not the lifecycle-store snapshot) or multi-delete silently drops to one shape.

## Proof (I15, D-011) — on the FROZEN hit-coord harness
- Real select (`singleClickDrawing`) → `page.keyboard.press('Delete')` (`deleteSelectedViaKeyboard`) — host A + panel B.
- End-state (not proxy): `drawingExists=false`, render-count delta, `assertNoGhostAfterDelete`, `readReactParityState.selectedIds` empty.
- `node react-run.mjs --only=H-R06 --runs=10` → **10/10 PASS**; `REACT_PARITY_PANEL_KEYBOARD_OFF=1 ... --runs=10` → **10/10 FAIL-REAL-BUG** (switch-OFF A/B).
- `npm run gate:react` clean. Coordinate the `--panel-keyboard-off` hook with Lane 4 (they own `react-parity-lib.mjs`).

## Guardrails
- Both trees I8, SHA256 in report. File-scoped commit (never `git add -A`).
- No `replay-system.js`, no T8 cadence regions, no order-entry, no `known-failing.json` (Lane 4 registers).
- Build bump to combined-build id when landing (coordinate with Manager — this rides the combined build).

## Report — WORKER-REPORT-STANDARD.md
`docs/tickets-overhaul/worker-reports/T3-remig-phase4-HR06-delete-IMPL-report.md` — Phase-1 commit hash, Delete RED→GREEN 10/10 + switch-OFF A/B, region-map disjoint confirmation, dm.selectedDrawings multi-delete handling, commit hash + SHA256, NEEDS-LIVE PO steps (PREP §10 steps 4–5).
