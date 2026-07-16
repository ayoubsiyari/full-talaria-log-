# T4 — Order-interaction landing EXECUTE (Lane 3) — D-020 authorized

ESC-017 is ruled **D-020** — all three requests approved. Execute the order-interaction landing plan you drafted (`T4-order-interaction-landing-sequence-report.md`), with D-020's specifics baked in. **Do RC-6 M3 first if not yet committed; then start here.**

## Scope THIS series (freeze-safe — `order-manager.js` + new guard module + aggregates ONLY)
Phases 0→2 now; #5 (Phase 3) and A6-3 order-half (Phase 4) follow in the same series. **NOT in scope:** A6-4 host-canonical (post-re-migration), A6-2 F5 persist (separate task), `replay-system.js`, multichart-parent, chart.js (except the optional #5 viewport hook — flag, do not force).

## Phase 0 — guard module
Land `order-interaction-guard.mjs` (both trees, I8) with the `OrderProvisionalEdit` model + API from your report. Master switch `__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2` (default ON). Property test the pure guard. Commit file-scoped.

## Phase 1 — A6-1 apply-on-release (TAL-01602)
Switch `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` (default ON).
- **Invariant:** pointer-down on SL/TP line → provisional. Line renders at cursor; **store value unchanged**; no fill/close/hit-test evaluates against the provisional value. **Commit once, on release.**
- **Replay during drag:** hit-tests against the **LAST COMMITTED** value, not the provisional (D-020 §1).
- **Edge cell (a) — committed-value crossing (MUST implement, default semantics):** if price crosses the *last committed* SL/TP while dragging, the close/fill **DOES fire**. The invariant protects the held provisional line; it does **not** suspend risk on the committed order.
- **Edge cell (b) — drag cancel:** Esc, pointer leaves window, or replay stops mid-drag → provisional discards, line returns to committed value, **no partial commit**.
- Covers preview drag + open-line drag (same provisional model). Extend `updatePositions` suppress to SL + all TP paths while a provisional open drag is active.

## Phase 2 — #4 replay × drag limit (TAL-00752#4)
Switch `__TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX` (default ON). `_syncPreviewToReplayPrice` returns early while any provisional preview edit / `isDraggingPreviewLine`; defer `_autoDetectOrderTypeFromEntry` until release. Uses the same provisional API (`shouldDeferReplayPreviewSync`).

## Discipline
- **One phase per commit**, file-scoped (`git add` explicit paths, never `-A`), both trees I8, SHA256 in report.
- RED-first per phase → GREEN → switch-OFF RED-again. I15: real actuation + order end-state (store price / close-fired), not call-counts.
- RED ids reconcile with A6 contract: RC5-OI-1 (A6-1), RC5-OI-2 (#4). No duplicate harness ids. Lane 4 registers after RED.
- Do NOT touch `replay-system.js`, multichart-parent, `known-failing.json`.

## Report — WORKER-REPORT-STANDARD.md
Per-phase RED→GREEN proof (incl. both edge cells a/b for A6-1), switches, SHA256, commit hashes. State NEEDS-LIVE items for the combined build (PO: drag SL across price during play — held = no close; release = commits).
