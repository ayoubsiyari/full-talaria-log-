# T0 (Lane 4) — gate:react session-order isolation fix, then bless `20260716b10`

TASK 1/2 done (H-R02 discriminator proven, P1 ledger note). Bless is blocked ONLY on `gate:react`: rows **H-R04, H-R06, H-R09, H-R12** fail on **rotating** runs across 5 retries. Rotating (not the same row every time) = **session-order / state-bleed flake between scenarios**, not a deterministic regression. **Do NOT bless by retrying until a lucky all-green run** (I15 — that is the "flake until green" anti-pattern). Prove + fix, then bless deterministically.

## STEP 1 — Prove they're flakes, not regressions (isolation)
Run each rotating row **isolated ×10** on `20260716b10`:
`node react-run.mjs --only=H-R04 --runs=10` (and H-R06, H-R09, H-R12).
- **All 10/10 PASS isolated** → confirmed session-order flakes → proceed to STEP 2.
- **Any row FAILS isolated (deterministic)** → STOP, report as a real regression with evidence + suspected owning lane. Do not proceed to bless.

## STEP 2 — Root-cause + fix the gate:react session bleed (harness fidelity)
Diagnose why rows rotate under full-suite session order — prior scenario leaves residual state (open settings modal, focused panel, lingering selection, replay running, un-dismissed blockers) that the next scenario inherits. Fix in Lane-4 harness scope (`react-parity-lib.mjs` / `react-parity-scenarios.mjs` / `react-run.mjs`):
- Preferred: **per-scenario state reset or fresh page/context** between `gate:react` scenarios (mirror whatever the isolated path does that the suite path doesn't), so the suite result equals the isolated result.
- Keep the frozen actuation reference (D-021/D-023) intact — do NOT weaken click/actuation fidelity; this is about *resetting between scenarios*, not changing how a scenario acts.
- Both trees (I8). File-scoped.

## STEP 3 — Deterministic clean gate + bless
- Re-run `gate:react` — must exit **clean with 0 regressions on a normal run**, not a retry-selected one. Run it 2–3× to confirm the rotation is gone (stability proof), and record all runs (no cherry-picking a green).
- Confirm manager `npm run gate` still 0 regressions with the updated baseline (H-R07 removed, H-S34 promoted, H-S27/H-S30/H-S50/H-S83 tracked flakes with reasons).
- Re-confirm the 4 discriminators still flip (H-R03 dedupe-off, H-R02 actuation-miss, H-R06 kb-off, H-R07 phase5-off → 10/10 FAIL).
- **Bless `20260716b10`**; report the blessed BUILD_ID for the PO parity checklist.
- Reconcile stale manifest lines: `T3-COMBINED-BUILD-MANIFEST.md` §4 line ~207 and §5 lines ~236/241 still say "blocked/TBD" — update to match actual blessed state ONLY after the clean gate.

## Guardrails
- Lane 4 harness / known-failing / build stamps only. No engine edits. If STEP 1 finds a real regression, STOP + report (do not fix engine here).
- WORKER-REPORT-STANDARD.md.

## Report
`docs/tickets-overhaul/worker-reports/T0-lane4-gatereact-isolation-fix-plus-bless-report.md` — STEP 1 isolated pass rates (all 4 rows), STEP 2 root cause + exact harness fix, STEP 3 multi-run deterministic gate:react evidence + discriminator re-confirm + BLESSED build id (or BLOCKED with evidence). File-scoped commit hash.
