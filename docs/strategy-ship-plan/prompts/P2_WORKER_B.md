# PROMPT — Worker B — B4 — Edit-mode restoration (Builder form)

You are Worker B. Phase 1 (B1) and Phase 2 B2/B3 done. This is B4: make the Builder form fully
restore when editing an existing strategy, using the state Worker A/D have now lifted to the parent.

## Working rules
- Exclusive edit of `Sources Handoff/TalariaV16.jsx` while you hold it. DO NOT switch branches /
  stash / revert — all prior work (A/C/D + your B1/B2/B3) is uncommitted and must be preserved.
  `git diff` before DONE.
- Zone: `StrategyBuilderModal` + `GeneralInfoStepContent` (~5680–8421, re-locate by name). No new deps.

## Context you must build on (already landed)
- Parent now passes lifted props into the modal: `stratBMarketsManualRef`,
  `stratBTfCustom` / `setStratBTfCustom` (instantiation ~47003–47006).
- A made `stratBTfCustom` the AUTHORITATIVE custom-timeframe state: openBuilder/edit and template
  hydration populate it (derived from saved `timeframes` not in the preset list); `resetForm`
  clears it. The old local `sbTfCustom` in `GeneralInfoStepContent` must be replaced by the lifted
  prop — do NOT keep a competing local copy.

## B4 tasks
1. In `GeneralInfoStepContent`, consume `stratBTfCustom` / `setStratBTfCustom` from props as the
   single source of truth for custom timeframes. Remove/replace the internal `sbTfCustom` state so
   custom TFs shown on edit match what A restored. Keep B2's canonicalization/cap behavior.
2. Ensure ALL step-1 fields visibly restore when editing an existing strategy: name, description,
   style, direction, complexity, markets (respecting A's saved-market precedence via
   `stratBMarketsManualRef`), traded + supporting instruments, timeframes (presets + customs),
   tags, images, logo. Fix any field that stays blank/default on reopen.
3. `stratBMarketsManualRef`: once the user manually edits markets, auto-derive from instruments must
   not clobber the restored/edited markets. Wire the ref so manual edits are respected on edit.

## Verify (UI)
- Create a strategy with customs (e.g. 2H, 3D), non-default markets, support instruments, tags,
  images, logo → save → reopen for edit → every field restored, customs present, markets not
  re-derived over the saved ones.
- Add/remove a custom TF while editing → persists through save/reopen; cap (6) still enforced.
- New (non-edit) builder still starts clean.

## Report
`reports/B/B4.md`: symbols + line ranges, the field-by-field restore verification table, note that
`stratBTfCustom` is now the sole custom-TF state, `ReadLints` result, `git diff` presence.
Status DONE only when edit restoration is complete and no competing custom-TF state remains.
