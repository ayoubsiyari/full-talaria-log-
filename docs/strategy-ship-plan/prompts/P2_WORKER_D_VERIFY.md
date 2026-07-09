# PROMPT — Worker D — onPick one-liner + D2 verify

Worker A has landed ICR-4 (openBuilder now prefers saved markets) and added the `skipConfirm`
param to `fillStrategyBuilderFromTemplate(tpl, afterApply, skipConfirm)`. You now do the final
picker wiring and verify D2.

## Working rules
- Exclusive edit of `Sources Handoff/TalariaV16.jsx` while you hold it. DO NOT switch branches /
  stash / revert — all prior work is uncommitted and must be preserved. `git diff` before DONE.
- Zone: your picker instantiation site only (~46984–46990). No new deps.

## Task 1 — kill the double-confirm at the call site
At the live `TemplatePickerModal` (~46984):
1. Broaden the predicate so an edit session also counts as "existing work":
   `hasExistingGroups={strategyFlowHasMeaningfulTemplateContent(canvasNodes) || stratEditId != null}`
2. In `onPick`, pass `skipConfirm = true` so A3's confirm does not stack on top of the picker's:
   `fillStrategyBuilderFromTemplate(tpl, undefined, true)`
Rationale: the picker (C2 + ICR-3) now owns the single replace-confirm; A's function skips its own
when told. When there's nothing to confirm, A3 wouldn't have fired anyway, so passing true is safe.

## Task 2 — verify D2 (UI)
Run these and record observed results:
- Edit an existing strategy that has saved `markets` → reopen builder → markets restored from saved
  (not re-derived). (ICR-4)
- With meaningful canvas content OR while editing, apply a template → **exactly one** confirm
  dialog, not two. Confirm → template applies; cancel → nothing changes. (C2 × A3 double-confirm)
- Pristine new builder, apply template → no spurious confirm.

## Report
`reports/D/D2.md`: show the two one-liner hunks (symbol + line range), the three UI outcomes in a
verification table, `ReadLints` result, and `git diff` presence. Status DONE when double-confirm is
gone and markets restore correctly; otherwise BLOCKED with the exact blocker.
