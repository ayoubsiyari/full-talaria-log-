# WORKER PROMPT — T4 step 5 (Lane 3): order-type auto-reclassification (correct semantics)

> Hand to the Lane 3 (order-entry) worker. **Director ruling D-005 authorizes this.** This reinstates order-type reclassification that T4 step 1 wrongly froze — as its own gated fix, decoupled from steps 1 & 2 (which stay).

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T4 step 5**, Lane 3.

## BACKGROUND (why this reverses part of step 1)
T4 step 1 *froze* order type on drag to "fix" TAL-00752. That mis-read the ticket. **TAL-00752 message #17:** *"…it remains called a market order, even if it was a limit order"* — the tester's bug was the **label failing to update**, not the type changing. Correct behavior = the type/label must reclassify to match price vs market.

## READ FIRST (binding)
- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — **D-005** (your authorization + exact semantics)
- `docs/tickets-overhaul/INVARIANTS.md` — binding; note **I12** (one unit per threshold) and **P6** (quote source ticket per product-behavior invariant)
- `docs/tickets-overhaul/worker-reports/T4-lane3-order-entry-model-report.md` — §1 rows 8/9 (drag handlers, `order-manager.js:18789–18837`, `18920–18944`); invariant #3
- `ROOT-CAUSES.md` (RC-5), `TRACKS.md` (T4), `PER-BUG-REGISTRY.csv` (TAL-00752)

## TASK — one gated fix
Reinstate order-type auto-reclassification with correct semantics, behind its own kill-switch.

- **Kill-switch:** `window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` (default unset = fix ON). **Decoupled** from `__TALARIA_DISABLE_ORDER_AGGREGATES_V2` (step 1) and `__TALARIA_DISABLE_SLTP_*` (step 2) — those stay as-is.
- **Semantics (D-005):**
  - Buy **below** market → **Buy Limit**; Buy **above** market → **Buy Stop**; **at** market → **Market**.
  - "At market" = within a **tick tolerance you must name with exactly one unit** (per I12) — state it explicitly in the report (e.g. `N` price ticks or `N` device pixels — pick one unit and justify).
  - Mirror for **Sell** (above → Sell Limit, below → Sell Stop, at → Market).
  - **Each multi-entry leg classifies independently** by its own price.
- Both the internal order type **and the on-screen label** must update on move (the label bug from #17).

## INVARIANT #3 — REVISE (D-005)
Replace old invariant #3 ("order type never mutates on move") with:
> **"On move, order type always equals the correct classification for its price relative to market, per side."**

Replace the old invariant's tests (do not merely delete). **RED-first property tests** covering: both sides × all three zones × **zone-crossing drags** × **independent multi-entry legs**.

## BINDING CONSTRAINTS
- **RC-5 only.** Do NOT touch step-1 aggregate math or step-2 display/parse helpers except to read.
- **I8:** both `order-manager.js` trees byte-identical (SHA256 both).
- **P6:** the report's invariant statement must quote TAL-00752 #17 as evidence.
- **Build id:** do NOT run `bump-dist-v9-cache.mjs` yourself — report your diff, Manager coordinates the bump (D-003 lineage).
- **I9:** multichart gate stays green.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T4-step5-order-type-reclassify-report.md`)
1. Mechanism + file:line (reclassification decision point on move, both single + multi-leg); named tick tolerance with its one unit.
2. RED→GREEN→RED-again evidence for the revised property suite; kill-switch name.
3. Revised invariant #3 statement **with the TAL-00752 #17 quote** (P6).
4. State matrix (I5).
5. SHA256 both trees; `node --check` clean; build-id diff left for Manager.
6. TAL-00752 registry row updated, citing D-005.
7. **PO live spot-check instructions:** drag one buy entry through all three zones; label transitions Limit → Market → Stop.

## STOP CONDITIONS
Reclassification can't be decoupled from the step-1 aggregate switch, or the mechanism touches the replay bus/mirror frame → report, do not improvise.
