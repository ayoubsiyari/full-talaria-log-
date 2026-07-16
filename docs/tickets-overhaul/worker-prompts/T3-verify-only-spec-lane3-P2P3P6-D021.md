# T3 (Lane 3) — verify-only pass SPEC for P2/P3/P6 on combined build (READ-ONLY, anti-idle)

D-021 converted Phases 2/3/6 to **verify-only** (no new code/switches; a verify-fail re-escalates with evidence). While Lane 1 (H-R06) and Lane 2 (H-R07) implement, define the verify-pass spec so the combined build can be checked immediately when it cuts. **Read-only — no product/harness/registry edits.**

## Deliverable
`docs/tickets-overhaul/T3-VERIFY-ONLY-PASS-SPEC.md` — for each verify-only row, specify the exact honest assertion on the **combined build** (build-id asserted inside panel B):

| Phase | Rows | Verify assertion (I15 end-state, not proxy) |
|-------|------|---------------------------------------------|
| P2 | H-R01 (V9 bar leg) | real click selects + V9 bar reflects selection, host + panel B |
| P3 | H-R04, H-R13 | real dbl-click → parent settings modal open (`hasStyleSection=true`), host + panel B |
| P6 | H-R08, H-R14 | real marquee / Ctrl+drag → store multi-select populated |
| P4-Esc | H-R05, H-R09-Esc | real Esc → deselect + parent settings closed (now verify-only, was P4 fix) |

For each: the harness helper that actuates it, the end-state it measures, the 10/10 determinism note, and what a **failure** would look like (so it re-escalates cleanly per D-021 ruling 2).

## Also
- Cross-check these rows against the **D-021 unfreeze gate criteria** (all 12 rows green on combined build) so no verify-only row silently drops.
- Note any row whose green depends on a specific accumulated-staging fix being folded into the combined build.

## Guardrails
Read-only. No `react-parity-lib.mjs` (Lane 4), no product, no registry writes. Pure spec doc.

## Report
`docs/tickets-overhaul/worker-reports/T3-verify-only-spec-report.md`.
