# WORKER PROMPT — T1 step 8 (Lane 1): Ctrl+drag marquee — diagnostic-first, then one gated fix

> Hand to the Lane 1 worker. **Governed by D-007.** Diagnose before fixing. These are ENGINE-owned symptoms (isolated as pre-existing, NOT React), so the fix lands in `chart.js` / engine, gated by a new kill-switch.

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T1 step 8**, Lane 1. RC-1.

## ISOLATION ALREADY DONE (D-007 matrix, PO on `20260712...`/`20260713b1`)
The blue Ctrl+drag marquee border does NOT draw in ANY switch state — tested `__TALARIA_DISABLE_MULTICHART_OWNERSHIP_V2`, `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` individually AND all-three-off. So it is **pre-existing engine breakage, not a T1 step 4–7 regression**. Registry: `PLAN2-FOUND#1`, `PLAN2-FOUND#2`.

## SYMPTOMS (main chart AND panels)
- **S1 — blue marquee border never draws** on Ctrl+drag over empty chart space (should draw a blue rubber-band and multi-select enclosed tools).
- **S2 — Ctrl+drag on/near a tool is intermittent:** sometimes selects/marquees, sometimes the **shape jumps** (drag is being interpreted as a move instead of a marquee).

## POINTERS (from D-007; verify, don't assume)
- Marquee draw: `chart.js` `drawCtrlMarqueeSelect` (~:18645).
- Marquee start predicate (~:31174) depends on `_isCursorSelectMode()`, `currentTool`, hit-tests.
- Legacy click-handler short-circuits under `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` (`chart.js:32588`, `:32815`).

## PART 1 — DIAGNOSTIC (mandatory first; timebox one session)
1. Determine why the marquee border never draws (S1): is the start predicate never true (e.g. `_isCursorSelectMode()` gating), or does it start but not paint (invalidation)? Name file:line.
2. Determine the S2 mechanism: what decides "start marquee" vs "grab & move the tool" on Ctrl+drag, and why it flips intermittently (hit-test tolerance? order of predicate checks? missing Ctrl-state read?). Name file:line.
3. State whether S1 and S2 are **one mechanism or two**. Per I3/D-007, each proven mechanism = its own gated fix.

## PART 2 — FIX (only after Part 1)
- One gated fix per proven mechanism, new kill-switch(es) (e.g. `__TALARIA_DISABLE_CTRL_MARQUEE_FIX`), default ON.
- **I5 state matrix:** main chart + panel; must not change plain-drag (move) behavior or single-click select.
- RED-first in the REAL product (per D-006/I13); GREEN after; switch OFF reverts.

## ALSO VERIFY (PO spec, do NOT change unless broken)
Per the PO's stated spec (D-007 req 2, TradingView-style): **single-click = select + show quick menu (floating toolbar); double-click = open settings; Esc = deselect + close.** Confirm single-click shows the quick menu on main chart AND panel. If it does, that chain is spec-correct — leave it. If single-click does NOT show the quick menu, report it as a distinct mechanism (do not bundle into the marquee fix).

## BINDING CONSTRAINTS
- RC-1 only. I11: no mirror-frame work. L2: production trees only.
- **I13:** every touched file behind the switch; ungatable edits called out + real-product verified.
- Both engine trees byte-identical; SHA256 both sides. Do NOT clobber Lane 2 suppression or step-7 React gating.
- **Do NOT bump build id** — report the diff; Manager coordinates.
- Existing harness gate (H-S32–37/43/44 green; H-S38–42 tracked-red) stays intact (I9).

## MANDATORY ACCEPTANCE
Run `docs/tickets-overhaul/MULTICHART-PARITY-CHECKLIST.md` rows 8 (Ctrl+drag marquee) and 9 (single→double click chain) on **main chart AND a panel**. Harness alone ≠ acceptance.

## DELIVER (report `.md`: `worker-reports/T1-step8-ctrl-drag-marquee-report.md`)
1. Part 1 diagnostic: S1 + S2 mechanisms, file:line, one-or-two verdict.
2. Fix diff + kill-switch(es) + RED/GREEN/RED real-product proof.
3. Single-click quick-menu verification result (spec-correct or distinct bug).
4. I5 state matrix; parity rows 8–9 results; harness gate intact; SHA256 both trees; `node --check` clean; build-id diff for Manager.
