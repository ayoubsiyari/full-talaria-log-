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

## D-003 — ESC-003: T1 first build accepted; step 4 authorized (conditional-parallel)

**Date:** 2026-07-12  
**Escalation:** ESC-003  
**Track:** T1 step 3 → step 4 (Lane 1)  
**RC:** RC-1

### Rulings
**1. First build ACCEPTED.** Every D-001 exit criterion met (H-S32/H-S33 GREEN ×3 with kill-switch RED proof, gate 31/31, trees byte-identical, correct store-routed mechanism).

**2. T1 step 4 AUTHORIZED — conditional-parallel** (manager structure accepted): PO live-confirms `20260712b1` while the worker proceeds on steps 4/5/6/7. **A failed live check pauses step 4.**

**3. Added constraint — step 6 is its own gated commit.** Retiring legacy `Chart.selectedDrawing` / `Chart.drawings` index stack must be a **separate gated commit with its own kill-switch**, separable from steps 4/5/7. Rationale: the diagnostic showed legacy readers scattered across `chart.js` (Escape/Delete, context menu, redraw paths) — highest blast radius in the lane; must be independently revertible.

**4. Build-id lineage ratified at `20260712b1`.** Future bumps go **through the Manager** — independent lane bumps only worked this time because files were disjoint.

### Lane 1 authorization
Proceed to T1 step 4 immediately. Acceptance = selection-desync + stale-quick-menu family suites (Lane 4 building) GREEN, step 6 independently gated, both trees byte-identical, kill-switch A/B proof per gated slice.

---

## D-004 — ESC-004: Row 2 fix authorized (new mechanism); Row 11 held for live evidence

**Date:** 2026-07-12  
**Escalation:** ESC-004  
**Track:** T3 step 2 → step 3 (Lane 2)  
**RC:** RC-4

### Rulings
**1. Row 2 (TAL-01498) fix AUTHORIZED on the implicated mechanism.** The probe ruled out both D-002 candidates and implicated a third — local **Ctrl-click double-toggle** (same drawing selected then immediately toggle-deselected within one interaction). Fix lands at the **panel-local selection dispatch site**: one select-vs-toggle decision per pointer interaction. The **host-chart Ctrl-click cell stays explicitly untouched** in the state matrix. The probe's RED is **promoted into the gate** alongside the fix.

**2. Row 11 (TAL-01491) — NO fix on current evidence.** Host and iframe plot rects measured identical → nothing to fix. Manager option (i), tightened: the drag-trace **folds into the already-running PO retest row** (no extra round-trip), reproduced in the exact layout the ticket was filed against, build id confirmed.
- No reproduction (build id confirmed) → **retest-close**.
- Reproduction → bring the trace back for a targeted probe **before** any fix is designed.
- **Explicitly banned:** shipping a host offset constant on today's evidence.

### Lane 2 authorization
Row 2 fix proceeds in T3 step 3 (gated, probe promoted to gate). Row 11 waits on PO retest evidence. Remaining step-3 rows proceed once the PO retest defines the survivor set.

---

## D-003 — ESC-003: T1 first build accepted; step 4 authorized with legacy-retirement isolation

**Date:** 2026-07-12  
**Escalation:** ESC-003  
**Track:** T1 step 3→4 (Lane 1)  
**RC:** RC-1

### Rulings

**1. First build ACCEPTED.** All D-001 exit criteria met and manager-verified: H-S32/H-S33 GREEN ×3, kill-switch RED ×3, gate 31/31 clean, steps 1–3 only, RC-2/RC-3 out, trees byte-identical, 16-cell state matrix, I11 held. The mechanism is the ruled one (store-emitted `toolSelected` on placement-complete; `toolDeleted` driving subscriber teardown).

**2. T1 step 4 AUTHORIZED — manager's conditional-parallel structure accepted.** PO live-confirmation on `20260712b1` runs in parallel (first-click works, no ghost-after-delete, kill-switch A/B reproduces live, build id confirmed per frame per L1). If the live check fails, step 4 pauses and re-escalates; work done meanwhile stays on its kill-switch.

