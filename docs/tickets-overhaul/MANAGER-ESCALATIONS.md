# Manager Escalations — Tickets Overhaul (Plan 2)

Escalations to the Director only. Routine progress → `MANAGER-FINDINGS.md`.

---

## ESC-012 — T8 mirror-policy table ready for approval; independent×playing cell (TAL-01590 P1 freeze) diverges from shipped behavior

**Date:** 2026-07-15
**Track:** T8 (Lane 2), per D-013
**RC:** RC-8
**Urgency:** Gates the T8 migration (D-013 ruling 1 step 3 requires Director approval of the table before impl). TAL-01590 is a live P1.

### Context
Lane 2 delivered `T8-MIRROR-POLICY-TABLE.md` — the full adopt-data / adopt-X / adopt-Y matrix (TF relation × replay × sync), each cell extracted from the shipped guard that dictates it (file:line cited). This is the design doc D-013 ruling 1 step 2 asked for, with the A5/TAL-01590 trace as its first input. Coverage-hardening scenarios (H-S60–H-S78, step 1) are being written in parallel and encode current behavior only.

### TAL-01590 root cause (the P1 freeze)
**Policy gap, not a guard bug.** There is **no independent-symbol equivalent of BL-10 play-advance** (`scheduleCoalescedSeek` during `isPlaying`, which only runs when `isSameSymbolAsHost`). Independent-symbol panels advance via mirror-frame timestamps + async `ensureReplayDataCoversTimestamp`; when the fetch lags or the 3-strike catch-up breaker trips (`panel-cmd-bridge.js:1135–1143`), the panel **freezes at its loaded edge for 2.5s+** while the host plays on. This is the `{independent × playing}` cell, and its **correct** policy (advance on the panel's own master, mirroring BL-10) **differs from shipped behavior** — so per D-013 ruling 3 it is an escalation, not a silent correction.

### Decisions requested
1. **Approve the policy table** as the T8 acceptance spec (or flag cells to revisit), unblocking step 3 migration behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`.
2. **Authorize the independent×playing cell change** (TAL-01590 fix): add an independent-symbol play-advance path analogous to BL-10, gated by a new switch (proposed `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`). This is the one cell where correct ≠ shipped and it's the live P1.
3. **Rule on the other escalation-candidate cells:** playing×drag×adopt-X (BL-16, TAL-01578 — diagnostic-first?), release snap-back adopt-X (TAL-01579 — prepend-compensation policy?), and the two cross-cuts that are **not** mirror-policy (TAL-01573 manual-rescale re-render → RC-2; TAL-01563 group-advance cadence → documented-intentional, PO may want smoother).
4. **Harness fidelity flag (I15/D-012 family):** the current H-S59 passes on the contract path (`hostReplaySeek`+`replayFrame`) but does **not** reproduce the real B-freeze — `serve.mjs` only serves one symbol and the inner loop uses synthetic seek, not tick-animation. A faithful RED (`H-S59b`) needs ≥2 distinct-symbol panels + production-faithful play actuation. This overlaps Lane 4's honest-harness rebuild — request a ruling on who owns the distinct-symbol replay actuation surface.

### Manager recommendation
Approve (1) and (2) — TAL-01590's fix is well-scoped and gated. For (4), have Lane 2 extend `serve.mjs`/host scenarios for the distinct-symbol replay RED (host harness, not `react-parity-lib.mjs`), coordinating the actuation approach with Lane 4 to avoid a second false-green. Migration stays staging-only while the D-012 deploy freeze holds.

---

## ESC-012 — RESOLVED

**Director ruling:** D-014 (2026-07-15)  
**Outcome:** (1) Policy table **approved** as the T8 acceptance spec, with the three §4 flagged cells carved out of silent migration; all ratified cells unblock guard-by-guard migration behind `__TALARIA_DISABLE_MIRROR_POLICY_V2`. (2) **Independent×playing cell change authorized — T8 priority item**: advance on the panel's own master during play (BL-10-style), catch-up/breaker demoted to fallback; gated `__TALARIA_MC_DISABLE_INDEPENDENT_PAIR_PLAY_ADVANCE`; **RED-first via H-S59b only** (current H-S59 disallowed as acceptance); may land ahead of the migration; acceptance = H-S59b RED→GREEN + switch A/B + BL-10/11/12/13 green + PO live-confirm on staging. (3) BL-16 diagnostic-first confirmed (H-S78 pins); TAL-01579 escalation-class, H-S73 pins first, separate diagnostic later; TAL-01573 re-routed to RC-2/T2; TAL-01563 documented-intentional — retest after the independent-play fix (its freeze-stutter may be the real complaint). (4) Lane 2 owns the distinct-symbol replay actuation surface (`serve.mjs` + host scenarios — not `react-parity-lib.mjs`); Lane 4 gives a written actuation sign-off in MANAGER-FINDINGS before H-S59b is trusted; I15 end-state assertions mandatory. (5) Lane 2 order: H-S59b RED → independent-play fix → staging → PO confirm; H-S60–78 promotion parallel; migration of ratified cells; then TAL-01579 diagnostic.

---

## ESC-006 — RESOLVED

**Director ruling:** D-006 (2026-07-13)
**Outcome:** Premise corrected — the kill-switch isolation test was inconclusive because T1 steps 4/5 edited `MultichartGrid.jsx` (`:4756`, `:5822-5837`) **outside** the engine kill-switch (an I3 breach), so "switch off, no change" cannot distinguish "React owns selection" from "our own un-gated React edits regressed it." Rulings: (1) no harness-only acceptance — approved; (2) recovery path (a) **reordered** — step-7's first deliverable is a **gating audit + A/B revert of the un-gated React edits** in the real product, before any ownership hunt; (3) fallback (b) **pre-authorized** — if the step-4/5 model is wrong for panels, revert + default multichart migration OFF (single-chart stays ON), ship a stable build, re-migrate under the parity gate; option (c) rejected (Lane 1 owns recovery); (4) production-React parity checklist = standing per-build gate (manual now, Lane 4 automates later); (5) **new INVARIANTS I13** — a kill-switch must cover every file a fix touches, React included; ungatable edits are an automatic acceptance blocker. Step-7 prompt restructured to lead with the audit.

---

## ESC-006 (original) — T1 multichart selection: harness-green fixes keep breaking the live React product; approach decision needed

**Date:** 2026-07-13
**Track:** T1 (Lane 1), build `20260712b8`
**RC:** RC-1
**Urgency:** Blocks T1 closure; PO's live multichart selection is degraded vs. pre-overhaul.

### Context
T1 steps 4 and 5 each passed the harness gate (H-S32–37/43/44 green) and were accepted, but each broke the **live React multichart** in a way the harness never caught. On `b8` the PO reports three concurrent regressions in multichart panels (single chart is fine):
- **R1** — Ctrl-select no longer works correctly.
- **R2** — no blue selection/preview border shown during selection.
- **R3** — settings menu **flashes open then immediately closes** in a panel (open/close race in one interaction).

### The mechanism-level finding (why this is an escalation, not a patch)
Isolation test: PO set `window.__TALARIA_DISABLE_TOOL_LIFECYCLE_V2 = true` and reloaded. **No change** — all three regressions persist with the T1 engine lifecycle disabled. That means the live multichart selection path does **not** run through the gated engine lifecycle the workers have been editing; the production React surface (`MultichartGrid.jsx` / chart-embed) is the real owner, and it is neither gated by our kill-switch nor exercised by the harness (`multichart-manager.js`). We have been validating fixes on a surface that isn't the one the PO uses.

### Decision requested
1. **Pause forward patching of T1 on harness evidence.** Require every T1 multichart fix to carry a **real-product (React `MultichartGrid`) reproduction + verification**, not harness-only, before acceptance.
2. Choose the recovery path:
   - **(a)** Keep the kill-switch defaulted ON and dispatch the consolidated Lane-1 diagnostic (`T1-step6-...`) to find where the React surface owns selection and fix R1/R2/R3 there; **or**
   - **(b)** Default the T1 multichart migration **OFF** (ship known pre-overhaul behavior for panels) until a production-React parity harness exists, then re-migrate once; **or**
   - **(c)** Fold this into T3 (multichart interaction parity, Lane 2) since the owner is the React multichart, not the engine.
3. Authorize a small **production-React parity check** (even a manual PO script) as a standing acceptance gate for T1/T3 multichart work, since the current harness has a proven blind spot.

### Manager recommendation
Approve **(1)** unconditionally. For recovery, **(a)** with a hard constraint: Lane 1's step-6 diagnostic must locate the React-surface owner and reproduce R1/R2/R3 there before any fix; if it can't be fixed without reworking the step-4/5 ownership model, fall back to **(b)**. Add the production-React parity check as a gate. T1 acceptance rolled back to ~70% until live-confirmed.

### UPDATE (2026-07-13) — step-6 diagnostic returned; mechanism CONFIRMED in React parent
Lane 1 completed Part 1 and stopped at the stop condition (fix requires a React ownership rework). The owner is `MultichartGrid.jsx`, not the engine:
- **R3 (settings flash):** open path `openDrawingSettingsForPanel()` (`MultichartGrid.jsx:4854-4867`) races the close path — `clearDrawingUiOnOtherPanels()` still calls `closeDrawingSettingsOnAllPanels()` **unconditionally** (`:4754-4768`), and `openDrawingSettingsForPanel()` itself calls it right after opening (`:4860-4867`). `skipV9Dismiss` only skips `multichart-dismiss-drawing-settings`, not the parent-wide close → open-then-close in one interaction.
- **R2 (no border):** per-tool selected chrome is engine-owned (`drawing-tools-base.js:2280-2296`) but the panel focus frame is React-owned (`MultichartGrid.jsx:3585-3624`, `:6508-6522`) and CSS strips all other borders (`talaria-design/live/index.html:266-301`); routing selection through parent cleanup desyncs the two owners.
- **R1 (Ctrl):** Row-2 iframe suppression is correctly scoped, but parent focus cleanup (`clearDrawingUiOnOtherPanels()`/`deselectDrawingsOnNonFocusedPanels()`, `MultichartGrid.jsx:1970-1988, 3719-3742, 6308-6322`) is a separate owner that still re-routes UI around the iframe selection.
- **Recommended fix shape (worker):** split `clearDrawingUiOnOtherPanels(sourceId, opts)` into source-preserving ops (peer-deselect / peer-settings-close / parent V9 dismiss / source-settings-close-only-on-explicit-deselect-Esc-delete); treat `multichart-close-drawing-settings` as source-scoped, not "clear all other panels."
- **Harness blind spot proven:** H-S43/H-S44 both PASS while the live surface is broken. A real-React acceptance path is mandatory before the fix is accepted.

**Refined decision requested:** authorize the step-7 fix in `MultichartGrid.jsx` (recovery path (a)) per the worker's fix shape, gated by a new React-scoped switch, with a mandatory real-product PO acceptance script (already drafted in the step-6 report). Full diagnostic: `worker-reports/T1-step6-multichart-selection-regression-report.md`.

---

## ESC-006 — RESOLVED

**Director ruling:** D-006 (2026-07-13)  
**Outcome:** Premise corrected — the kill-switch isolation test is **invalid evidence**: steps 4/5 edited production React (`MultichartGrid.jsx:4756`, `:5822-5837`) *outside* `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, so "switch off, no change" cannot exonerate our own un-gated edits (I3 breach in substance). Request 1 approved unconditionally. Recovery = (a) but step-6 diagnostic starts with a **gating audit**: enumerate every un-gated step-4/5 edit (edit → switch coverage → revertible table), A/B-revert them against R1–R3 in the real product *first*; only then hunt independent React ownership. Fallback (b) pre-authorized if the model is wrong for panels (single-chart stays ON). Option (c) rejected — Lane 1 owns its regressions. Production-React parity checklist becomes a standing acceptance gate (Lane 4 scopes automated version after recovery). New standing rule: **a kill-switch must cover every file its fix touches** — ungated-live + harness-green is an automatic acceptance blocker.

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

## ESC-005 — T4 order-type behavior: reinstate correct auto-reclassification (reverses part of an accepted deliverable)

**Date:** 2026-07-12  
**Track:** T4 (Lane 3)  
**RC:** RC-5  
**Urgency:** Behavioral — the shipped default-ON T4 build now behaves opposite to what the PO wants; and an accepted invariant is wrong.

### Context (live-verified on `20260712b2`)
PO confirmed in default state (no kill-switches): entry-line drag is smooth, no crash (the earlier d3 `document`-null crash was a kill-switch artifact and is withdrawn). **However**, the PO wants order type to **auto-reclassify by price vs market** — the standard broker mapping:
- Buy below market → **Buy Limit**; Buy above market → **Buy Stop**; at market → **Market** (and mirror for Sell).

### Conflict with accepted T4 step 1 (D-none; accepted by Manager)
T4 step 1 deliberately **froze** order type on drag — it guarded off the auto-detect at `order-manager.js:18789–18837` / `18920–18944` under `__TALARIA_DISABLE_ORDER_AGGREGATES_V2` — to discharge TAL-00752 "limit mutates to stop/market when dragged." It also encoded **property invariant #3: 'order type never mutates on move.'** Both now contradict the PO's required behavior.

### Re-interpretation of TAL-00752
The genuine defect was almost certainly **incorrect** reclassification (wrong direction / limit→market corruption) bundled with the aggregate/PNL math bugs — NOT the existence of reclassification. T4 step 1's aggregate math fix (average/risk-split/PNL) is correct and should stay; only the "freeze order type" decision is wrong.

### Decision requested
1. **Authorize reinstating order-type auto-reclassification** with correct limit/stop/market semantics (by price relative to market, per side), as a **new gated fix** (`window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2`), decoupled from the aggregate math (kept) and display/parse (kept).
2. **Revise T4 property invariant #3** from "order type never mutates on move" to "order type reclassifies to the correct limit/stop/market per price-vs-market on move" — RED-first property tests asserting the full mapping (both sides, all three zones, multi-entry legs).
3. Confirm this still discharges TAL-00752 (the reclassification is now correct + aggregates already fixed).

### Manager recommendation
Approve both. Implement as its own gated fix; keep T4 step 1/step 2 switches intact; add the corrected mapping property suite + a live drag spot-check as acceptance. Lane 3 holds this task until ruled; it continues T4 step 3 (replay-interaction) meanwhile.

---

## ESC-005 — RESOLVED

**Director ruling:** D-005 (2026-07-12)  
**Outcome:** Approved after primary-source check (TAL-00752 #17: *"it remains called a market order, even if it was a limit order"* = label failed to update). Reclassification reinstated as gated fix `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` (decoupled from step-1/step-2). Semantics: below=Limit, above=Stop, at-market (tick tolerance, one unit per I12)=Market; mirrored for sell; each leg independent. Invariant #3 revised + tests replaced (both sides × 3 zones × zone-crossing × multi-leg). PO live spot-check (drag through Limit→Market→Stop) is acceptance. **New standing rule → INVARIANTS P6:** product-behavior invariants must quote their source ticket. Lane 3 unblocked.

---

## ESC-005 — RESOLVED

**Director ruling:** D-005 (2026-07-12)  
**Outcome:** Both requests approved — Director verified the re-interpretation against the source thread (TAL-00752 #17: *"…it remains called a market order, even if it was a limit order"* — the tester wanted the label to update, not freeze). Reclassification reinstated as its own gated fix (`__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2`), standard broker mapping per side, per leg, tick tolerance named with one unit. Invariant #3 revised to "type always equals correct classification for price-vs-market"; full-mapping property suite replaces the old tests. Steps 1–2 switches stay. Acceptance includes PO three-zone drag spot-check. New standing rule: product-behavior invariants must quote the source ticket in acceptance reports.

---

## ESC-003 — RESOLVED

**Director ruling:** D-003 (2026-07-12)  
**Outcome:** First build accepted. Step 4 authorized, conditional-parallel on PO live-confirmation of `20260712b1`. Constraint added: migration step 6 (legacy `Chart.selectedDrawing` retirement) lands as its own gated commit with its own kill-switch, independently revertible; steps 4/5/7 may share one build. Acceptance contract = four family suites + gate + state matrix + 10-ticket spot-check. Build-id lineage ratified at `20260712b1`; future bumps coordinated through the Manager.

---

## ESC-004 — RESOLVED

**Director ruling:** D-004 (2026-07-12)  
**Outcome:** Row 2 — updated mechanism (local Ctrl-click double-toggle) acknowledged; gated fix authorized on the panel-local selection dispatch (one select-vs-toggle decision per interaction), plain-click and single-chart cells unchanged, probe RED promoted to gate with the fix. Row 11 — disposition (i): drag-trace folded into the existing PO retest row using the ticket's exact layout; no repro with build-id confirmed → retest-close; repro → targeted probe before any fix. No host offset constant on current evidence.

---

## ESC-007 — T3 contract intake rows 13–15: approve owner/transport + resolve 2 open questions

**Date:** 2026-07-14  
**Track:** T3 step 1 → step 2 (Lane 2)  
**RC:** RC-4 (rows 13–15 are intake amendment A2/row-15 from `DAILY-INTAKE.md`)  
**Urgency:** Blocks T3 step-2 RED scenarios for the three new rows. Lane 2 is NOT idle (now on TAL-01564 SW-hygiene), so this is not lane-blocking — but the rows can't advance to fixes without ratification, same P4 process as rows 1–12.

### Context
Worker 2 delivered the updated contract (`T3-INTERACTION-PARITY-CONTRACT.md`, 15 rows) + report (`worker-reports/T3-step1-parity-contract-report.md`), docs-only, no engine/React edits (confirmed; legacy `multichart/` untouched). Report meets `WORKER-REPORT-STANDARD`. Proposed owner/transport for the new rows:

| # | Surface | Ticket | Proposed owner | Proposed transport |
|---|---|---|---|---|
| 13 | Layout persistence across refresh | TAL-01571 | Parent shell (V9 React) | `userStorage` save `{layoutId, panelCount, layoutIndex}` on picker change; hydrate before `MultichartGrid` mount (gate `layoutPanels.n > 1`) |
| 14 | Tile geometry / clip (chart fills tile) | TAL-01574 | Parent shell orchestrates bbox; each panel resizes canvas | host: `applyHostSlot` DOM overlay; iframe: `ResizeObserver → chart.resize()` + layout-settle `repaintAllPanelSurfaces` |
| 15 | Symbol-sync ON converges panels to focused ticker | TAL-01586 | Parent shell on toggle edge; focused panel owns source ticker | on false→true: read focused `fileId`, fan `runCommand('loadFile')` to peers (mirror `visibleRange` snap, `multichart-manager.js:181-198`) |

Row 11 also updated in the contract with **TAL-01587 REOPENED** (pointer-capture/`mouseleave` on host tile; live drag-trace mandatory) — consistent with the DAILY-INTAKE Row-11 reopen; no new decision needed beyond D-004's superseded retest-close path.

### Decision requested
1. **Approve rows 13–15 owner/transport** as specced (all parent-shell-owned — consistent with the D-002 ratified split where the parent owns focus/quick-menu/settings/layout chrome).
2. **Row 13 open question:** persist via a **new V9 storage key** vs **extend the existing `chart_panel_state` blob**?
3. **Row 15 open question:** convergence source = **focused panel** (worker-recommended) vs **always host tile A**?

### Manager recommendation
- Approve 1 — the split is consistent with the ratified contract; layout structure/persistence is parent-shell by nature.
- Row 13 → **extend the existing `chart_panel_state` blob** (add a `layout` field) rather than a second key, to keep a **single persistence owner** and avoid restore desync between two stores (a fresh key risks the two drifting on partial writes). Only split to a new key if the existing blob is per-panel-content-scoped and can't carry layout-level structure — Worker 2 to confirm the blob's scope in step 2.
- Row 15 → **focused panel** as source. "Always host tile A" is surprising when the user has focused another panel to sync from; focused-panel matches the ratified "focused panel owns source ticker" model and the PO's spec wording ("converge all panels to the same ticker (the focused/host panel's)").
- Row 11 → no new ruling needed; proceed under the DAILY-INTAKE reopen (live drag-trace mandatory before any fix).

---

## ESC-007 — RESOLVED

**Director ruling:** D-008 (2026-07-14)  
**Outcome:** Rows 13–15 owner/transport ratified (all parent-shell, consistent with D-002). Row 13 = extend `chart_panel_state` blob (worker confirms schema fits; corrupt-value fallback to single layout is mandatory and in the RED; structure-only restore). Row 15 = focused-panel source, **toggle-edge only** (boot/panel-added cells out of scope without new PO spec; no-fileId-at-edge behavior stated in fix spec); fan-out via existing `runCommand('loadFile')`. I13 binding on all three (React files gated; acceptance = `build:live` + parity checklist, not harness). RED scenarios may start now; fixes sequence after TAL-01564 by evidence readiness.

---

## ESC-008 — A3 replay mode/cadence: authorize 2 fix tasks + rule on the TAL-01582 behavioral fork

**Date:** 2026-07-14  
**Track:** A3 (Lane 3), diagnostic on build `20260712b8`  
**RC:** RC-5 adjacent (plan-2 amendment A3)  
**Urgency:** Not lane-blocking (Lane 3 proceeds on ruling-independent harness prep) — but the fixes can't land without the behavioral ruling.

### Context
Lane 3 delivered `worker-reports/A3-lane3-replay-mode-cadence-diagnostic-report.md` (per WORKER-REPORT-STANDARD; diagnostic-only, no edits, mirror confirmed byte-identical). Root cause: replay **interval ownership is split across three stale layers** — the V9 slider writes a dead `_replayIntervalRawCandles` field the engine no longer reads; the canonical `setStepTimeframe()`/`stepTimeframeOverride` path is used only by multichart iframe sync; and the hidden-select `change` handler is a no-op. Two separate mechanisms:
- **(a) TAL-01582:** `play()` gates `useTickAnimation = tick && !explicitInterval`, so any path that sets `stepTimeframeOverride` (multichart sync) silently falls back to the candle loop while the UI still shows "Tick."
- **(b) TAL-01581:** step size reads the hidden select while routing/sync read the override → inconsistent bucket math (4h-interval-on-4h-TF/1m-master = 240-bar jumps), double-step on play start, intermittent edge stalls.

### Decision requested
1. **Authorize two gated fix tasks** (two kill-switches, per the worker's §3): `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` (a) and `__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` (b), sharing a small prelude (wire the V9 slider → `setStepTimeframe`, delete the dead field).
2. **Rule on the (a) behavioral fork** (product decision, like D-005): when Tick mode has an explicit interval set — **(A)** allow tick animation with the interval controlling step boundaries only, or **(B)** force the candle path but update the UI/label so mode matches behavior? PO input likely needed.

### Manager recommendation
Approve (1). For (2), recommend **(A)** — the user selected Tick deliberately; the interval should bound steps, not silently override the mode. Fix (b) lands first (pure correctness, no fork), fix (a) after the (A)/(B) ruling. Each RED-first against the new replay-mode harness scenarios (Lane 3 authoring now). P6: both tickets quoted in the report.

---

## ESC-009 — Iframe-panel toolbar fix has failed live 3× despite fast-loop green; dev:live is not a faithful acceptance surface

**Date:** 2026-07-14
**Track:** T1 (Lane 1), build `20260712b11` (PO-confirmed on host AND panel B)
**RC:** RC-1 / tooling-fidelity
**Urgency:** Recurring wasted deploy cycles; erodes confidence in "DONE (proven)" for multichart.

### Pattern
Steps 11, 12, and 13 each reported deterministic GREEN on the **dev:live fast loop** (step 13: 20/20) and each **failed the real server iframe panel**: panel B still renders the OLD engine `#drawing-toolbar` on a build-id-confirmed `b11`. Step 13's own report noted "build:live + Docker PO path not run in this session." The dev:live mount shares context with the parent, so parent-global-based suppression works there but not inside the real cross-window iframe — the fast loop cannot reproduce the exact defect.

### Decision requested
1. **Standing rule:** for **iframe-panel multichart** fixes specifically, dev:live fast-loop green is **necessary but not acceptance** — acceptance requires **real built-product verification** (`build:live`/served build, or Lane 4's T0-step8 React-parity harness driving the real `MultichartGrid`), with build id confirmed inside the panel iframe.
2. **Sequencing:** gate future iframe-panel toolbar/selection fixes on **T0-step8** (automated real-React parity harness) landing, so we stop shipping fast-loop-green/live-broken. Step 14 (dispatched now) already requires real-product proof + screenshot.

### Manager recommendation
Approve both. Step 14 is already written to (a) fix via a reliable in-iframe signal posted by the parent bridge (not parent globals) and (b) require real-product 10× proof. Recommend making T0-step8 the durable gate for this whole family. This is the D-006 blind spot recurring — the parity check must become real, not dev:live.

## ESC-010 — Real-iframe harness reveals broad panel-B interaction breakage; per-surface vs consolidated-root decision

**Date:** 2026-07-14
**Track:** T1 (Lane 1) ∩ T3 (Lane 2), build `20260712b26` (local built dist-v9)
**RC:** RC-1 / RC-4
**Urgency:** Scope/architecture decision — determines whether the next 5–6 fixes are separate steps or one consolidated fix. Not lane-blocking (15/16 + T3 rows in flight).

### Finding
Now that T0-step9 runs the parity rows **faithfully on real iframes**, panel-B interaction is broken across **seven** surfaces (only blue-border H-R02 and Ctrl-click H-R03 pass): H-R01 single-click shows **no parent V9 quick bar**, H-R04 dbl-click→settings, H-R05 Esc leaves chrome selected, H-R06 delete doesn't remove, H-R07 peer isolation fails, H-R08 marquee inactive, H-R09 click chain broken. Registered HR-PARITY#1–#8. The dev:live-only history hid all of this.

### The decision
H-R01 (a panel-B selection never produces the parent V9 quick bar) is very likely the **root**: settings-open, Esc-deselect, delete-routing, and the click chain all cascade from selection→parent-chrome routing being incomplete across the iframe boundary. So:
1. **Confirm the common root** with one diagnostic (does driving panel-B selection→parent V9 chrome over the bridge collapse H-R01/04/05/06/09 together?), before dispatching any more per-surface fixes.
2. **Then choose:** (a) continue per-surface I14 steps (17, 18, …), or (b) **one consolidated panel-B interaction-parity fix** — parent chrome subscribes to panel-B selection over the postMessage bridge (I14), HR-PARITY rows as the acceptance contract. Owner: T3/Lane 2 (RC-4 interaction parity) coordinating the I14 transport with Lane 1.

### Manager recommendation
Approve the diagnostic-first path and, if the common root is confirmed, **(b) the consolidated fix owned by T3/Lane 2** — this is exactly the root-not-symptom mandate; six per-surface steps would repeat the loop we're closing. Keep steps 15/16 (concrete, in-flight, turn H-R13/H-R14 green) as-is; peer isolation (H-R07) is already a T3 contract row. HR-PARITY#1–#8 are the ratchet. Hold new per-surface steps beyond 16 until the root is confirmed.

## ESC-010 — RESOLVED

**Director ruling:** D-011 (2026-07-14). Diagnostic-first approved; consolidated fix (b) pre-authorized (no round-trip). **+Mandatory step 0 fallback-posture A/B** (b26 = fallback-B; re-run failing HR-PARITY rows with migration switches ON in-panel — vanishing failures = our rollback, future re-migration scope, not defects). **Scope fence:** selection→parent-chrome routing only, T3/Lane 2 owns, Lane 1 engine-side emit as separate gated commit; H-R07/H-R08 stay separate unless proven to collapse with root. Acceptance = HR-PARITY green on real-iframe harness + parity checklist on built product (not dev:live). Steps 15/16 continue; per-surface beyond 16 held until diagnostic returns.

## ESC-008 — RESOLVED

**Director ruling:** D-009 (2026-07-14). Both replay fixes authorized — cadence correctness first (`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE`), mode-play routing second (`__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING`). Fork ruled **(A)**: tick persists, interval bounds step size only, UI shows both. Acceptance = harness green + PO live confirm (Tick+4h → tick animation, 4h step bounds). Lane 3 free to dispatch.

---

## ESC-010 — RESOLVED

**Director ruling:** D-011 (2026-07-14)  
**Outcome:** Diagnostic-first approved (timeboxed, discriminating evidence per row). **Mandatory step 0 inside the diagnostic: fallback-posture A/B** — re-run failing HR-PARITY rows with the retained migration switches ON in the panel; failures that vanish are re-migration scope (our deliberate rollback), not defects. On root confirmation, consolidated fix **(b) pre-authorized** (no second escalation): parent V9 chrome subscribes to panel-B selection via postMessage (I14), owned by T3/Lane 2 with Lane 1 providing the engine emit as a separate gated commit; scope = selection→parent-chrome routing only (no wholesale fallback reversal; H-R07/H-R08 stay on their own tracks). Acceptance = HR-PARITY rows green on the real-iframe harness + PO parity checklist (per D-010). Root refuted → per-surface resumes with evidence re-escalated. Steps 15/16 continue; per-surface beyond 16 held.

---

## ESC-009 — RESOLVED

**Director ruling:** D-010 (2026-07-14). Both requests approved + 1 modification + 2 additions: (1) real built-product acceptance surface for parent↔iframe fixes (build id confirmed inside the panel iframe); (2) T0-step8 durable gate but **not** hard serialization — near-term fixes (step 14) accept via manual real-built path; (3) **new INVARIANTS I14** — postMessage-bridge-only, parent globals forbidden in panel-facing paths; (4) report-labeling correction — mislabeled "DONE (proven)" → **Manager bounces**; (5) T0-step8 raised to Lane 4 top item with hardened exit (real MultichartGrid, real separate-window iframes, build-id assert per panel, one regression scenario per burned fix: gear route / settings flash / marquee-in-panel).

---

## ESC-009 — RESOLVED

**Director ruling:** D-010 (2026-07-14)  
**Outcome:** Both requests approved, one modification. (1) For any parent↔iframe-boundary fix, dev:live green = development evidence only; acceptance = real built product with build id confirmed **inside the panel iframe**. (2) T0-step8 is the durable gate but NOT a hard serialization — near-term iframe fixes may accept via the manual `build:live`+served path (step 14 proceeds as written). New binding mechanism rule: parent↔iframe coordination must use postMessage bridges — parent globals/same-context assumptions forbidden in panel-facing paths (dev:live shares context and structurally cannot represent the boundary). Report-labeling corrected: unrun acceptance path = "NEEDS-LIVE", never "proven"; Manager bounces mislabeled reports. T0-step8 raised to Lane 4's top item; its exit includes real iframes + in-panel build-id assertion + one regression scenario per burned fix (gear, settings-flash, marquee).

---

## ESC-008 — RESOLVED

**Director ruling:** D-009 (2026-07-14)  
**Outcome:** Both fixes authorized (`__TALARIA_FIX_REPLAY_INTERVAL_CADENCE` first — pure correctness; `__TALARIA_FIX_REPLAY_MODE_PLAY_ROUTING` second). Fork ruled **(A)** on P6 grounds (tester's TAL-01582 wording is a complaint that the mode changed): tick persists, interval bounds steps only; UI must reflect both mode and interval. PO live-confirm of (A) is part of (a)'s acceptance — if overruled live, (B) swaps in via the switch, no redesign. Prelude rides (b)'s switch; switch-off cell must render today's behavior. State matrix must cover the multichart `stepTimeframeOverride` consumer.

---

## ESC-011 — OPEN (P0 / high-risk crossroads) — multichart interaction fixes are FALSE-GREEN; acceptance harness gave false positives

**Date:** 2026-07-14 · **Filed by:** Manager · **Severity:** P0 (reverses status of T1/T3 interaction family + systemic acceptance-integrity failure)

### What happened
Two independent signals converged:
1. **PO live test:** gear/settings button no longer opens the settings menu on **Panel A OR Panel B** (Panel A worked before).
2. **Lane 4 honest-probe reconcile (T0 step 11):** Lane 4 fixed the `readParentReactSettings` harness probe, which previously counted the V9 quick-bar shell as "settings open" (false green). With the **honest probe on the true combined build `20260712b88`** (verified to contain routing V3, peer-deselect V1, `deleteSelectedDrawings`, `dismissActiveDrawingTool`, A3, order-entry family 1):
   - **GREEN (genuine):** H-R01 (select→chrome), H-R07 (peer isolation), H-R02, H-R03.
   - **RED (genuine failures):** H-R04, **H-R05 (Esc)**, **H-R06 (Delete)**, **H-R12 (gear→settings)**, **H-R13 (dbl-click→settings)**, **H-R14 (marquee)**, H-R08, H-R09.

### The finding
The "10/10 GREEN" acceptance proofs for **T1 step 15 (H-R13), step 16 (H-R14), step 17 (H-R05/H-R06)** and the settings chain in **T3 step 4 (H-R04)** were **false greens** — they passed against (a) a probe that mistook the quick-bar shell for the settings modal, and (b) **synthetic in-iframe events** (synthetic dblclick / handleKeyDown / ctrl-drag) rather than real user actuation. On the honest harness + real product, these interaction fixes **do not work**. Not the workers' fault — the T0 harness was structurally unable to see the truth; this is precisely the D-010/ESC-009 blind spot, now proven material.

### Impact
- The multichart interaction batch (settings-open, Esc, Delete, marquee) is **NOT shippable**. b88 is confirmed broken (harness + live). Deploy remains frozen.
- T1/T3 interaction status must be marked down materially. Only select→chrome (H-R01) and peer-isolation (H-R07) are genuinely green.
- We still have a **second fidelity gap** below the probe: the harness actuates with synthetic events inside the iframe, not real mouse/keyboard — so even the honest probe may over-pass.

### Manager actions already taken (no ruling needed to proceed)
- Deploy frozen; recommending the **live product stays on fallback-B** (last known-good multichart posture) until the interaction family genuinely passes.
- Did **NOT** accept Lane 4's 8-row baseline as "acceptable" — it is an **honest snapshot of what is broken**, not a green light. The gate "passing" with 6 supposed-fixes in known-failing is not acceptance.
- Lane 1 P0 re-fix dispatched (T1 step 18) against the **honest harness + real product**, covering the gear + dbl-click + re-verifying Esc/Delete/marquee.

### Decisions requested from the Director
1. **Re-verification mandate:** ratify that every multichart interaction row must be re-proven on the **honest probe** AND against **real actuation** (not synthetic in-iframe events) before any "proven" claim — i.e., raise the T0 acceptance bar (harness actuation fidelity), or accept synthetic actuation + mandatory PO live-confirm per row as the bar.
2. **Shipping posture:** confirm the live product stays on **fallback-B** until the interaction family is genuinely green (vs. shipping the partial-green subset H-R01/H-R07 now behind switches).
3. **Root vs per-surface, again:** the settings-open family (H-R04/H-R12/H-R13) all failing together on the real product suggests a single settings-open transport root (gear + dbl-click both fail to open the real modal from a panel). Authorize a **consolidated settings-open-transport fix** (one root) rather than per-row, owned by Lane 1 with Lane 4 providing an honest gear-specific + modal-specific harness assertion. Esc/Delete/marquee re-verified separately.
4. **Harness actuation:** approve a Lane 4 task to add **real-event actuation** (real cross-frame mouse/keyboard, e.g. CDP `Input.dispatch*` at true coordinates into the panel iframe) so the harness stops relying on synthetic dispatch that bypasses the real product path.

### Manager recommendation
Grant (1) honest-probe + real-actuation as the new bar; (2) stay on fallback-B; (3) consolidated settings-open-transport fix (root, not per-row); (4) yes to real-event actuation. Keep H-R01/H-R07 (genuinely green) as the ratchet floor. Treat Lane 4's honest baseline as the new truth and drive the RED rows to green against it.

### ADDENDUM (2026-07-14, after T0 step 12 honesty audit) — worse than first stated
Lane 4's full harness honesty audit (`T0-step12-harness-honesty-audit-report.md`) found the false-green disease is **not confined to the settings probe** — it pervades the multichart suite:
- **Even the "genuinely green" rows are NOT trustworthy:** H-R07 asserts only `!toolbarVisible` (selection can desync while chrome looks cleared); H-R01/H-R02/H-R03 panel-B green via real mouse **+ a `selectDrawing`/`editDrawing` fallback** that bypasses broken iframe hit-test routing; borders asserted via resize-handle counts; H-R04 "dbl-click opens settings" only checks the click dispatched, not that settings opened; host H-S32/H-S33 pass on `toolbarVisible` proxy / fully-synthetic `editDrawing`.
- **Conclusion:** there is currently **NO trustworthy automated coverage of multichart interaction**. The retracted ratchet floor (H-R01/H-R07) does not hold. **PO live-confirm on the real product is presently the only reliable acceptance authority** for multichart.
- **Sequencing consequence:** fixing the product (step 18) against this harness risks another false-green. The measurement must be repaired **before or alongside** the fix. Recommended order: **(A) Lane 4 rebuilds the harness with real cross-frame actuation (CDP `Input.dispatch*` into the panel iframe at true coords) + real-state assertions (message-open + visible modal + `hasStyleSection`; store-level deselect for H-R07), removing all `selectDrawing`/`editDrawing` synthetic fallbacks; THEN (B) Lane 1's settings-open root fix is proven against the rebuilt harness AND PO live-confirm.** Interim acceptance for any multichart fix = **PO live-confirm on real built product** until the harness is honest.
- **File-collision note:** `react-parity-lib.mjs` cannot be edited by Lane 1 (step 18) and Lane 4 (rebuild) simultaneously — they must be sequenced. Manager is holding Lane 4 on a read-only real-actuation implementation spec until this is ruled + the file is free.

### Additional decision requested
5. **Sequencing:** approve "harness-first" (Lane 4 real-actuation rebuild before/with Lane 1's fix), with **PO live-confirm as the interim acceptance authority** for multichart until the harness is honest. If the Director prefers "fix-first with PO live-confirm and harness-rebuild in parallel later," say so and I'll re-sequence.

## ESC-011 — RESOLVED

**Director ruling:** D-012 (2026-07-14) + new invariant **I15**.
**Outcome:** (1) ALL previously "proven" multichart interaction rows retracted (incl. H-R01/H-R07); until the harness is rebuilt honestly, a multichart interaction fix is accepted ONLY by PO live-confirm on the real built product. (2) Live stays **fallback-B**, deploy freeze continues — nothing from this family ships until genuinely green + PO-confirmed. (3) **One consolidated root fix authorized** for the settings-open family (gear + dbl-click + settings row = one broken transport) — *already delivered by T1 step 18, real-mouse + honest probe, PO-confirmed 4/4; needs staging live-confirm.* (4) **Lane 4 rebuilds the harness** with real cross-frame input at true coords + real end-state assertions, removing every synthetic shortcut; broken real routing MUST show red. (5) **Sequencing = harness-first with a twist:** Lane 4 gets *exclusive* ownership of the harness file; Lane 1 works in parallel **diagnostic-first** (trace transport roots on the real product) so fixes are ready when honest measurement exists; if the rebuild drags, a fix may be accepted on PO live-confirm alone but only to a **staging** build. (6) **I15 (standing rule):** no test may assert a proxy for what the user sees — every green names how it actuated + what it measured; synthetic green can never be "proven".

---

## ESC-011 — RESOLVED

**Director ruling:** D-012 (2026-07-14)  
**Outcome:** All five requests granted, one modification. (1) Two-tier re-verification bar: permanent bar = honest probe + **real actuation**; until the harness meets it, synthetic green is development evidence only and **PO live-confirm on the real built product is the sole acceptance authority** for multichart interaction. All previously "proven" rows retracted to UNPROVEN — including H-R01/H-R07 (ratchet floor withdrawn per the step-12 addendum); T1 steps 15/16/17 + T3 step-4 settings chain marked **RETRACTED-FALSE-GREEN**, their registry rows reopened. (2) Live stays on **fallback-B**; deploy freeze continues; no partial-green shipping. (3) **Consolidated settings-open-transport fix authorized** as one root (gear + dbl-click + H-R04), owner Lane 1, one switch, I14 transport; Esc/Delete/marquee re-verified separately. (4) Lane 4 real-event actuation rebuild **approved** (CDP input into the panel iframe at true coords, real-state assertions, all synthetic fallbacks removed; host H-S32/H-S33 get the same honesty pass). (5) Sequencing = **harness-first with a bounded parallel diagnostic**: Lane 4 owns `react-parity-lib.mjs` exclusively until the rebuild lands (Lane 1 forbidden from that file); Lane 1's step 18 re-scoped diagnostic-first (trace the transport root on the real product, no harness-lib edits), may implement the gated fix but no acceptance claim until the rebuilt harness goes RED→GREEN AND PO live-confirms; interim path = PO-live-confirm-only acceptance to a **staging build** if the rebuild is slow. New **INVARIANTS I15**: no proxy assertions, real actuation only; every GREEN claim names probe + actuation method; synthetic green = GREEN-SYNTHETIC, never "proven."
