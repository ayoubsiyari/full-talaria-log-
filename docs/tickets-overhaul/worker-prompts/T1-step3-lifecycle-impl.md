# WORKER PROMPT — T1 step 3 (Lane 1): ToolLifecycleStore implementation (steps 1–3 only)

> Hand this whole file to the Lane 1 (senior) worker. **Director ruling D-001 authorizes this task.**

---

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 3**, Lane 1. Implement the shared tool-lifecycle store — **migration steps 1–3 only**.

## READ FIRST (binding)
- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — **D-001** (your authorization + constraints)
- `docs/tickets-overhaul/ROOT-CAUSES.md` — **RC-1**
- `docs/tickets-overhaul/INVARIANTS.md` — all binding; especially I1, I3, I4, I5, I8, I9, I11
- `docs/tickets-overhaul/worker-reports/T1-lane1-lifecycle-diagnostic-report.md` — ownership table + mechanisms
- `docs/tickets-overhaul/TRACKS.md` — **T1**

## BINDING INVARIANTS + D-001 CONSTRAINTS
- **RC-1 only.** RC-2 (`scheduleRender`) and RC-3 (VWAP bar-index) are **out of scope** — do not fix even if visible in manual testing. Log RC-2 gaps to registry if H-S32 needs minimal render for GREEN; do not open T2 sweep.
- **I4:** No per-tool-class patches. First-click routes through store `toolSelected` on placement-complete. Ghost-after-delete routes through `toolDeleted` driving subscriber teardown — not per-delete-path cleanup.
- **I11:** No mirror-frame guard work.
- **Scope freeze:** Steps **4–7 are forbidden** in this build (no object-tree migration, no manager-flags→store collapse, no legacy `Chart.selectedDrawing` retirement, no per-tool class migration). One diff, one mechanism, one kill-switch.

## TASK
Implement `ToolLifecycleStore` + event subscribers for **migration steps 1–3**:

| Step | Scope | Subscribers |
|---|---|---|
| **1** | Quick menu / floating toolbar + V9 parent sync | `DrawingToolbar`, `notifyV9SelectionSync`, `notifyMultichartParentSelectionCleared` |
| **2** | Price/time axis labels + on-canvas label groups | `BaseDrawing.showAxisHighlights` / `hideAxisHighlights`, `.drawings-labels` |
| **3** | Settings dialog + context menu | `DrawingSettingsPanel`, `DrawingContextMenu` |

### Required mechanisms (D-001)
1. **First-click (H-S32):** When `finalizeDrawing` / `addDrawing` completes placement, emit `toolSelected` through the store so the full subscriber chain runs on the **same** interaction (equivalent to `selectDrawing` with `{ allowWhileArmed: true }`). Do not patch individual tool classes.
2. **Ghost-after-delete (H-S33):** `deleteDrawing` emits `toolDeleted`; subscribers tear down settings (`hide()` + clear `currentDrawing`), toolbar, V9 desync, context menu, axis labels. Do not add one-off cleanup in each delete path.

### Kill-switch
`window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` — default **unset = fix ON**; set = legacy behavior (RED repro).

## RED-FIRST (mandatory order)
1. Confirm H-S32 and H-S33 are **RED** on current tree (should already be tracked in `known-failing.json`).
2. Implement store + steps 1–3 behind kill-switch.
3. **GREEN:** H-S32 ×3 + H-S33 ×3 (flake-stable).
4. **RED again:** `--bugswitch=__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` → both FAIL ×3 (non-vacuous).
5. **`npm run gate` GREEN** — H-S32/H-S33 promoted out of `known-failing.json`; all H-S2…H-S31 still PASS; 0 regressions.

## DELIVER (report as `.md` in `docs/tickets-overhaul/worker-reports/T1-step3-lifecycle-impl-report.md`)
1. Store module path + event API summary.
2. Which call sites now emit vs subscribe (file:line).
3. **State matrix (I5 / D-001):** single chart / multichart panel × placement-complete / select-existing / delete-via-settings / delete-via-keyboard × settings-open / settings-closed — mark which cells changed.
4. H-S32/H-S33 GREEN + kill-switch RED evidence (×3 each).
5. Gate output (31 scenarios, 0 known-failing after promotion).
6. Both engine trees SHA256-identical; build id bumped; `node --check` + lints clean.
7. Explicit statement: steps 4–7 **not** touched; RC-2/RC-3 **not** touched.

## STOP CONDITIONS
Mechanism belongs to another RC, invariant conflict, or step 3 cannot turn H-S32/H-S33 GREEN without touching steps 4–7 or RC-2/RC-3 → STOP and report to Manager (do not improvise).
