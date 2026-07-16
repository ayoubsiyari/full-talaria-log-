# T4 step 9 (Lane 3) — finish order-entry families + T7 order-entry/replay closure sweep

## Context (RC-5 = order-entry state model)
T4 step 8: family 1 (close / hit-target #10/#20/#22) DONE. Family 2 (#8/#19) was in flight. Order-entry files only (`order-manager.js`, `order-entry-aggregates.mjs`) — disjoint from multichart, fully freeze-safe.

## Step 0 — surface prior work (mandatory)
Report family 2 (#8/#19) state: committed? greens? If in flight, land + prove FIRST before the sweep. Do not discard.

## Tasks
1. **Finish family 2 (#8, #19)** to green with the pure-function order-entry model (RC-5). RED-first, kill-switch per I13, real assertions per I15.
2. **T7 closure sweep (read-only) for order-entry + replay-order tickets:** cross-check the still-open order-entry rows in `TICKET-REGISTRY.csv` against the landed T4 fixes. Produce a closure candidate list (ticket → fixed-by → evidence) and a residual list (still-open, why).
3. Add/refresh PER-BUG-REGISTRY rows for any newly-closed or newly-found order-entry defects.

## Guardrails
- Order-entry files only. Do NOT touch multichart, React, replay-cadence, or harness `known-failing.json` (report row deltas to Lane 4).
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Family-2 RED→GREEN proof, the T7 closure-candidate + residual tables, and any registry deltas.
