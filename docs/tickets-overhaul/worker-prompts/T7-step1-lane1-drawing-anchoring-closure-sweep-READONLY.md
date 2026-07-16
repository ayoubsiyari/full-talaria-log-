# T7 step 1 (Lane 1) — drawing / anchoring / invalidation closure sweep (READ-ONLY)

## Why now
RC-3 anchoring (5/6, Phase 5 parked) and the RC-2 freeze-safe invalidation subset have landed. Interim freeze-safe accounting task while the RC-4 re-migration (ESC-016) awaits Director authorization. **Read-only — no product edits.**

## Tasks
1. Cross-check the drawing-tool, anchoring (RC-3), and single-chart invalidation (RC-2) tickets in `TICKET-REGISTRY.csv` against the landed fixes (Phases 1–4/6 anchoring switches, T2 step 4 freeze-safe items).
2. Produce a **closure table**: ticket → fixed-by (switch/commit) → evidence (test/scenario) → status (`fixed_pending_live` / `needs-live` / `still-open` / `deferred-to-remigration`).
3. Flag any ticket that looks discharged but has **no honest test** backing it (I15 gap) — candidates for a RED scenario request to Lane 4.
4. List the RC-2 items explicitly **deferred to the re-migration** (multichart peer/iframe repaint) so they're tracked, not lost.

## Guardrails
- READ-ONLY. No product / harness / `known-failing.json` edits.
- Registry row *proposals* only — hand text to Lane 4 for the combined registry commit.

## Report — WORKER-REPORT-STANDARD.md
The closure table, the I15-gap flags, and the deferred-to-re-migration list.
