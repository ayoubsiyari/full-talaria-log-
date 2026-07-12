# Director Decisions — Tickets Overhaul (Plan 2)

---

## D-001 — ESC-001: T1 ToolLifecycleStore design approved; phased implementation authorized

**Date:** 2026-07-12  
**Escalation:** ESC-001  
**Track:** T1 step 2→3 (Lane 1)  
**RC:** RC-1

### Rulings

**1. Design approved.** The proposed `ToolLifecycleStore` shape, event set, and migration order are approved as the T1 implementation contract. No amendments to the store/events model; the diagnostic ownership table is the authoritative baseline.

**2. Implementation authorized** behind `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` (default ON = fix active). Acceptance contract: H-S32 and H-S33 must go GREEN; kill-switch A/B must turn them RED again. Both engine trees byte-identical; build id bumped.

**3. Phased scope — Manager recommendation accepted.** T1 step 3 implements **migration steps 1–3 only** in the first build:

| Step | Scope | Symptom families targeted |
|---|---|---|
| 1 | Quick menu / floating toolbar + V9 parent sync | stale-quick-menu (24), selection-desync (partial) |
| 2 | Price/time axis labels + on-canvas label groups | price/time labels (41), ghost-after-delete (partial) |
| 3 | Settings dialog + context menu | ghost-after-delete (19), selection-desync (partial) |

Steps 4–7 (object tree, manager flags → store, legacy `Chart.selectedDrawing` retirement, per-tool class migration) are a **follow-on gated task (T1 step 4)** — not in the first build. Do not touch all 30+ tool classes in one diff.

**4. Binding constraints for step 3:**

- **First-click fix mechanism:** `finalizeDrawing` / `addDrawing` paths that create a drawing must emit `toolSelected` through the store (equivalent to full `selectDrawing` subscriber chain) on the same interaction that completes placement. Do not patch individual tool classes to call `selectDrawing` — route through the store.
- **Ghost-after-delete fix mechanism:** `toolDeleted` event must drive `settingsPanel.hide()`, toolbar hide, V9 desync, and context-menu teardown. `deleteDrawing` emits; subscribers react. No per-delete-path cleanup patches.
- **RC-2 stays out of T1 step 3.** The `scheduleRender()` gap noted in the diagnostic is T2 work. If step 3 discovers a render invalidation that blocks H-S32 GREEN, log it to the registry and fix only what the harness requires — do not open a T2 sweep early.
- **RC-3 stays out of T1.** Anchored VWAP bar-index mutation (`drawing-tools-advanced-volume.js:525-531`) is T5. Do not fix during step 3 even if visible in manual testing.
- **I11 holds.** No mirror-frame guard work. T1 is drawing-tools lifecycle only.

**5. State matrix required** in the worker report for step 3: at minimum — single chart / multichart panel × placement-complete / select-existing / delete-via-settings / delete-via-keyboard × settings-open / settings-closed.

### Lane 1 authorization

**Proceed to T1 step 3 immediately.** Lane 1 is unblocked.

First build exit criteria (step 3 only): H-S32 GREEN, H-S33 GREEN, kill-switch RED on both, state matrix delivered, no steps 4–7 landed. Manager verifies independently before requesting T1 step 4 authorization.

---

## D-002 — ESC-002: T3 interaction-parity contract ratified; open questions resolved by RED-isolation

**Date:** 2026-07-12  
**Escalation:** ESC-002  
**Track:** T3 step 1→2 (Lane 2)  
**RC:** RC-4

### Rulings

**1. Canonical ownership split — APPROVED.** The contract table in `T3-INTERACTION-PARITY-CONTRACT.md` is ratified as the RC-4 implementation contract:

- **Panel-local:** selection, drawing target, indicator enable-state, pan bounds, draw/edit keyboard shortcuts, crosshair/label truth.
- **Parent-owned:** `focusedPanelId`, V9 Quick Menu, global settings modal, replay keyboard transport, order rail chrome, unified context menu.

This is the interaction analogue of Plan 1's data-ownership contract. The same standing rule applies: **fixes change ownership to match this table; they do not add guards to preserve today's split.**

**2. Drawing-sync default ON — CONFIRMED intentional.** Cross-panel drawing sync (`multichart-manager.js:101`) stays default ON; it is a product feature. The TAL-01495 fix gates **cross-symbol ghost-apply** (a drawing must never land on a panel showing a different symbol) without changing the default-ON UX for same-symbol panels. If during implementation the worker finds these cannot be separated, that is an escalation, not a default flip.

**3. Row 2 (Ctrl-select collapse, TAL-01498) — RED-isolation approach APPROVED.** Step 2 writes a RED scenario that discriminates between the two candidate mechanisms (inbound `decorateDrawingPointsWithLocalIndices` frame reuse vs parent focus-cleanup racing the selection guard) **before** any fix is designed. The scenario must implicate exactly one mechanism; if both contribute, each gets its own gated fix. No fix lands on an unproven mechanism.

**4. Row 11 (pan bounds, TAL-01491) — measurement probe APPROVED.** Step 2 adds a harness probe measuring host vs iframe effective plot rect (`#chartWrapper` slot geometry vs grid cell) before the fix. The fix targets whichever geometry is wrong per the contract (each tile owns pan bounds for its own canvas); it must not special-case the host tile with an offset constant.

**5. Step 2 scope — CONFIRMED.** Harness scenarios are written only for **retest survivors ∩ contract rows**. T3 remains gated on the PO retest results; no scenario or fix work for rows whose tickets close on b105 retest. Rows marked "verify only" get regression-lock scenarios only if cheap (reuse existing topology), else they're recorded as covered-by-retest.

**6. Ledger correction accepted.** The stale RC-4 citation (`order-manager.js:16626-16643`) is footnoted in ROOT-CAUSES with the corrected evidence (`order-manager.js:7750-7756`, `13374-13430`; `MultichartGrid.jsx:5013-5015`, `5272-5276`, `5905-5914`).

### Constraints restated (binding on step 2–3 workers)

- I11 holds absolutely: the five DEFER-T8 rows (TAL-01480/01488/01489/01496/01497) and the focus-time `dispatchScrollSync` adopt-X path stay out of T3. A step-2 RED that turns out to be mirror-frame policy is re-filed to T8, not fixed in place.
- Row 12's crosshair **sync policy** half (replay + data-range ON) is DEFER-T8; only the label-follows-focus half is T3.
- TAL-01484/01490 (repaint-without-click) belong to T2's invalidation contract if they survive retest — coordinate with Lane 1, do not fix in Lane 2.

### Lane 2 authorization

**T3 step 2 authorized** — proceed immediately for contract rows whose tickets are already confirmed survivors; fill in the rest as the PO retest lands. Step 3 (fixes) requires no further Director checkpoint per row **except** rows 2 and 11, which return with their RED-isolation/probe results before their fixes are dispatched.

---
