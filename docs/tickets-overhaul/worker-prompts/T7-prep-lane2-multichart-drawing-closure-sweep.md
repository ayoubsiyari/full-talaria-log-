# T7-prep (Lane 2) — multichart + drawing-interaction closure sweep — READ-ONLY

## Cold-start context (read first)
- Repo: `full-talaria-log--main`. Ticket/registry sources: `docs/tickets-overhaul/PER-BUG-REGISTRY.csv`, ticket registry / daily intake under `docs/tickets-overhaul/`, and the accepted worker reports in `docs/tickets-overhaul/worker-reports/`.
- We are in a **deploy freeze** on multichart/shared files. **This task is READ-ONLY** — no product/engine/React/harness edits, no `known-failing.json` edits (Lane 4 owns it).
- Landed multichart/drawing fixes to disposition against (read their reports for the switch + proof + build):
  - T1 step 14 (iframe legacy-toolbar kill), 15 (settings-flash / H-R13), 16 (marquee / H-R14), 17 (Esc H-R05 + Delete H-R06).
  - T3 step 4 (panel-B selection→parent-chrome routing / H-R01, H-R04), step 5 (peer isolation / H-R07 + rows 13-15 / H-S51/52/53).
  - Fallback-B (multichart migration disabled) baseline.

## Deliverable
Write `docs/tickets-overhaul/worker-reports/T7-prep-multichart-closure-sweep-report.md` with a disposition table covering every multichart / drawing-interaction / selection / toolbar / iframe ticket in the registry. For each: **closed-by-landed-fix** (cite switch + step + harness row + build), **needs-live-confirm** (landed, awaiting PO on the canonical build), **still-open** (RC guess + one-line mechanism + owning lane), or **CHANGED**.

Must cover at minimum:
1. The multichart instability-window tickets from `INTAKE-RETEST-2026-07-13.md` (TAL-01569/01570/01568/01584/01578/01579/01587) — which are now covered by steps 14–17 + routing/peer-isolation vs still-open.
2. The RC-1/RC-4 family (tool selection, blue border/marquee, settings flash, gear/toolbar, Esc/Delete, peer deselect, panel focus).
3. Known still-open panel-B reds from T3 step 4/5: **H-R08** (host Ctrl+drag marquee during-drag), and verify **H-R09** status.
4. Any drawing-lifecycle tickets tied to RC-1 that steps 14–17 did NOT address.

## Guardrails
- READ-ONLY. Cite exact ticket ids + the report/switch that closes each row so PO live-confirm is turnkey.
- Do not re-run gates or builds. Disposition is synthesis from accepted reports + registry.
- Flag any ticket that appears to need a NEW fix (still-open) with a proposed owning lane — do NOT fix it.

## Report
Use `WORKER-REPORT-STANDARD.md`; sections 2 (changes) + 3 (kill-switch) = "N/A — diagnostic". Substance = the disposition table + a short "still-open, needs a task" list grouped by mechanism for T7 scheduling.
