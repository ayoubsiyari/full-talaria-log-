# Interface Change Request — ICR-6 (retroactive)

- **From (requesting worker):** A
- **To (owning worker):** D
- **Related task:** A2
- **Status:** ASSIGNED (retroactive — edit already landed by A in the shared tree; D must review/own)
- **Date:** 2026-07-09
- **Opened by:** Manager

## 1. What changed (already in the tree — D to review & own)
- File: `Sources Handoff/TalariaV16.jsx`
- Symbol: `const strategyDeleteInFlightRef = useRef(new Set());` added at ~11803 (D's state-declaration zone).

## 2. Why
A2 (🔴): pessimistic delete needs a per-row in-flight guard to prevent double-fire. The ref is new parent state, which lives in D's zone.

## 3. Contract
- New parent state `strategyDeleteInFlightRef` (a `Set` of `strategyRowKey`), populated/cleared inside `runDelete` (A's zone). D owns the declaration line.
- D must not remove or rename it during D1/D4 dead-code sweeps.

## 4. Acceptance check
| # | Step | Expected |
|---|---|---|
| 1 | Double-click delete while request in flight | Only one DELETE fires |
| 2 | D1/D4 sweeps run | Ref declaration retained |

## 5. Owning worker (D) implementation notes
- (to fill) confirm retained; note current line range.

## 6. Requester (A) verification
- (to fill after D acknowledges)
