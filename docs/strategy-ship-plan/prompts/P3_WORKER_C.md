# PROMPT — Worker C — Phase 3 (Canvas polish) — C3 + C4

You are Worker C. Do C3 and C4 in ONE turn. You hold the exclusive lock on
`Sources Handoff/TalariaV16.jsx`; you are FIRST in the Phase 3 serial order (C→B→D→A).

## Working rules
- Exclusive edit while you hold it. DO NOT switch branches / stash / revert — all prior work
  (P1+P2 from A/B/C/D) is uncommitted and MUST be preserved. `git diff` before DONE.
- Zone: `StrategyCanvasWorkspaceInner` + canvas node components/templates/picker (~1524–5679,
  re-locate by name). No new deps. Keep visual language (colors `c`, font `F`).

## C3 — Canvas UX & consistency batch
- **Delete-group notice styling:** `showFlowNotice` currently aliases the red image-error toast;
  give the "At least one group is required." notice neutral/info styling (not error-red).
- **Outline status menu:** add outside-click dismiss (board cards already have it).
- **Board image validation parity:** board nodes use `validateScreenshotUploadFile` (any image/*);
  switch to `validateStrategyImageFile` for parity with outline.
- **Outline empty labels:** blur-normalize empty group labels back to default (board `commitEdit`
  already does this).
- **Edge-connect (Director D-2 = default (a), CONFIRMED):** remove unreachable `onConnect`/edge-drag
  plumbing from user reach; KEEP edge *rendering* for template/saved data. Confirm AND/OR/OFF
  connectors cover the UX. Do NOT add `<Handle>`s.
- **Dead code in-zone:** remove unused `statsOf`/`blankTpl`, unused `selectedNode`; `doFit` — either
  bind to a toolbar Fit control or remove. Removing never-rendered MiniMap/palette/inspector
  *props* touches other zones → ICR if you go that far; dropping only your unused internals is fine.

## C4 — PDF export polish
Bug: printing with a missing/invalid name opens a popup, then save fails → flash window.
Fix: validate preconditions (name present, savable) BEFORE `window.open`. Keep the existing
popup-blocked message and escaping (`escPrint` — do not weaken). Happy path prints with logo
(`/LOGO-07.png` present in `homepage/public`).

## Verify (static this turn; runtime → P4)
- Delete last group → info-styled notice, not error-red.
- Outline status menu closes on outside click; empty outline label restores default on blur.
- Board image upload rejects non-strategy image types same as outline.
- No user-reachable edge-drag; saved/template edges still render.
- Print with no name → clear message, NO popup flash; `escPrint` intact.
- `ReadLints` clean; `git diff` shows hunks in-zone.

## Report
`reports/C/C3.md` and `reports/C/C4.md`: symbols + line ranges, verification tables, lint result,
`git diff` presence, any ICR filed. Status DONE per task.
