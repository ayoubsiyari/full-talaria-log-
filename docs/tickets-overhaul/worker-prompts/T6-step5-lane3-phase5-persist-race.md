# T6 step 5 (Lane 3) — RC-6 Phase 5: indicator persist race (M5) — NOT M4 yet

## Sequencing decision
Do **Phase 5 (M5 — persist race)** this step. **Skip M4 (replay full-recalc/UI desync) for now** — M4 touches the replay path (`replay-system.js`), which Lane 2 is actively editing (D-017 snap-back + queued b1 replay work). Doing M4 now risks a `replay-system.js` collision. M4 runs after the replay lanes clear. M6 (panel layout) stays parked with the re-migration.

## Context
RC-6 plan. Landed: Phase 1 store (3502177c), Phase 2 visibility, Phase 3 settings-apply (db02aed4). This step = **M5: indicator persist race** — indicator state save/restore races on reload/session-restore causing lost/duplicate/stale indicators. Freeze-safe (indicator persistence + store files only).

## Step 0
Confirm Phase 3 (db02aed4) committed/clean; state it. Commit only your own indicator paths file-scoped — never `git add -A`.

## Tasks
1. Implement **M5**: route indicator persist/rehydrate through the `IndicatorLifecycleStore` (`Rehydrated` path) so save/restore is deterministic — no race between hydrate and add/remove. Fix duplicate/lost-on-reload.
2. Own kill-switch (dedicated or RC-6 rollout switch — state which; cover every file incl. React, I13).
3. RED-first: scenario reproduces the persist race (lost/dup indicator on rehydrate) and passes when serialized through the store (real assertion / switch-OFF RED-again, I15).
4. Report tickets discharged + note **M4 deferred** (replay-collision) and **M6 parked** (re-migration).

## Guardrails
- Indicator persistence/store/UI files only. Do NOT touch `replay-system.js` / chart.js replay (Lane 2), multichart-parent, order-entry, or `known-failing.json` — report deltas to Lane 4.
- I8/I9 mirrored + SHA256.

## Report — WORKER-REPORT-STANDARD.md
M5 design, files + switch, RED→GREEN (how actuated / what measured), tickets, M4-deferred/M6-parked note, Lane-4 deltas.
