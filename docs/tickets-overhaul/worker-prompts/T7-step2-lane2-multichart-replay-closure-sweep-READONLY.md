# T7 step 2 (Lane 2) — multichart + replay closure sweep (READ-ONLY)

## Why now
Re-migration plan delivered (awaiting Director auth via ESC-016); replay implementation held until PO b1 A/B. Interim freeze-safe accounting task. **Read-only — no product edits.**

## Tasks
1. Cross-check the **replay (RC-8)** and **multichart interaction (RC-4)** tickets in `TICKET-REGISTRY.csv` against landed/queued fixes: TAL-01590 freeze (a4 PO-confirmed), edge-park unified (a4), refresh-persistence #5 (a4), TF-label #6 (a5 PO-confirmed), cadence b1 (awaiting A/B), plus the queued post-b1 items (H-S25 seam, #4/#5, H-S30).
2. Produce a **closure table**: ticket → fixed-by → evidence → status (`fixed_pending_live` / `PO-confirmed` / `needs-live` / `queued-post-b1` / `still-open` / `deferred-to-remigration`).
3. Map the RC-4 interaction tickets to the re-migration **phase** (P1–P6) that will discharge them, so post-authorization the ticket→phase linkage is ready.
4. Flag any replay/multichart ticket with **no honest test** backing a green claim (I15 gap).

## Guardrails
- READ-ONLY. No product / harness / `known-failing.json` edits.
- Registry row *proposals* only — hand text to Lane 4 for the combined registry commit.

## Report — WORKER-REPORT-STANDARD.md
The closure table, ticket→re-migration-phase map, and I15-gap flags.
