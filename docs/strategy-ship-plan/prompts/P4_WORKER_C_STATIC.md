# PROMPT — Phase 4 STATIC cross-cutting verification: BUILDER + CANVAS
# (Live-runtime/browser click-crawl is DEFERRED to the final Docker pass — do NOT block on it.)

## Fresh worker orientation
You may be a brand-new worker with no prior history on this project — that is fine, this prompt is
fully self-contained and READ-ONLY. Do NOT edit any files. You are verifying that already-completed
work is present and correct in the current integrated file by TRACING code paths. If something is
missing or wrong, record it as a FINDING (with the symbol + current line range) — do not fix it; the
manager will assign a fix task.

You are handling two verification bundles this turn: Builder modal and Canvas. READ/TRACE pass on the
current integrated `Sources Handoff/TalariaV16.jsx`. No edits expected. Defects → report as findings,
not inline fixes (manager assigns fix tasks).

## Rules
- Read-only intent. DO NOT switch branches/stash. Read-only commands only (`rg`, `git diff`,
  `ReadLints`). No file edits. Trace by symbol name; note current line ranges.

## Bundle 1 — Builder modal (static trace)
- B1: `StrategyBuilderModal` open-time dirty signature; X / step-1 Cancel route through the dirty
  guard → `openAppConfirm`; pristine close immediate.
- B2: timeframe canonicalization (`m`/`H/D/W/M`), dedupe, reactive trim to 6, cap feedback; step
  gating uses normalized count.
- B3: traded/support symbol grids wrap+scroll (no clipping); 11th selection → "Max 10".
- B4: `GeneralInfoStepContent` consumes lifted `stratBTfCustom`/`setStratBTfCustom` as SOLE custom-TF
  state (no `sbTfCustom` local); `stratBMarketsManualRef` prevents auto-derive clobbering restored
  markets; step-1 fields restore on edit.
- B5: `generalInfoMissingLabels` rendered when Next blocked; `canAddStrategyImage` gates the mobile
  Add tile at limit 4; `MAX_TAG_LENGTH` per-tag cap with feedback.
- Double-confirm: `fillStrategyBuilderFromTemplate(tpl, afterApply, skipConfirm)` bypasses A3 confirm
  when skipConfirm true; picker call site passes true + `hasExistingGroups` includes `stratEditId`.

## Bundle 2 — Canvas (static trace)
- C1/C2: history seeded from mounted canvas (not empty), 50-cap, covers add/delete/rename/move/
  connect/template-load; undo after template load returns to prior build.
- C3: `showFlowNotice` "one group required" uses neutral/info styling; outline status menu
  outside-click dismiss; board uses `validateStrategyImageFile`; empty outline label restores
  default; `onConnect`/edge-drag removed from user reach but `edges={canvasEdges}` still renders.
- C4: PDF preflight (name + save) BEFORE `window.open`; `escPrint` intact; popup-blocked message
  preserved.
- Dead code removed: `statsOf`/`blankTpl`/`selectedNode`/`doFit` — 0 refs.

## Report
`reports/C/PHASE4_BUILDER.md` and `reports/C/PHASE4_VERIFY.md`: trace table per item (symbol,
current lines, expected, observed, pass/finding), `ReadLints` result, list of any defects
(with severity). Mark browser-only checks "DEFERRED → final Docker pass".
Status: DONE (static) with findings, or BLOCKED.
