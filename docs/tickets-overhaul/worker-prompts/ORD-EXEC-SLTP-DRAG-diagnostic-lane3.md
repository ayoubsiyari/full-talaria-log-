# Lane 3 — DIAGNOSTIC (read-only, freeze-safe): executed/open-position SL/TP cannot be dragged (b11)

## Defect (PO live, b11)
Multi-entry preview is fixed (TDZ resolved). But **after an order is EXECUTED** (open position), the SL and TP lines **cannot be dragged or edited**. Console is otherwise clean (no TDZ). Pending-order SL/TP behavior must be checked too (state separately).

## Constraints
- **READ-ONLY. No code edits.** Freeze-safe. Honest actuation (I15) — reproduce the real place→fill→drag path.
- Do NOT edit harness lib (Lane 4) or chart.js/replay engine.

## Prime suspect (confirm/refute via A/B)
Order-interaction guard V2 (`_orderInteractionGuardV2Enabled`, order-manager.js:94-119; A6-1 SL/TP apply-on-release). Draggability is gated at ~19022 (`pointer-events: isDraggable ? 'stroke' : 'none'`) and ~19028 (`needsPointerEvents ? 'all' : 'none'`); drag attach at ~19205.

**A/B bisect (do this first):**
- With `window.__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2 = true` (guard OFF) + reload → can you drag an executed-position TP/SL?
- With guard ON (default) → frozen?
- If OFF restores drag → guard V2 is the regression; pinpoint which sub-flag (`applyOnRelease` / the specific A6 leg) and why it sets `isDraggable=false` (or fails to attach the drag) for executed positions specifically.

## Questions
1. For an OPEN position's SL/TP line, what is `isDraggable` / `needsPointerEvents` evaluated to, and where is it computed? Why false for executed vs. pending/preview?
2. Is the `d3.drag()` handler (~19205, ~20202, ~20281) attached for executed-position SL/TP lines, or skipped?
3. Does the apply-on-release guard swallow the pointerdown/hit-line for executed positions (vs. pending)? Trace the hit-line (`pointer-events:'stroke'`) vs the guard's pointer handling.
4. Is this pending-only OK / executed-only broken, or both? Give the matrix (pending vs executed × SL vs TP × drag vs field-edit).
5. Regression origin: which commit in the A6 / order-interaction-guard series (b50d45d4 apply-on-release, 2f70df64 A6-3, 5889a1f0 #5) introduced it? Bisect if needed.

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-EXEC-SLTP-DRAG-diagnostic-report.md`:
- A/B result (guard ON vs OFF) — is guard V2 the root?
- Exact site where executed-position SL/TP loses draggability (file:line): isDraggable computation, pointer-events, or drag-attach skip.
- pending vs executed matrix.
- Regression commit if identified.
- Ranked freeze-safe fix menu (kill-switch, cost, freeze-risk) — e.g. ensure executed-position SL/TP stays draggable while apply-on-release still governs the commit.
- Proposed RED id (e.g. `RC5-EXEC-SLTP-DRAG-1`: place→fill→drag TP → asserts line moves + commit on release).

Do the A/B bisect first. STOP after report.
