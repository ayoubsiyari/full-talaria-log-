# PROMPT — Worker A — Phase 2 (Persistence & Lifecycle) — the big turn

You are **Worker A**. Phase 1 (A1/A2/A3) done. This turn: **A4, A5, A6**, PLUS you implement
**ICR-1** and **ICR-4** and the **double-confirm skipConfirm** param. You now have exclusive
access to `Sources Handoff/TalariaV16.jsx` (D just finished).

## 0. CRITICAL working rules
- **Exclusive file lock; DO NOT switch git branches / stash / revert.** All prior work
  (A1/A2/A3, B1, C1/C2, B2/B3, D1, ICR-2/ICR-3) lives as UNCOMMITTED changes and MUST be
  preserved. `git diff` to confirm your hunks present before DONE.
- Zone: `TalariaV16.jsx` top helpers (~1–1523) + builder lifecycle block
  (`resetStrategyBuilderForm`, `fillStrategyBuilderFromTemplate`, `openBuilder`,
  `copyStrategyIntoBank`, `runDelete`, `saveBuilder` — re-locate by name, ~46016+ drifted),
  all `homepage/src/app/dashboard/v16/`, `homepage/src/app/dashboard/strategies/**`, backend
  strategy/template routes+schemas only. Re-locate symbols by name. No new deps. Never weaken
  auth/CSRF/size limits.

## 1. A4 — Pre-save payload budget 🟠
In `saveBuilder`, add a hard pre-flight size check vs backend `MAX_CONTENT_LENGTH` (16 MB).
Serialize the actual request body (or apply a conservative safety margin) and block with a clear
in-modal error BEFORE any network request if over budget. Keep frontend image caps aligned with
`shared/constants.json` / backend `MAX_COVER_IMAGE_LEN`.
Verify: build an oversized strategy (many large images) → save blocked with message, NO network
request; normal strategies unaffected.

## 2. A5 — Canvas conditions → root conditions; restore tree on edit 🟠
`saveBuilder` persists stale `stratBConditions` (usually `[]`); the real flow lives in
`talaria_v9.canvasNodes`. At save, derive the flattened conditions list from `canvasNodes` (the
SAME derivation the Review step uses) and write it to root `strategy_definition.conditions`.
Also restore `tree` in `openBuilder` and reset it in `resetStrategyBuilderForm`.
Verify: save a canvas strategy → API body root conditions populated; edit→reopen→nothing lost;
legacy strategies still load.

## 3. A6 — Surface bank fetch failures 🟠 (TS files — separate from the big file)
`v16JournalMappers.ts` leaves `strategies: []` on non-OK with no signal. Wire the failure into
the A1 error flag (`strategyBankStale`/`strategyBankError`) so the page can show a "couldn't load
— retry" state instead of a false empty. (This edits TS only; safe alongside the big-file work.)
Verify: force 401/500 on GET /strategies → error state, not empty-bank UI.

## 4. Implement ICR-1 (from B) — saveBuilder TF backstop
Add a final guard in `saveBuilder`: case-normalize + dedupe `stratBTimeframes` (canonical units:
`m` minutes lowercase, `H/D/W/M` uppercase — MATCH B2's form logic), enforce
`MAX_STRATEGY_TIMEFRAMES` (6), refuse/normalize before persist. See `reports/B/ICR-1.md`; fill §5.

## 5. Implement ICR-4 (from D) — openBuilder markets precedence
In `openBuilder(editStrat)`, prefer saved `editStrat.markets` when present; fall back to
instrument-derived markets ONLY if no saved markets. (Currently derived wins — see ~46108 region.)
See `reports/D/ICR-4.md`; fill §5. D verifies D2 from the UI after this.

## 6. Double-confirm fix (skipConfirm param)
Add a `skipConfirm` param to `fillStrategyBuilderFromTemplate(tpl, afterApply, skipConfirm)`:
when `skipConfirm` is truthy, bypass the A3 `openAppConfirm` gate and apply directly (A3's confirm
still fires for its other/non-picker paths). The live picker owns the confirm now (C2 + ICR-3).
NOTE: the picker's onPick call site (D's zone, ~46987) will be updated by D in the verify loop to
pass `skipConfirm:true` and to broaden `hasExistingGroups` to also cover `stratEditId != null`.
Just add the param + behavior; do not edit D's call site.

## 7. Custom-TF state reconciliation (coordinate with B4)
D lifted `stratBTfCustom` (12156) but a pre-existing `stratBCustomTfs` (12157) also exists.
In `resetStrategyBuilderForm` and `openBuilder`, populate/reset the LIFTED `stratBTfCustom`
(derive custom TFs from saved `timeframes` not in the preset list on edit). Note in your report
which state is now authoritative so B4 consumes the same one. If ambiguous, flag BLOCKED rather
than guess.

## 8. Report
Separate reports `reports/A/A4.md`, `A5.md`, `A6.md`; update ICR-1 §5, ICR-4 §5; note skipConfirm
+ custom-TF decision. Paste all back with symbols + line ranges, verification tables, lint result,
`git diff` presence. Status per task: DONE / BLOCKED.
