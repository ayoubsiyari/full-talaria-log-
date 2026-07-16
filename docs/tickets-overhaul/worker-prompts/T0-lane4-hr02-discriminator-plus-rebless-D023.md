# T0 (Lane 4) — H-R02 discriminator (D-023) + re-bless combined build `20260716b10`

D-023 ruling on ESC-020: dedupe A/B is now H-R03's discriminator of record; **H-R02 needs its own re-derived discriminator before the build can be blessed** (it currently has no proof the harness can detect its failure — its D-021 anchor, the Phase-1 A/B, is retired for it). This is the only new work; the rest is re-bless once triage clears.

## TASK 1 — Derive an H-R02 discriminator (small, this is the D-023 addition)
H-R02 = (confirm the row's mechanism from `react-parity-scenarios.mjs`; it's the single-select / selection-routing row that was anchored on Phase-1).
- Find a **named one-knob** that provably flips H-R02 **10/10 FAIL** — a real switch-off or targeted mechanism disable that breaks the exact behavior H-R02 asserts (single-select store commit / selection routing). Prefer an existing engine switch that owns that path; only if none exists, coordinate the smallest honest harness disable (I15 — must break the real end-state, not a proxy).
- Prove it: `--only=H-R02 --runs=10` → 10/10 PASS (default); with the discriminator off → **10/10 FAIL-REAL-BUG**.
- Record the discriminator name in the frozen HARNESS-REFERENCE + the manifest kill-switch map, so H-R02 is a trusted row with a named discriminator (D-023 standing rule).

## TASK 2 — P1 ledger note (honest bookkeeping, D-023)
In the manifest / HARNESS-REFERENCE, add a note: **P1 engine substrate (`6dc552a8`) stays committed + gated as defense-in-depth; its load-bearing role for H-R02/H-R03 is now UNPROVEN after `ecaa8a9c`. Retiring it as dead code requires a fresh escalation with evidence — not a cleanup commit.**

## TASK 3 — Re-bless gate — ✅ TRIAGE VERDICT IN, RELEASED (do TASK 1 first)
Lane 2 triage (`T8-hs27-hs83-triage-report.md`) verdict: **both H-S27 and H-S83 are FLAKES, NOT b10 regressions** (disjoint from `ecaa8a9c`/`817a81a1`). Re-add both to `known-failing.json` (both trees) as tracked flakes with these exact reasons:
- **H-S27:** `tracked flake — synthetic replayFrame seek-loop race; replayTs stalls ~50% even isolated (5/10) while followRenders still grow; NOT a b10 regression; synthetic actuation unreliable.`
- **H-S83:** `tracked flake — core cadence legs fail only under full-suite session-order (maxStep spike); isolated 10/10 PASS on b10; switch-OFF A/B non-vacuous this cycle; NOT a b10 regression.`
- **H-S27 honesty follow-up (record, do NOT block bless):** H-S27's RED is caused by its own synthetic seek loop, not the product. Per I15 it is **not a trusted row** until re-actuated production-faithfully (or given per-scenario fresh-boot). Note this in the ledger as a post-bless T8/Lane-2 follow-up; it does NOT count as fixed or as a real fail in fix-rate stats.
- Re-run: H-R03 dedupe A/B, H-R02 new discriminator, H-R06 kb-off, H-R07 phase5-off — all honest FAIL-on-switch-off; all 10/10 PASS default.
- Full `npm run gate` → **0 regressions** with updated baseline; `gate:react` clean.
- **One more clean 10/10 on the bless candidate** (D-023). If the ~1/10 host-side flake recurs, it gets **its own tracked row** — no "flake" hand-wave labels.
- Remove **H-R07** from `known-failing.json`; promote **H-S34**.
- **Bless `20260716b10`** (or successor if a re-cut is needed) → report the blessed BUILD_ID for the PO parity-checklist.

## Guardrails
- Lane 4 owns harness / `known-failing.json` / build stamps. No engine edits (if H-R02 needs an engine switch that doesn't exist, STOP and report — do not add engine code).
- File-scoped commits. I8 both trees. WORKER-REPORT-STANDARD.md.

## Report
`docs/tickets-overhaul/worker-reports/T0-lane4-hr02-discriminator-plus-rebless-report.md` — H-R02 discriminator name + A/B evidence, P1 ledger note location, and (when TASK 3 fires) bless verdict + build id or BLOCKED with evidence.
