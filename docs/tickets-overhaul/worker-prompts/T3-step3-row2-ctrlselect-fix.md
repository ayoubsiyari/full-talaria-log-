# WORKER PROMPT — T3 step 3 Row 2 (Lane 2): Ctrl-select double-toggle fix

> Hand to the Lane 2 (panel) worker. **Director ruling D-004 authorizes this specific fix** on the mechanism your step-2 probe implicated. Row 11 is NOT in scope (held for PO live evidence).

## ROLE
Worker on Talaria **tickets-overhaul (Plan 2)**, task **T3 step 3 (Row 2 only)**, Lane 2. Your step-2 probe ruled out both D-002 candidates and implicated a third: local **Ctrl-click double-toggle**.

## READ FIRST (binding)
- `docs/tickets-overhaul/DIRECTOR-DECISIONS.md` — **D-002 and D-004** (mechanism ruling + constraints)
- `docs/tickets-overhaul/worker-reports/T3-step2-row2-row11-isolation-report.md` — the RED + `c-local-double-toggle` evidence
- `docs/tickets-overhaul/T3-INTERACTION-PARITY-CONTRACT.md` — Row 2 (panel-local selection ownership)
- `docs/tickets-overhaul/ROOT-CAUSES.md` (RC-4), `INVARIANTS.md` (binding)

## MECHANISM (confirmed)
In panel B, one Ctrl-click invokes `selectDrawing` twice for the **same** drawing within one interaction: first call selects it (`selectedIds: [id]`), immediate second call sees it already selected with `addToSelection: true` and toggles it back out (`selectedIds: []`).

## TASK — one gated fix at the panel-local selection dispatch
Make the Ctrl-click path take **one select-vs-toggle decision per pointer interaction** — a single drawing hit must not be both selected and toggled-out in the same click. Fix at the **panel-local selection dispatch site** (the row-2 panel-local owner), not by adding a host guard.

- **Kill-switch:** `window.__TALARIA_DISABLE_CTRLSELECT_FIX` (default unset = fix ON).

## BINDING CONSTRAINTS (D-004)
- **Host-chart Ctrl-click cell stays explicitly UNTOUCHED** — represent it as an unchanged cell in the state matrix and prove it (host Ctrl-select behavior identical before/after).
- **Promote the step-2 probe RED into the gate** alongside the fix (register the scenario in `known-failing.json` → flips to expected-pass). It must be RED before the fix, GREEN after, RED again with the kill-switch.
- **Row 11 is out of scope.** Do not touch pan-bounds geometry.
- Ownership rule (D-002): the fix **changes ownership/decision to match the contract**; it does not add a guard to preserve today's behavior. I11: no mirror-frame work. L2: production `multichart-prod/` only.
- Both engine trees byte-identical; build id bump from `20260712b1` via `bump-dist-v9-cache.mjs`.

## DELIVER (report as `.md`: `docs/tickets-overhaul/worker-reports/T3-step3-row2-ctrlselect-fix-report.md`)
1. Fix mechanism + file:line, diff summary, kill-switch name.
2. RED→GREEN→RED-again evidence; the promoted gate scenario id.
3. State matrix: panel Ctrl-select (fixed) vs host Ctrl-select (unchanged, proven), single + multi-select cases.
4. Full gate output — no regressions, existing scenarios still GREEN (I9).
5. SHA256 both trees; build id + `node --check` clean.
6. TAL-01498 registry row dispositioned.

## STOP CONDITIONS
Fix can't be isolated to panel-local dispatch without touching host Ctrl-click, or mechanism turns out to also involve inbound decoration/focus-cleanup after all → report, do not improvise.
