# T0 step 16 (Lane 4) — baseline reconcile + absorb Lane 2 edits + scenario-id cleanup

## Role
Lane 4 = sole owner of `known-failing.json`, `scenarios.mjs` ids, `run.mjs`, `react-parity-lib.mjs`. This step restores a clean, honest gate after the T8 replay work churned the baseline.

## Step 0 — surface prior work
If you have uncommitted/in-flight T0 step 14 (honest actuation harness) work, summarize its state at the top of your report first. Do NOT discard it.

## Tasks
1. **Absorb Lane 2's `known-failing.json` edit** (Lane 2 removed H-S27/H-S30 during T8). Reconcile to a single canonical baseline; confirm `npm run gate` = PASS with **0 regressions**. Report final counts (expectedTests, knownFailing).
2. **Stale-row disposition:** re-run H-S27 and H-S30 isolated. If they are genuinely known-failing, keep tracked with a reason; if green, promote. No silent drops.
3. **H-S73 = FAIL-REAL-BUG** (B-FIX-C prepend compensation, NOT TAL-01579 — confirmed by T8 step 11 diagnostic). Add as a **tracked known-failing** row with a reason comment linking it to RC-3/T8, not TAL-01579.
4. **Scenario-id collision fix:** the pan-snapback RED must be **H-S82** (H-S79 already used by the refresh scenario). **Also reserve H-S83 = finest-TF cadence RED** (Lane 2 T8 step 13). Confirm no other id collisions across `scenarios.mjs`; report the id map delta.
5. **Defer** the proposed H-S81 fence (coarse tick-play fetches==0 + render budget) — note it as a pending Lane-4/T2 item; do NOT implement now.
6. **T5 step 3 deltas (Lane 1 handoff):**
   - **H-S42 → REMOVE** from `known-failing.json` (both trees). It is green 3/3 on the Phase-1+2 engine; it is the row making `npm run gate` exit 1 (`baseline stale; remove fixed test(s): H-S42`). This is the priority reconcile item.
   - **H-S40 / H-S41 probe-honesty fix (I15):** these RED scenarios measure `data[round(x)].t` (60s bar-open drift) instead of the anchored `timestampPoints`. Fix the probe to read `timestampPoints`, then **re-evaluate** — if the Phase-1 `__TALARIA_RC3_VOLUME_RENDER_RESOLVE` fix actually greens them with an honest probe, promote; if still red, keep tracked with the real reason. Do NOT leave a dishonest RED masking a real green.
   - **H-S25 reclassify:** root is `panel-cmd-bridge.js _panelPlayFollowContinuousOffsetX` (T8 replay-follow eased-follow seam), NOT RC-3 anchoring. Keep tracked-red; update the reason comment to point at T8/replay-follow (registry row `RC3-HS25#1` exists but the mechanism is T8).
7. **H-S58 registration (Lane 3 handoff):** T4 step 8/9 order-entry fixes are proven by `H-S58` (close/hit-target family). If it isn't already in `scenarioList()`/`expectedTests`, register it so the order-entry green is tracked. Confirm it passes on the current engine.
8. **H-S83 registration (Lane 2 handoff):** finest-TF cadence RED `H-S83` PASSES on staging b1 (proves 4h-focused → 1m sub-advance; switch-OFF restores 4h jumps, maxStep=14.4M). Register in TICKET-REGISTRY + `expectedTests`. **Hold promotion to a hard-green baseline row until PO accepts b1 A/B** (per D-016 acceptance) — track as expected-but-pending-PO if needed.

## Guardrails
- Do NOT touch product engine, React, or `panel-cmd-bridge.js`.
- I8/I9: keep both trees mirrored; report SHA256 of edited harness files.

## Report — WORKER-REPORT-STANDARD.md
Final gate result + counts, per-row disposition table (H-S27/H-S30/H-S73), the id-map delta, and confirmation of single-owner baseline.