**3. Step 4 internal structure — one constraint added.** Migration steps 4, 5, and 7 (object tree, manager flags → store, per-tool chrome subscription) may land as one gated build. **Step 6 (retiring the legacy `Chart.selectedDrawing` / `Chart.drawings` index stack) must be its own gated commit with its own kill-switch** (suggest `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE`), independently revertible. Rationale: the step-1 diagnostic showed legacy readers scattered through `chart.js` (Escape/Delete handling, context menu, redraw paths) — this is the highest-blast-radius slice of Lane 1 and must be separable from the rest of step 4 if something surfaces live.

**4. Step 4 acceptance contract:** the four family suites per TRACKS T1 exit — H-S32/H-S33 stay GREEN, plus the selection-desync and stale-quick-menu RED scenarios being staged by Lane 4 go GREEN; kill-switch A/B on each; full gate clean; state matrix covering single/multichart × the migrated surfaces; 10-ticket manual spot-check from the registry (TRACKS exit) delivered with the report.

**5. Build-id lineage RATIFIED.** Canonical build id is `20260712b1`; future bumps continue from there. Going forward, lanes coordinate bumps through the Manager to avoid parallel lineages (two lanes bumping independently was harmless this time because files were disjoint — do not rely on that again).

---

## D-004 — ESC-004: Row 2 fix authorized on the new mechanism; Row 11 goes to live drag-trace

**Date:** 2026-07-12  
**Escalation:** ESC-004  
**Track:** T3 step 2→3 (Lane 2)  
**RC:** RC-4

### Row 2 (Ctrl-select collapse, TAL-01498)

**1. Updated mechanism ACKNOWLEDGED.** The probe did exactly what D-002 demanded — implicate exactly one mechanism — and the answer (local Ctrl-click double-toggle: the same drawing id is selected then immediately toggle-deselected within one interaction) rules out both original candidates with clean discriminating evidence. This is the process working: we almost dispatched a fix against the wrong mechanism.

**2. Step-3 gated fix AUTHORIZED** on the panel-local Ctrl-click selection dispatch: **one select-vs-toggle decision per pointer interaction** (dedupe the double dispatch at the dispatch site, not by suppressing toggle semantics). Constraints:
- Fix lives in the selection dispatch path (consistent with ratified panel-local ownership) — not in per-tool code, not in the parent bridge.
- Plain-click select/deselect semantics and single-chart Ctrl-click behavior unchanged — state matrix must show the host-chart Ctrl-click cell untouched.
- The probe's RED becomes a promoted gate scenario with the fix (kill-switch A/B), per I2. Coordinate with Lane 1: if T1 step 4's manager-flags migration moves this dispatch site, the fix lands on the store path, not the legacy path.

### Row 11 (pan bounds, TAL-01491)

**3. Disposition (i) ACCEPTED — live drag-trace before any closure.** The harness probe measured host and iframe plot rects identical, so there is nothing to fix on current evidence — but the harness ran a 2-panel topology and cannot exonerate the production layout the ticket was filed against. Ruling:
- Fold the drag-trace into the already-running PO retest (no extra round-trip): the TAL-01491 retest row gains a step — reproduce in the **exact layout from the ticket** (panel count, which tile, fullscreen state) with the trace probe capturing pointerdown/move/up + `offsetX` deltas + plot rects.
- If it does not reproduce with build id confirmed (L1): **retest-close**, no fix.
- If it reproduces: the trace comes back to the Manager for a targeted probe against that topology; fix only after the geometry violation is measured. **No host offset constant on today's evidence** — the probe explicitly does not justify one.

**4. Probe hygiene NOTED AND APPROVED:** the diagnostic probe stayed out of the ratchet gate (I9 intact). Keep `t3-row2-row11-probe.mjs` as a diagnostic asset; promote only the row-2 RED (as a proper scenario) with its fix.

---
