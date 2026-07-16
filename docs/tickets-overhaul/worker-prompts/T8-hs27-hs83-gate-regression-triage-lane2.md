# T8 — H-S27 / H-S83 manager-gate regression triage (Lane 2, read-only)

Combined build `20260716b10` assembly gate (criterion 5) flagged **H-S27** and **H-S83** as regressions (`npm run gate` exit 1, `v2-b10-gate-manager.txt`). Both were previously **removed from `known-failing.json`** during the hit-coord revalidate (host baseline 33→31) because they passed. They now fail under full-suite load. Determine: **real combined-build regression, or resurfaced full-suite flake?**

## Context (do not assume — verify)
- **H-S83** = finest-TF cadence RED. Known history: its switch-OFF A/B leg goes **vacuous (maxStep=0) under full-suite load** while passing in isolation — flagged a tracked flake in Phase-0 re-gate. Confirm whether this is the same vacuous-A/B flake or a genuine cadence break.
- **H-S27** = (identify the scenario from `scenarios.mjs`); confirm its actuation and whether it depends on session order / prior-scenario state.

## Tasks (READ-ONLY — no product/harness/known-failing edits)
1. **Isolate each** on `20260716b10`: `node run.mjs --only=H-S27 --runs=10` and `--only=H-S83 --runs=10`. Record pass rate + the exact failing sub-check.
2. **Full-suite vs isolated:** re-run within the gate context if needed to reproduce the session-order dependency. Classify each as:
   - **FLAKE** (passes isolated, fails only under full-suite session order / vacuous A/B) → recommend re-baseline (Lane 4 re-adds to known-failing OR marks tracked-flake with reason), OR
   - **REAL-REGRESSION** (fails isolated too) → name the root + owning lane + proposed switch.
3. **I15:** for each, state how it actuated and what it measured (real end-state vs proxy); a vacuous/maxStep=0 A/B leg is NOT a pass and NOT a real fail — call it out explicitly.
4. Confirm neither is caused by the `ecaa8a9c` H-R03 fix or the I13 hygiene commit `817a81a1` (both are drawing/selection + focus paths, not replay/cadence) — quick reasoning is fine.

## Report — WORKER-REPORT-STANDARD.md
`docs/tickets-overhaul/worker-reports/T8-hs27-hs83-triage-report.md` — per-scenario isolated pass rate, flake-vs-real verdict with evidence file names, recommended baseline action for Lane 4, and (if real) root + owning lane + switch. No commits.
