# PLACE-01 — evidence-tree gate sweep

**Date:** 2026-07-31  
**Owner:** D sweep note  
**Rule:** executable gates/oracles/controls must live in tracked paths; outputs may live under evidence.

## Clear Gate/Control Scripts Found Under `docs/plan3/evidence`

These are executable controls/gates in ignored evidence paths and therefore should be relocated to tracked paths such as `docs/plan3/oracles/**` and wired through `package.json` if they make `PERM-01` claims.

### Manager E

- `manager-e-indicator-eviction/docs/plan3/evidence/E-LEGACY-PANEL-SHELL-CORRECTNESS-20260731/legacy-panel-shell-correctness.red.mjs`
- `manager-e-indicator-eviction/docs/plan3/evidence/E-FOCUS-DESTROY-CORRECTNESS-20260731/focus-destroy-correctness.red.mjs`
- `manager-e-indicator-eviction/docs/plan3/evidence/E-RELEASE-PARITY-CORRECTNESS-20260731/release-parity-correctness.red.mjs`
- `manager-e-indicator-eviction/docs/plan3/evidence/E-WARMUP-WINDOWS-20260731/pre-session-warmup-buckets.red.mjs`

### B-M4 Evidence Copies

Gate-like test/mutant scripts also appear under B-M4 evidence copies in multiple worktrees:

- `docs/plan3/evidence/B-M4/m4-ledger-invariants.test.mjs`
- `docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.test.mjs`
- `docs/plan3/evidence/B-M4/live-surface-probe/live-surface-probe.mutants.mjs`

Those may be historical evidence copies rather than current permanent gates, but if any are cited as active gates they have the same PLACE-01 issue.

## Not Classified As Gates

Many `run-*.mjs`, `*-probe.mjs`, and `seal-evidence.mjs` files under evidence appear to be one-off evidence drivers or artifact sealers. I did not classify those as PERM-01 gates from filename alone.

## D Status

D's active controls are in tracked/intended gate locations (`scripts/**`, `scripts/tests/**`, `docs/plan3/oracles/**`) and are wired through `package.json`.
