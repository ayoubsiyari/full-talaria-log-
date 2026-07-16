# RE-MIGRATION Phase 1 — STEP 0 (Lane 1): fix H-S18 redraw loop FIRST, then implement Phase 1

Phase 0 is satisfied (10-row authoritative RED set frozen; chart.js clean from Lane 2's snap-back commit). **But do NOT implement the Phase 1 predicate flip yet** — first stabilize the gate. The re-migration requires a trustworthy manager gate to prove "0 regressions" per phase (D-018 #1), and it's currently poisoned.

## STEP 0 (BLOCKING) — fix H-S18 `Maximum call stack size exceeded`
Lane 4's step-17 manager gate FAILED: **`drawing-tools-manager.js` throws `Maximum call stack size exceeded` (infinite redraw/recursion loop) on H-S18**, poisoning the shared browser session and faking ~40 cascade regressions. It was **clean at step 16, broken at step 17** → a recent commit regressed it (RC-3 anchoring region — fractional-place Phase 4 / label-anchor Phase 6 — is the prime suspect; your file).

1. **Diagnose** the recursion cycle in `drawing-tools-manager.js` (both trees). Likely a render → resolve-anchor → re-render feedback introduced by a recent RC-3 change (e.g. `getDataPoint` / `resolveLabelAnchorPoints` / magnet path re-triggering redraw).
2. **Fix it** — break the recursion (guard/one-shot/coalesce), preserving the RC-3 fix behavior. If the fix must gate, use the existing RC-3 switch that introduced it; do not add a broad new one unless necessary (state which).
3. **Prove:** H-S18 runs without stack overflow; **manager gate no longer cascades** — coordinate with Lane 4 to re-run the full gate and confirm the ~40 false regressions clear and H-S40/41 pass in-session (not just isolated).
4. Register H-S18 as a regression row (RC-3-adjacent) with the commit that introduced it, if identifiable.
5. Commit **file-scoped** (`drawing-tools-manager.js` + homepage mirror, + any RC-3 file the recursion spans). Report the hash + I8 SHA256 match.

**If the recursion is deep/structural, STOP after Step 0 and report** — do not start Phase 1 on an unproven fix.

## STEP 1 — Phase 1 implementation (engine selection substrate) — only after Step 0 gate is clean
Per your accepted PREP (`T3-remig-phase1-lane1-PREP-report.md`):
- Master slice switch `__TALARIA_DISABLE_MC_REMIGRATION_PHASE1_ENGINE` (D-018 #2, required) wrapping the iframe-only flip of `__TALARIA_DISABLE_TOOL_LIFECYCLE_V2` + `__TALARIA_DISABLE_LEGACY_SELECTION_RETIRE_V2`.
- Touch zones: `tool-lifecycle-store.js` 21–27, `drawing-tools-manager.js` 3575–3580, `chart.js` 2349–2357 (disjoint from Lane 2's snap-back 2456–2526 / 17296–17357 — confirmed clean).
- **Single-chart / host A behavior MUST stay unchanged** (iframe-scope only).
- **Honest RED→GREEN on built dist:** H-R02, H-R03 → 10/10; H-R01 store-leg green (V9 bar may stay RED → Phase 2). Master-switch A/B restores RED (coordinate `phase1Off` with Lane 4).
- **0 regressions on the (now-clean) manager gate + gate:react.**

## Guardrails
- File-scoped commits only, never `git add -A`. Do not touch `replay-system.js`, order-entry, indicator modules, `known-failing.json`/`scenarios.mjs` (Lane 4), or Lane 2's chart.js snap-back regions.
- Every report line is **DONE (dev only) — NEEDS-LIVE** until PO checklist (D-018 #6); no "proven", no GREEN-SYNTHETIC.

## Report — WORKER-REPORT-STANDARD.md
Step 0: recursion root + fix + commit hash + gate-clean confirmation (with Lane 4). Step 1 (if reached): Phase 1 files/switch, H-R02/H-R03 10/10 + A/B, regression status. If you stopped after Step 0, say so and hand back.
