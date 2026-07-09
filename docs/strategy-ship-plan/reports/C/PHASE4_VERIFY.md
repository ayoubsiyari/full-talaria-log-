# Phase 4 Static Verification — Canvas
Status: DONE (static) with findings

Source traced: `Sources Handoff/TalariaV16.jsx`

## Trace Table
| Item | Symbol / current lines | Expected | Observed | Result |
| --- | --- | --- | --- | --- |
| C1/C2 | History setup @ 4183-4288; `commitCanvasMutation` @ 4290-4302; add/delete/rename/condition moves @ 4413-4597 and 4655-4934; undo/redo @ 4614-4626; template apply @ 46342-46380 and 47177-47184 | History seeded from mounted canvas, capped at 50, covers add/delete/rename/move/connect/template-load; undo after template load returns to prior build. | History now seeds from `canvasNodes/canvasEdges`, caps at 50, and covers many mutations through `commitCanvasMutation`. However, template application writes `setCanvasNodes(buildNodesFromTemplate(tpl))` / `setCanvasEdges([])` outside the canvas history stack, and section reorder stop paths use direct `setCanvasNodes` without `pushHistory`. No user-reachable connect handler is present. | FINDING |
| C3 | `showFlowNotice` @ 4249-4255 and render @ 5475-5488; delete guard @ 4530-4535; outline outside-click @ 5169-5177; image validation @ 5178-5199; empty group blur @ 5109-5114; board render @ 5521-5549 | One-group notice uses neutral/info styling; outline status menu outside-click dismisses; board image uploads validate; empty outline label restores default; edge dragging removed while `edges={canvasEdges}` still renders. | One-group guard emits `At least one group is required.` through neutral `role="status"` blue styling. Outline status menu closes on outside mousedown. Outline image uploads call `validateStrategyImageFile`. Empty outline group blur restores `DEFAULT_GROUP_LABEL`. ReactFlow still renders `edges={canvasEdges}` and has no `onConnect` prop. | PASS |
| C4 | `escPrint` / `printOutlineDocument` / `handlePrintPdf` @ 5205-5265; print button @ 5438-5454 | PDF preflight name + save before `window.open`; `escPrint` intact; popup-blocked message preserved. | `handlePrintPdf` returns before popup for missing name or unavailable save, awaits `onSave({ keepOpen: true })`, then opens the window. Popup blocked message remains `Allow pop-ups to print the strategy PDF.` `escPrint` still escapes HTML-sensitive characters. | PASS |
| Dead code | `statsOf` / `blankTpl` / `selectedNode` / `doFit` | 0 refs. | `rg` count found no matches for these identifiers in `Sources Handoff/TalariaV16.jsx`. | PASS |

## Findings
- HIGH: Template-load undo cannot return to the prior build. `fillStrategyBuilderFromTemplate` applies template nodes with direct `setCanvasNodes(buildNodesFromTemplate(tpl))` and `setCanvasEdges([])` at 46378-46379, while the canvas history stack lives inside `StrategyCanvasWorkspaceInner` and only records through `pushHistory`/`commitCanvasMutation`. The Template Picker call at 47177-47184 passes through this external setter path, so the previous build is not retained in the active canvas history.
- MEDIUM: Section reorder/move is not recorded in canvas history. `startSectionDrag` / section drag stop paths update final positions with direct `setCanvasNodes` at 4771-4789 and 4941-4959 without `pushHistory` or `commitCanvasMutation`, so undo/redo will not reliably restore section ordering after user moves groups.

## Browser-Only Checks
Runtime click-crawl, actual Ctrl+Z/Ctrl+Y behavior after template load, pointer drag behavior, popup blocker behavior, and board/outline UI interaction checks are DEFERRED -> final Docker pass.

## ReadLints
`ReadLints` on `Sources Handoff/TalariaV16.jsx`: no linter errors found.
