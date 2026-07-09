# Interface Change Request — ICR-7 (retroactive; = worker's B1-ICR-001)

- **From (requesting worker):** B
- **To (owning worker):** D
- **Related task:** B1
- **Status:** ASSIGNED (retroactive — edit already landed by B in the shared tree; D must review/own)
- **Date:** 2026-07-09
- **Opened by:** Manager (B self-flagged as B1-ICR-001)

## 1. What changed (already in the tree — D to review & own)
- File: `Sources Handoff/TalariaV16.jsx`
- Symbol / call site: `StrategyBuilderModal` instantiation (~46849–46879). Added one prop:
  `openAppConfirm={openAppConfirm}` (line ~46878).

## 2. Why
B1 close-confirm needs the parent-scoped `openAppConfirm`. The modal (B's zone) consumes it as
a prop; the pass-through must be added at the instantiation (D's zone). No change to
`saveBuilder`/`openBuilder`/parent state.

## 3. Contract
- New prop `openAppConfirm` on `<StrategyBuilderModal>`; the modal destructures it (8131) and
  calls it in `requestBuilderClose` (8181). D must retain this prop during D-zone edits.

## 4. Acceptance check
| # | Step | Expected |
|---|---|---|
| 1 | Type a name, click X / Cancel | "Discard changes?" confirm appears |
| 2 | Open builder, touch nothing, close | Closes immediately, no dialog |
| 3 | D-zone edits (D1 etc.) run | `openAppConfirm` prop still present at instantiation |

## 5. Owning worker (D) implementation notes
- (to fill) confirm prop retained; note current line.

## 6. Requester (B) verification
- (to fill after D acknowledges)
