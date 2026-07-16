# T6 step 7 (Lane 3) — Part A: commit M5 (file-scoped) · Part B: RC-5/RC-6 closure sweep (READ-ONLY)

M4 implement stays gated (needs D-017 snap-back committed + `replay-system.js` stable + b1/cadence clear). So this step commits your accepted M5 work and then keeps you on freeze-safe read-only closure work.

## Part A — commit M5 (Phase 5 persist race), file-scoped ONLY
M5 was accepted but is uncommitted in the working tree. Commit **only your own paths** (NEVER `git add -A`):

- `chart v 1.4/chart/modules/indicator-persist-rehydrate.js` + homepage mirror
- `chart v 1.4/chart/modules/indicator-persist-rehydrate.test.mjs` + homepage mirror
- `chart v 1.4/chart/modules/chart-indicators-full.js` + homepage mirror
- The loader/`serve.mjs`/`build-chart-client-bundle.mjs` lines **you** touched for the new module (both trees)
- The two diagnostic reports (`T6-step5-*`, `T6-step6-*`)

**Do NOT** touch or stage: `chart.js`, `replay-system.js`, `panel-cmd-bridge.js`, order-entry files, `known-failing.json`, `scenarios.mjs`, `PER-BUG-REGISTRY.csv`, or anything from Lanes 1/2/4. Report the commit hash + the exact path list. Re-confirm I8 SHA256 mirror match post-commit.

## Part B — RC-5 / RC-6 closure sweep (READ-ONLY)
Produce the verification map we'll need at the **combined-build** unfreeze (D-018 #4). Read-only — no product/harness/registry edits.

1. **RC-6 (indicator lifecycle):** table every mechanism M1–M6 → landed switch → tickets discharged → status (landed / NEEDS-LIVE / M4-gated / M6-parked). Name each ticket's live-check.
2. **RC-5 (order-entry):** confirm current disposition of every RC-5 row (fixed_pending_live / needs-live-confirm / still-open) from the registry as-committed; flag the **#4/#5 replay×drag/keyboard-pan** cross-track pair as held for post-b1 order-manager slot.
3. **Live-confirm checklist:** the exact per-ticket click/observe steps a PO would run on the combined build for all RC-5 + RC-6 fixed_pending_live rows.
4. Flag any row whose "fixed" claim rests on synthetic/proxy actuation (I15) so it gets a real live-check, not a proxy green.

## Report — WORKER-REPORT-STANDARD.md
Deliverable: `docs/tickets-overhaul/worker-reports/T6-step7-rc5-rc6-closure-sweep-report.md` — Part A commit hash + paths, Part B the two mechanism/row tables + the live-confirm checklist + any I15 flags. No implementation.
