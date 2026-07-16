# T2 step 4 (Lane 1) — commit RC-3 phases + begin freeze-safe RC-2 invalidation fixes

## Part A — commit RC-3 (FILE-SCOPED)
Phase 4 + Phase 6 are uncommitted in the shared working tree. Commit **only your own drawing/anchoring paths by explicit path** — never `git add -A`:
- `drawing-tools-base.js`, `drawing-tools-manager.js`, `drawing-tools-fibonacci.js`, `drawing-tools-fib-gann.js`, `drawing-tools-advanced.js`, `drawing-tools-advanced-volume.js` + `homepage/public/...` mirrors of each
- your RC-3 proof test files
Commit message: `T5: RC-3 anchoring phases 1-4,6 (fractional-place + label anchor + volume/clamp/paste, dev-only, NEEDS-LIVE)`. Confirm mirrors SHA-identical; report the hash + `git status`.

## Part B — begin RC-2 invalidation (FREEZE-SAFE subset only)
RC-2/T2 diagnostic (Lane 2 T2 step 3) produced fix plan T2-3a..d for peer/iframe repaint gaps. **Most of that is multichart peer/iframe = FROZEN.** This step takes ONLY the **single-chart / engine-local invalidation** items that don't touch multichart-parent or iframe coordination:
1. Re-read the T2 step 3 diagnostic; list which of T2-3a..d (and TAL-01573 manual-rescale re-render, M3-style settings-bypass-invalidation) are **single-chart engine-local** vs **multichart/iframe (frozen)**. State the split at the top.
2. Fix the freeze-safe engine-local subset. RED-first, own kill-switch covering every file touched incl. any React (I13), honest assertion / switch-OFF RED-again (I15).
3. Explicitly **defer** the multichart/iframe invalidation items into the RC-4 re-migration track — do NOT touch that code.

## Guardrails
- Engine/drawing/render-invalidation files only. Do NOT touch multichart-parent, `chart.js` replay/cadence regions (Lane 2), indicator files (Lane 3), or `known-failing.json` — report row deltas to Lane 4.
- I8/I9 mirrored trees + SHA256.

## Report — WORKER-REPORT-STANDARD.md
Part A commit hash + status; Part B freeze-safe/frozen split, RED→GREEN per fixed item (how actuated / what measured), kill-switch coverage, tickets discharged, deferred-to-re-migration list, Lane-4 deltas.
