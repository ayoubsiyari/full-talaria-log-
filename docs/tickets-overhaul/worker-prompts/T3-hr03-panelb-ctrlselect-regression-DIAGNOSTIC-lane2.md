# T3 — H-R03 panel-B ctrl-select REGRESSION diagnostic (Lane 2, READ-ONLY first)

Combined build `20260716b6` regressed **H-R03 (panel-B ctrl multi-select)**: 10/10 FAIL isolated, host 10/10 PASS. Was 10/10 GREEN on `20260715b2` pre-H-R06. This blocks the unfreeze (ESC-019). **Diagnose read-only first; propose the fix + owning lane; do not implement until Manager confirms scope.**

## The key clue — switches don't revert it
Lane 4 proved **none** of these restore panel-B ctrl-select:
`--phase1-off`, `--phase5-off`, `--peer-deselect-off`, `--panel-keyboard-off` (all 10/10 FAIL). Evidence: `combined-b6-hr03-*.txt`.

→ The regression rides an **ungated path** (likely **I13 gap**): code that shipped in the H-R06/H-R07 bundle (`f46e6d9d` MultichartGrid P4+P5 hunks + `52894a8d` manager) that runs **regardless of switch state**.

## Symptom precision
H-R03 actuation: panel B, select drawing #1, then **ctrl+click drawing #2** → expect BOTH selected (`first=true second=true`). Observed: `second=false` (10/10) — the second ctrl+click's selection is being **wiped** on panel B.

## Diagnostic tasks (read-only)
1. Trace panel-B ctrl+click multi-select path end-to-end. Identify what clears the first selection (or fails to add the second) when ctrl is held.
2. **Prime suspect:** P5 peer-deselect debounce (`schedulePeerDeselectPanel` / `cancelScheduledPeerDeselect` / `deselectDrawingsOnNonFocusedPanels`) — does a scheduled/immediate `deselectDrawings` fire on the SAME panel or clobber the additive ctrl-select? Does the `__v9DrawingSelectionGuardUntil` guard cover the ctrl-select case?
3. **Confirm the I13 gap:** when `--phase5-off` / `--peer-deselect-off` are set, does the debounce/scheduling code still execute (timer scheduled, cancel logic runs)? If the switch only gates part of the path, name exactly which lines run unconditionally.
4. Rule in/out **P4** (`PANEL_KEYBOARD_V1`) and the manager (`52894a8d`) as contributors.
5. Confirm whether the regression is React-side (`MultichartGrid.jsx`) or manager-side, and **name the owning lane** for the fix (Lane 2 if P5/peer, Lane 1 if P4/keyboard).

## Deliverable
`docs/tickets-overhaul/worker-reports/T3-hr03-regression-diagnostic-report.md` — end-to-end ctrl-select trace, exact ungated lines (I13 gap), root cause, proposed fix (must make switch-OFF a full revert), owning lane, and a proposed RED that reproduces H-R03 panel-B deterministically. Read-only — no product edits yet.

## Guardrails
Read-only diagnostic. No product/harness/registry edits. Both `MultichartGrid.jsx` and `multichart-manager.js` are in scope to READ.
