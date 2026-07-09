# PROMPT — C5 FIX — Canvas undo-coverage gaps (section move + template load)

Fresh worker, fully self-contained. This is an EDIT task on `Sources Handoff/TalariaV16.jsx`. Phase 4
static verification found two verified gaps in the canvas undo/redo history; fix both.

## Working rules (critical — shared 1-file project)
- You hold an EXCLUSIVE write lock on the file. Only you edit it this turn.
- DO NOT switch branches / stash / revert. ALL prior work (Phases 1–3) is UNCOMMITTED and MUST be
  preserved. `git diff` before DONE. Manager handles git centrally.
- Stay in the canvas zone: `StrategyCanvasWorkspaceInner` (~line 4179 onward). Re-locate symbols by
  NAME. No new deps.
- The canvas already has a history system: `pushHistory(nodes, edges)` (~4267) and
  `commitCanvasMutation(nodeUpdater, edgeUpdater)` (~4290) which computes next state, pushes to
  history (50-cap), and applies. Use these — do not invent a parallel history.

## Finding #2 (clear) — section reorder is not recorded in history
In `onNodeDragStop` (~4866), the `node.type === 'condition'` branch correctly uses
`commitCanvasMutation`, but the `node.type === 'section'` branch (~4937–4960) applies the reflow via
a plain `setCanvasNodes(nds => {...})`, so section reorder is NOT undoable.
- Route the section-branch node transform through `commitCanvasMutation` so the resulting graph is
  pushed to history. Keep the side effects (`isDraggingRef`, `setIsDragging(false)`, the
  `setTimeout(() => setSliding(false), 350)`) as-is; only the node-state update needs to go through
  history. Preserve the exact snapY/reflow math and final positions.
- Verify (static trace): after a section drag, the previous ordering is one `pushHistory` entry back;
  Ctrl+Z restores the prior order.

## Finding #1 — template load is not wired into history
C1's report claimed a `loadTemplate` that pushed history before applying a template; it is NOT in
the code. `applyStrategyTemplate` is passed into the canvas as a prop (see the param list ~4179 and
the pass site ~47221) — determine whether it is actually invoked by any USER-reachable in-canvas
control:
- IF there is a user-reachable in-canvas "apply/load template" action: wrap it so it
  `pushHistory(currentNodes, currentEdges)` for the pre-apply state, then applies the template
  (the applied graph becomes the new current entry) — so undo returns to the prior build and redo
  restores the template. Prefer routing through `commitCanvasMutation`/`pushHistory`.
- IF `applyStrategyTemplate` is NOT user-reachable inside the canvas (only the pre-builder picker
  sets nodes before mount, which is already the seeded history baseline): document that template
  load is covered by the mount-time seed, and note the `applyStrategyTemplate` prop is unused. Only
  remove the dead prop if it stays within your zone; prop removal that touches the modal
  instantiation site is another zone → file an ICR instead of editing it.

## Verify
- `ReadLints` on `Sources Handoff/TalariaV16.jsx` clean (retry once if it times out; note it).
- `git diff --check` clean; `git diff` shows changes limited to the canvas zone.
- Static trace for both findings (section-move undoable; template-load either wired or justified).

## Report
`reports/C/C5.md`: symbols + current line ranges, what changed for each finding, the template-load
determination (wired vs. baseline-covered + any ICR), verification table, lint result, git diff
presence. Status DONE per finding, or BLOCKED with the exact blocker.
