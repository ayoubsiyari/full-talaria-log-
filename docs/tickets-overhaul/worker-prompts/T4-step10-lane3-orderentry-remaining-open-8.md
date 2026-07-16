# T4 step 10 (Lane 3) — order-entry: the 8 still-open rows (triage + fix tractable)

## Context (RC-5)
T7 closure sweep (T4 step 9) left **8 still-open** order-entry rows:
`TAL-00752 #1, #4, #5, #9, #11, #13, #14, #15`. Order-entry files only — freeze-safe.

## Step 0
Confirm family 2 (#8/#19) is committed with mirrors SHA-identical; state the commit at the top.

## Tasks
1. **Triage the 8** into: (a) **fixable-now** with the pure-function order-entry model, (b) **needs-diagnostic** (unclear root), (c) **not-RC-5** (belongs to another track — e.g. #9 preview-placement may be a render/anchor issue). One line per row: symptom → root hypothesis → bucket.
2. **Fix bucket (a) rows** — RED-first property test per fix, each behind its own kill-switch (I13), real assertion / switch-OFF RED-again (I15). Group related rows under one switch where they share a root (like #8/#19 did).
3. For bucket (b)/(c), write the hypothesis + where it likely lives; do NOT fix cross-track code — hand back to me for routing.
4. Update `PER-BUG-REGISTRY.csv` for anything moved to fixed_pending_live.

## Guardrails
- Order-entry files only (`order-manager.js`, `order-entry-aggregates.mjs`, related). Do NOT touch harness / `known-failing.json` / multichart / React — report row deltas to Lane 4.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
The 8-row triage table, RED→GREEN proof for each fixed row (how actuated / what measured), the bucket (b)/(c) hand-backs, and registry deltas.
