# T4 step 11 → T6 step 1 (Lane 3) — commit order-entry (file-scoped) + open RC-6 indicator-lifecycle diagnostic

## Part A — commit the order-entry work (FILE-SCOPED, do NOT sweep other lanes)
Order-entry has uncommitted working-tree changes (family 2 #8/#19 + step 10 six fixes). **Other lanes have uncommitted changes in the SAME working tree** (Lane 1 anchoring, Lane 2 replay-cadence). So commit **only your own files by explicit path** — never `git add -A` / `git add .`:

- `chart v 1.4/chart/modules/order-manager.js`
- `chart v 1.4/chart/modules/order-entry-aggregates.mjs`
- both `homepage/public/chart/...` mirrors of the above
- your order-entry test files (`order-entry-parse-drag-input.test.mjs`, `order-entry-remaining-open-8.test.mjs`)
- your PER-BUG-REGISTRY.csv rows **only if** no other lane's rows are mixed in the same hunk (if mixed, leave it and report so I coordinate)

Commit message: `T4: order-entry families #8/#19 + remaining-open-8 fixes (RC-5, dev-only, NEEDS-LIVE)`. Confirm mirrors SHA-identical. Report the commit hash + `git status` after.

## Part B — hand-back note (no action, just confirm)
`#4, #5` (replay × drag / keyboard-pan) are cross-track (replay-interaction, not RC-5). I'm routing them to T8/T3 — do NOT fix them here.

## Part C — RC-6 indicator-lifecycle diagnostic (READ-ONLY)
T6 (RC-6) is the last unstarted root cause. Produce a diagnostic (no fixes):
1. Enumerate the indicator lifecycle tickets in `TICKET-REGISTRY.csv` (add/remove/re-add, settings, duplication, stale-after-symbol-change, replay interaction).
2. Trace the indicator add/update/remove/rehydrate code paths (which module owns lifecycle; how it compares to the tool-lifecycle controller pattern from T1).
3. Name the RC-6 mechanism(s) and propose a phased fix plan (like the T5 6-phase plan): each phase = switch name, files, RED assertion, tickets discharged.

## Guardrails
- Indicator + order-entry files only. Do NOT touch multichart-parent, harness `known-failing.json`, or Lane 1/Lane 2 regions.
- Diagnostic = read-only; no product edits in Part C.

## Report — WORKER-REPORT-STANDARD.md
Part A commit hash + status; Part C ticket list, mechanism(s), and the phased RC-6 plan.
