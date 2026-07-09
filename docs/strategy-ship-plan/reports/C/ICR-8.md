# Interface Change Request — ICR-8

> Renumbered by Manager from the worker's "ICR-4" (that number was already used for D→A openBuilder
> markets precedence). Content unchanged.

- **From (requesting worker):** Worker C (C5 fresh worker)
- **To (owning worker):** Manager / modal-template owner (A + D zones)
- **Related task:** C5 — Canvas undo-coverage gaps (Finding #1, template-load history)
- **Status:** OPEN — awaiting director decision

## 1. What I need changed

- File: `Sources Handoff/TalariaV16.jsx`
- Symbols / call sites:
  - `StrategyBuilderModal` template button / `onOpenTemplates`
  - external `TemplatePickerModal` render and `onPick`
  - `StrategyCanvasWorkspaceInner` prop `applyStrategyTemplate`

Requested change:
- Either remove the dead `applyStrategyTemplate` prop end-to-end, or replace the modal-level template
  apply path with a history-aware canvas bridge when the canvas step is mounted.
- If template application remains reachable while `StrategyCanvasWorkspaceInner` is mounted, it must
  preserve undo/redo semantics: capture current canvas state before replacement, apply the template
  as the next history entry, allow undo to return to the prior build and redo to restore the template.

## 2. Why

C5 verified `applyStrategyTemplate` is not invoked by any in-canvas control, so Worker C could not
wire template loading within the canvas zone. The modal-level Templates button can open the external
picker while the canvas step is mounted, and that picker applies `fillStrategyBuilderFromTemplate(...)`
outside `StrategyCanvasWorkspaceInner`'s local history stack — so canvas history can desync after a
modal-level template apply.

## 3. Contract

- `StrategyCanvasWorkspaceInner` owns the local history stack (`pushHistory`, `commitCanvasMutation`,
  `history`, `histIdx`).
- External template application must not set `canvasNodes`/`canvasEdges` directly while expecting
  canvas undo to track it.
- If the dead prop is removed, remove both the child parameter and the parent pass site together.

## 4. Acceptance Check

| # | Step | Expected |
|---|---|---|
| 1 | Open Strategy Builder → Strategy Flow, create/edit a group. | Canvas history has current build as undo baseline. |
| 2 | Use the modal Templates button and apply a template. | Template replaces the canvas. |
| 3 | Ctrl+Z. | Prior build returns. |
| 4 | Ctrl+Y / redo. | Applied template returns. |

## Manager note (mitigation already present)
`fillStrategyBuilderFromTemplate` already shows a destructive-replace confirm (A3 / skipConfirm), so
the user is warned before a template overwrites work. The residual issue is undo/redo desync after a
confirmed replace, not silent data loss.
