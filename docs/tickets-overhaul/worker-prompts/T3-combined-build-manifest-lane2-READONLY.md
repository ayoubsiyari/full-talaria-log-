# Combined-build manifest (Lane 2) — D-018 #4 assembly plan (READ-ONLY)

Phase 2 is gated on Phase-1-GREEN, so while Lane 4 Phase 0 runs, build the **combined-build manifest** — the single artifact we'll assemble at unfreeze. D-018 #4: the unfreeze ships as **ONE combined build** (re-migration + all accumulated staging work); PO parity-checklist sign-off happens on that exact build, nothing appended after.

## Task (read-only — no product/harness edits; this is a doc)
Produce `docs/tickets-overhaul/T3-COMBINED-BUILD-MANIFEST.md` enumerating everything that must fold into the one unfreeze build:

1. **Landed commits to include** — walk `git log` and list every fix commit since the last shipped build that belongs in the unfreeze: snap-back (`9462cef3`), finest-TF cadence (`d6d9822f`, `4bb97a0b`), order-entry (`baf2ab12` + steps 8–10), RC-6 M1/M2/M3/M5, RC-3 anchoring phases, settings/Esc/Delete/Objects-Tree (b105), TF-label (a5), plus the re-migration phase commits (P1–P6, pending). Mark which are landed vs pending.
2. **Kill-switch inventory** — every `__TALARIA_*` switch introduced across all lanes, its default (fix ON/OFF), the file(s) it covers, and the one-knob revert per re-migration phase (D-018 #2). This is the revert map if the combined build regresses.
3. **Staging build lineage** — a1→a5, b1, b2 and what each carried, so we know the final combined build supersedes all of them.
4. **Accumulated staging work checklist** — cadence b1, order-entry, settings/Esc/Delete, TF-label, snap-back b2 — each with its PO live-confirm status (confirmed / pending) so nothing ships unverified.
5. **Open blockers to unfreeze** — what must be GREEN/committed/confirmed before the combined build is cut (re-migration phases complete, PO b1 A/B, any needs-live rows).

## Guardrails
- READ-ONLY. Doc + `git log` inspection only. No product/harness/registry edits, no commits of others' files.

## Report
The manifest doc itself is the deliverable; add a short `WORKER-REPORT-STANDARD.md` summary noting completeness and any commits you couldn't classify. State "manifest is a living doc — update as re-migration phases land."
