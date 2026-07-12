# Manager Escalations — Tickets Overhaul (Plan 2)

Escalations to the Director only. Routine progress → `MANAGER-FINDINGS.md`.

---

## ESC-001 — T1 design checkpoint: approve ToolLifecycleStore before implementation

**Date:** 2026-07-12  
**Track:** T1 step 2 (Lane 1)  
**RC:** RC-1  
**Urgency:** Blocks Lane 1 implementation (the heaviest lane; 60%+ of ticket volume depends on it).

### Context
Worker 2 delivered the T1 step 1 diagnostic (`worker-reports/T1-lane1-lifecycle-diagnostic-report.md`). **RC-1 confirmed:** there is no single lifecycle owner. Selection, hover, edit, menu, settings, labels, object tree, and legacy `chart.js` paths each hold independent state. No code was edited (diagnostic only).

### Key findings (evidence-backed)
1. **First-click-fails (30 tickets):** `finalizeDrawing` / `addDrawing` can create without running the full `selectDrawing` subscriber chain unless `{ allowWhileArmed: true }`. Second click on an existing shape always calls `selectDrawing` → user sees "first click fails, second works." (`drawing-tools-manager.js:9501-9505`, `6705-6718`, `7291-7294`).
2. **Ghost-after-delete (19 tickets):** `deleteDrawing` clears canvas + manager refs but **does not** call `settingsPanel.hide()`; `DrawingSettingsPanel.currentDrawing` survives. Legacy `chart.js:18956-18964` deletes by index without manager cleanup. V9 quick bar can retain `tlBarSelected` while `toolbar.currentDrawing` is null (`drawing-tools-manager.js:10565-10566`).
3. **RC-2 adjacent:** generic `addDrawing` may not call `chart.scheduleRender()` — contributes to "stuck until click" (T2 track, not T1).
4. **RC-3 adjacent:** anchored VWAP bar-index mutation during render (`drawing-tools-advanced-volume.js:525-531`) — T5 track.

### Proposed design (worker input — NOT implemented)
**Kill-switch (implementation):** `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` (default ON).

**Store shape (per chart/panel instance):**
- `activeTool`, `placement`, `selection` (primaryId + selectedIds), `hover`, `edit`, `visibility`, `drag`

**Events (subscribers only — no cross-module direct mutation):**
- `toolSelected`, `toolDeselected`, `toolHovered`, `toolEditStarted`, `toolEdited`, `toolEditEnded`, `toolDeleted`, `toolHidden`, `toolShown`, `activeToolChanged`

**Migration order (per TRACKS.md):**
1. Quick menu / floating toolbar + V9 parent sync (highest ticket density)
2. Price/time axis labels + on-canvas label groups
3. Settings dialog + context menu (ghost-after-delete family)
4. Object tree
5. Manager selection/hover/edit flags → store
6. Retire legacy `Chart.selectedDrawing` / `Chart.drawings` index stack
7. Per-tool classes — geometry only; subscribe to store for chrome

**T0 harness:** H-S32 (first-click-fails) and H-S33 (ghost-after-delete) are RED and tracked in `known-failing.json` — they become the T1 acceptance contract when implementation lands.

