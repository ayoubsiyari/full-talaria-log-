# T8 step 15 (Lane 2) — replay-interaction diagnostic bundle (READ-ONLY, pre-b1)

## Why read-only
b1 (finest-TF cadence) is awaiting PO A/B. Do NOT stack replay implementation on the follow path until PO confirms b1. This step produces **fix PLANs only** for the pending replay-path bugs, so they're ready to execute the moment b1 is accepted.

## Diagnose (no implementation)
1. **H-S30 = FAIL-REAL-BUG** (surfaced when Lane 4 cleared a step-5b false-green). Root it: what does H-S30 actuate/measure, what's the real defect, which replay code path. Propose a fix plan (switch name, files, RED assertion). Tag it in the registry.
2. **TAL-00752 #4 and #5 — replay × drag / keyboard-pan** (cross-track hand-back from Lane 3, order-entry-adjacent but the mechanism is replay-interaction). For each: reproduce path, root hypothesis, and whether it belongs to T8 (replay) or T3 (multichart interaction) or is standalone. Fix plan per row.
3. **Relationship pass:** do H-S25 seam, H-S30, and #4/#5 share the `_panelPlayFollowContinuousOffsetX` / mirror follow path? If several fixes touch the same region, propose the **order** to land them post-b1 so they don't collide (one consolidated follow-path step vs separate).

## Guardrails
- Read-only / diagnostic. No product edits. No `known-failing.json` edits — report to Lane 4.
- If running built dist, confirm build id `20260715b1` in the panel iframe.

## Report — WORKER-REPORT-STANDARD.md
Per-item root + fix plan (switch/files/RED), the shared-region relationship analysis, and a recommended post-b1 landing order.
