# RE-MIGRATION Phase 0 (Lane 4) — reconcile + FREEZE the authoritative RED matrix (D-018 condition 1)

## Authorization
D-018 approved the re-migration **but requires Phase 0 first**: the plan targets **12** RED reactParity rows; `known-failing.json` currently lists **10** (H-R07, H-R12 were promoted green in a later reconcile). **Phase 1 does NOT dispatch until this is frozen.** We must not re-fix rows that are genuinely green on the current fallback-B posture.

## Tasks
1. **Re-run the full reactParity matrix** (H-R01–H-R14) on built `dist-v9` **fallback-B default posture** (migration switches OFF), build id asserted inside panel-B iframe. Determinism: each row **10/10**.
2. **Reconcile 12 vs 10:** for H-R07 and H-R12 specifically — are they genuinely GREEN on fallback-B, or were they promoted on a synthetic/greenshell path (D-012 retraction risk)? Classify each: `GENUINELY-GREEN-ON-FALLBACK` (drop from re-migration scope) vs `HONEST-RED` (belongs in matrix).
3. **Freeze the authoritative set:** produce the locked list of rows the re-migration must turn green, and map each to its phase (P1–P6) per `T3-REMIGRATION-PLAN.md` §1. If H-R07/H-R12 are genuinely green, note which phases shrink (Phase 2/Phase 5 scope).
4. Wire/confirm the `--migration-on` (per-phase) A/B flag so each phase's D-011 A/B can run.
5. Gate check: **12/12 (or reconciled N/N) RED on fallback-B default; 0 false greens.**

## Guardrails
- Lane 4 sole owner of `known-failing.json` / scenario ids / `react-parity-lib.mjs`.
- Read/measure + baseline-file edits only; no product engine/React edits.
- I8/I9 mirrored; report SHA256 + gate result.

## Report — WORKER-REPORT-STANDARD.md
The frozen authoritative RED matrix (row → honest-RED/genuinely-green → phase), the H-R07/H-R12 verdict with evidence, any phase-scope shrink, and confirmation Phase 1 may dispatch.
