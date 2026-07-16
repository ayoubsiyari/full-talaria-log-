# T3 — I13 hygiene: gate focus useEffect peer side-effect behind P5 master (Lane 2, small)

The Lane 2 diagnostic found a minor I13 gap (not the H-R03 cause, but real one-knob-revert debt flagged in ESC-019): `MultichartGrid.jsx:4055–4058` `useEffect([focusedPanelId])` calls `clearDrawingUiOnOtherPanels(focusedPanelId)` **without** the P5 master check — the peer-deselect inner call is gated, but the settings-close leg runs regardless of `__TALARIA_DISABLE_MC_REMIGRATION_PHASE5_PEER_ISOLATION`.

## Fix
Gate the `useEffect` focus side-effect (`~4055–4058`) behind `multichartPeerDeselectV1Enabled()` (P5 master) so switch-OFF reverts **all** focus-change peer-adjacent churn — clean one-knob revert (I13). Optionally the `multichart-manager.js:855–868` `clearDrawingUiOnOtherPanels` legacy-shell call-gate if trivial and disjoint from Lane 1's H-R03 fix.

## Constraints
- **Do NOT touch** `drawing-tools-manager.js` (Lane 1 owns the H-R03 fix there) or the H-R03 ctrl-select path. Different file region than Lane 1.
- Under P5 master (no new switch). Both trees I8. File-scoped commit.
- This is hygiene — must NOT change H-R03/H-R06/H-R07 behavior with switches ON. Re-confirm no parity-row regression after.

## Report
`docs/tickets-overhaul/worker-reports/T3-i13-hygiene-focus-gate-report.md` — lines gated, confirmation switch-ON behavior unchanged + switch-OFF now fully reverts focus peer churn, SHA256, commit hash.
