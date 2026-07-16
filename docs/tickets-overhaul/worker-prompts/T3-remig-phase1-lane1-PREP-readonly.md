# RE-MIGRATION Phase 1 PREP (Lane 1) — engine selection substrate design (READ-ONLY until Phase 0 freezes)

## Why read-only right now
D-018 requires **Lane 4 Phase 0 to freeze the authoritative RED matrix before Phase 1 implementation dispatches**. Also the D-017 snap-back fix (Lane 2) must land on `chart.js` first so the file is clean. So this step is **read-only design prep** — you implement in the next step once I give the go (Phase 0 frozen + snap-back committed).

## Context (Phase 1 = Group A, engine selection substrate)
Discharges H-R02, H-R03; unblocks H-R01. Mechanism: re-enable **tool lifecycle V2** + **legacy selection retire V2** in multichart **iframe** embeds (single-chart stays ON per fallback-B matrix).

## Tasks (design only, no product edits)
1. Pinpoint the exact predicates/paths that must flip in **iframe context only**: `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2`, `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2` — where they're read, how to scope "iframe embed" vs single-chart so single-chart behavior is untouched.
2. Design the **one-knob master slice switch** `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` (D-018 condition 2: mandatory) wrapping both predicates — one revert knob for the whole phase, covering every file incl. React (I13).
3. Name the honest RED→GREEN target: H-R02, H-R03 **10/10** on built dist; H-R01 store-leg green (V9 may stay RED until Phase 2). Specify what the harness must actuate/measure (coordinate scenario needs with Lane 4).
4. `chart.js` / `drawing-tools-manager.js` / `tool-lifecycle-store.js` **line-region map** you will touch — so it serializes cleanly after Lane 2's snap-back commit.

## Guardrails
- READ-ONLY this step. No product/harness edits.
- Do NOT touch single-chart selection behavior; iframe-scope only.

## Report — WORKER-REPORT-STANDARD.md
The predicate/path map, master-slice-switch design, the honest RED→GREEN spec, and the chart.js line-region plan. State "ready to implement on Phase-0-frozen + snapback-committed go."
