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

---

## ESC-003 — T1 first build GREEN: request T1 step 4 authorization

**Date:** 2026-07-12  
**Track:** T1 step 3 → step 4 (Lane 1)  
**RC:** RC-1  
**Urgency:** Lane 1 idles until step 4 is authorized (heaviest lane, 60%+ of ticket volume).

### First-build result (D-001 exit criteria — ALL MET)
Worker 2 delivered `worker-reports/T1-step3-lifecycle-impl-report.md`. Manager verification of the evidence:

| Exit criterion (D-001) | Result |
|---|---|
| H-S32 (first-click-fails) GREEN | PASS ×3 runs |
| H-S33 (ghost-after-delete) GREEN | PASS ×3 runs |
| Kill-switch A/B turns both RED | FAIL ×3 with `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` set |
| Full gate clean | 31 scenarios pass, 0 known-failing, 0 regressions |
| Migration steps 1–3 only (no 4–7) | Confirmed — no object-tree / manager-flags / `Chart.selectedDrawing` retirement / per-tool migration |
| RC-2 / RC-3 kept out | Confirmed |
| Both trees byte-identical | SHA256 MATCH on all 10 paired files |
| State matrix delivered | 16-cell matrix (single/multi × 4 actions × settings open/closed) |
| I11 (no mirror-frame guards) | Held |

Mechanism is correct per D-001: first-click routes through `toolSelected` on placement-complete (`drawing-tools-manager.js:6441,6829`) and armed-tool select (`:3556`); ghost-after-delete routes through `toolDeleted` driving all subscriber teardown (`:10693`) — not per-path patches.

Build id bumped to `20260712b1` (see note below).

### Decision requested
**Authorize T1 step 4** — migration steps 4–7 (object tree, manager selection/hover/edit flags → store, retire legacy `Chart.selectedDrawing`/`Chart.drawings` index stack, per-tool classes subscribe to store for chrome). This is where selection-desync (43) and stale-quick-menu (24) families fully close.

### Manager recommendation
Authorize step 4, **conditional on PO live-confirmation of the first build on `20260712b1`** (first-click works, no ghost-after-delete, kill-switch A/B reproduces live). Live-check runs in parallel so Lane 1 doesn't idle; if the live-check fails, step 4 pauses and we re-escalate. Suggest the four-family suites (add selection-desync + stale-quick-menu RED coverage — being staged in Lane 4) as the step-4 acceptance contract, matching the TRACKS T1 exit.

### Note for the ledger (build-id coordination — not a decision)
Lanes bumped build id independently: T4 → `20260707b106`, T1 → `20260712b1`. Files are disjoint, so the current tree carries both fixes under the latest id `20260712b1`. Going forward the canonical build id is `20260712b1`; future bumps continue from there. Flagging so the naming lineage is on record.

---

## ESC-004 — T3 rows 2 & 11 isolation checkpoint (D-002 retained checkpoint)

**Date:** 2026-07-12  
**Track:** T3 step 2 → step 3 (Lane 2)  
**RC:** RC-4  
**Urgency:** D-002 requires these findings return to the Director before either fix is dispatched. Lane 2 idles until ruled.

Worker 3 delivered `worker-reports/T3-step2-row2-row11-isolation-report.md` (probe `t3-row2-row11-probe.mjs`; I9 intact — not promoted to gate).

### Row 2 — Ctrl-select collapse (TAL-01498): new mechanism implicated
The RED reproduces (panel B ends `selectedIds: []`), and it implicates **exactly one** mechanism — but **neither of the two D-002 candidates**:
- Candidate (a) inbound coordinate decoration wrong-frame — **ruled out**: panel-B geometry stays separated (center distance 321.77px before *and* after; distinct incoming x-ranges preserved).
- Candidate (b) parent focus-cleanup racing the guard — **ruled out**: no `clearDrawingUiOnOtherPanels` / `deselectDrawingsOnNonFocusedPanels` fired during the failure (only `panel-focus` messages).
- **Implicated:** local panel Ctrl-click **double-toggle** — the same drawing id is `selectDrawing`-selected then immediately `selectDrawing`-toggled back out within one interaction (`c-local-double-toggle`, `localDoubleToggle: true`). Fix would target row 2's panel-local selection dispatch (consistent with the ratified panel-local ownership).

**Decision requested:** acknowledge the updated mechanism and authorize a step-3 gated fix on the panel-local Ctrl-click selection path (single select-vs-toggle decision per interaction).

### Row 11 — Pan bounds (TAL-01491): not reproducible in harness
Measurement probe found host and iframe **effective plot rects identical** (both `584×870`, canvas `639×900`, margins equal; only the expected -641px column offset differs). `offsetX` host −13448.008 vs iframe −13425, candleSpacing 7.002 both. **No plot-rect geometry violation exists in the harness topology** — so the probe does not justify any host-only geometry fix or offset constant.

**Decision requested:** rule on disposition — (i) request a PO live drag-trace (pointerdown/move/up + offsetX deltas) in the exact production layout TAL-01491 was filed against, then re-probe; or (ii) treat TAL-01491 as a retest-close candidate pending the PO retest. Manager recommends **(i)** — capture the live trace before closing, since the harness can neither reproduce nor exonerate it.

### Note
Both rows are the D-002 retained checkpoint; all other step-3 rows proceed without Director involvement once the PO retest defines the survivor set.

---

## ESC-003 — RESOLVED

**Director ruling:** D-003 (2026-07-12)  
**Outcome:** First build accepted. T1 step 4 authorized conditional-parallel (PO live-confirm `20260712b1` while worker proceeds; failed live check pauses step 4). Added constraint: **step 6 (retire legacy `Chart.selectedDrawing`/`Chart.drawings`) is its own gated commit + own kill-switch**, separable from 4/5/7. Build-id lineage ratified at `20260712b1`; future bumps route through the Manager. Lane 1 unblocked.

## ESC-004 — RESOLVED

**Director ruling:** D-004 (2026-07-12)  
**Outcome:** Row 2 fix authorized on the implicated mechanism (panel-local select-vs-toggle per pointer interaction; host Ctrl-click cell untouched; probe RED promoted to gate). Row 11 gets no fix on current evidence — drag-trace folds into the PO retest row; no repro (build id confirmed) = retest-close, repro = bring trace back before any fix; host offset constant explicitly banned. Lane 2 step 3 (Row 2) unblocked.

---

## ESC-003 — RESOLVED

**Director ruling:** D-003 (2026-07-12)  
**Outcome:** First build accepted. Step 4 authorized, conditional-parallel on PO live-confirmation of `20260712b1`. Constraint added: migration step 6 (legacy `Chart.selectedDrawing` retirement) lands as its own gated commit with its own kill-switch, independently revertible; steps 4/5/7 may share one build. Acceptance contract = four family suites + gate + state matrix + 10-ticket spot-check. Build-id lineage ratified at `20260712b1`; future bumps coordinated through the Manager.

---

## ESC-004 — RESOLVED

**Director ruling:** D-004 (2026-07-12)  
**Outcome:** Row 2 — updated mechanism (local Ctrl-click double-toggle) acknowledged; gated fix authorized on the panel-local selection dispatch (one select-vs-toggle decision per interaction), plain-click and single-chart cells unchanged, probe RED promoted to gate with the fix. Row 11 — disposition (i): drag-trace folded into the existing PO retest row using the ticket's exact layout; no repro with build-id confirmed → retest-close; repro → targeted probe before any fix. No host offset constant on current evidence.