### Decision requested
1. **Approve** the store + events + migration order as specced (or specify amendments).
2. **Approve** proceeding to T1 step 3 implementation behind `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, with RED-first proof on H-S32/H-S33 + the four symptom-family suites per TRACKS exit criteria.
3. **Rule** on scope: should step 3 implement **migration steps 1–3 only** (menus/labels/settings — highest density) in the first build, with steps 4–7 in a follow-on gated task? (Manager recommends yes — smaller blast radius, faster first GREEN on H-S32/H-S33.)

### Manager recommendation
**Approve design; implement migration steps 1–3 first** (quick menu + labels + settings/context menu). That directly targets the two RED harness scenarios and the four highest-density symptom families without touching all 30+ tool classes in one build.

**Do not extend** the plan-1 mirror-frame guard tail (I11). T1 is drawing-tools lifecycle only.

---

## ESC-001 — RESOLVED

**Director ruling:** D-001 (2026-07-12)  
**Outcome:** Design approved. T1 step 3 authorized — migration steps **1–3 only** (quick menu + labels + settings/context menu). Steps 4–7 deferred to T1 step 4 follow-on task. H-S32/H-S33 are the acceptance contract. Lane 1 unblocked.

---

## ESC-002 — T3 interaction-parity contract: approve canonical ownership split + resolve 2 open questions

**Date:** 2026-07-12  
**Track:** T3 step 1 → step 2 (Lane 2)  
**RC:** RC-4  
**Urgency:** Blocks T3 step 2 (harness scenarios). Lane 2 is currently productive on this design; step 2 cannot start until the contract table is ratified.

### Context
Worker 3 delivered the T3 interaction-parity contract (`T3-INTERACTION-PARITY-CONTRACT.md`) + report. **12 interaction surfaces** mapped today→target owner/transport with file:line evidence. No code edited; legacy `multichart/` untouched (L2). I11 respected — replay mirror-frame rows (TAL-01480/01488/01489/01496/01497) are correctly excluded as DEFER-T8, not contract rows.

Manager verification: evidence spot-checked against `embed-bridge.js`, `panel-cmd-bridge.js`, `sync-bridge.js`, `MultichartGrid.jsx` — consistent. The DEFER-T8 exclusion table is disciplined (no attempt to smuggle a mirror-frame fix into T3).

### Decision requested
1. **Approve the canonical ownership split:** **panel-local** selection / draw / indicator state; **parent-owned** V9 Quick Menu, settings modal, focus routing, order-rail chrome. (This is the RC-4 analogue of Plan 1's data-ownership contract.)
2. **Confirm drawing-sync default ON** (`multichart-manager.js:101`) is intentional. T3 would then gate cross-symbol ghost-apply (TAL-01495) **without** changing the default UX. If the Director wants default OFF, that's a scope change to flag now.
3. **Two open questions the worker cannot resolve without a ruling** (both need RED-isolation in step 2 — Director to confirm approach):
   - **Row 2 (Selection/Ctrl-select, TAL-01498):** Ctrl-collapse cause — inbound coordinate decoration (`sync-bridge.js:1784-1838`) vs parent focus-cleanup racing the selection guard? Manager recommends: step 2 writes a RED that isolates which, before any fix.
   - **Row 11 (Pan bounds, TAL-01491):** host `#chartWrapper` slot geometry vs iframe cell mismatch. Manager recommends: measure host vs iframe effective plot rect in a RED harness probe before fix.

### Manager recommendation
**Approve the split and default-ON confirmation; authorize step 2 to proceed RED-first**, resolving the two open questions by reproduction rather than up-front design (they are mechanism-identification, exactly what a RED scenario is for). Step 2 scope = **retest survivors ∩ contract rows** only — so it stays gated on the PO retest results (in progress).

### Note for the ledger (not a decision)
ROOT-CAUSES RC-4 cites `order-manager.js:16626-16643` as the host order rail; that line range is **stale** (now TP-render HTML). Corrected evidence: `order-manager.js:7750-7756`, `13374-13430`; `MultichartGrid.jsx:5013-5015`, `5272-5276`, `5905-5914`. Flagging so ROOT-CAUSES can be footnoted; not blocking.

---

## ESC-002 — RESOLVED

**Director ruling:** D-002 (2026-07-12)  
**Outcome:** Contract table ratified (panel-local selection/draw/indicator/pan; parent-owned focus/quick-menu/settings/replay-transport/order-rail/context-menu). Drawing-sync default ON confirmed intentional — TAL-01495 fix gates cross-symbol ghost-apply only. Rows 2 and 11 proceed by RED-isolation/measurement probe and return to Director with results before their fixes dispatch. Step 2 scope = retest survivors ∩ contract rows. Stale RC-4 citation footnoted. Lane 2 step 2 authorized.
