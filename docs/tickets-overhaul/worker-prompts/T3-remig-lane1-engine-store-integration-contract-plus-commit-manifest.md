# RE-MIGRATION (Lane 1) — engine-store integration contract + Phase-1 commit manifest (READ-ONLY)

All three of your re-migration phases are banked (P1 landed; P4 + P6 prepped). While Lane 4 fixes the harness hit-coord (the Phase-1 green gate) and Lane 2 runs P2/P3, do this **read-only** de-risking task. No product/React/harness edits.

## Part A — Engine-store integration contract
Confirm the Phase-1 selection substrate is the **single source of truth** that the later phases consume, so P4/P6 land without integration surprises.

1. Document the exact store surface Phase-1 populates: `selectedDrawings` / ToolLifecycleStore emit shape (add/remove/clear events, id list).
2. Trace that **P4 Esc/Delete** reads/mutates the **same** store (deselect → store clear; Delete → store remove + render delta) — no divergent secondary selection state.
3. Trace that **P6 marquee** `completeCtrlMarqueeFromChart → selectDrawing(d, true)` writes to the **same** store for multi-select (both ids present).
4. Flag any place where a phase would read a **stale/parallel** selection flag (e.g. `d.selected` boolean vs store) that could desync — these are the integration risks to guard at impl.
5. Confirm host-A vs panel-B use the same predicate/store path (no host-only divergence).

## Part B — Phase-1 commit manifest (ready-to-fire)
Prepare the exact file-scoped commit so it executes the instant Lane 4 confirms Phase-1 honest 10/10:
1. List the 6 engine file paths (both trees) + `t3-remig-phase1-engine-proof.mjs` to `git add` (explicit paths, never `-A`).
2. Specify the build-id bump locations (embed/dist/sw/live/harness) and the next build id to cut.
3. Note the I8/I9 mirror-verify step + the SHA256s to re-confirm pre-commit.
4. State the gating condition explicitly: **do not commit until Lane 4 reports H-R02/H-R03 honest 10/10 + A/B on the re-validated matrix.**

## Guardrails
- READ-ONLY. No product/harness/`known-failing.json`/registry edits, no git commit.
- Do not touch order-entry, replay-system, or other lanes' files.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T3-remig-lane1-integration-contract-plus-commit-manifest-report.md` — the store integration contract (with any desync risks flagged), and the ready-to-fire Phase-1 commit + build-bump manifest with its gating condition.
