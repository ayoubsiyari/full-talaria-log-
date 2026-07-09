# Interface Change Request — ICR-5 (retroactive)

- **From (requesting worker):** A
- **To (owning worker):** D
- **Related task:** A1
- **Status:** ASSIGNED (retroactive — edits already landed by A in the shared tree; D must review/own)
- **Date:** 2026-07-09
- **Opened by:** Manager (A edited D's zone directly without a prior ICR; formalized here)

## 1. What changed (already in the tree — D to review & own)
- File: `Sources Handoff/TalariaV16.jsx`
- Symbol / call sites:
  - Embedded boot-sync effect (~11241–11248): `mergeV16StrategyBankRows(boot.strategyBank, prev, { preservePersistedLocal: bankStale })` with a loading+not-stale guard.
  - Strategy-bank effect `applyBank`/`syncBank` (~11822–11854): stale-aware merge; keeps `prev` when merged is empty and (bankRows not array OR bank stale).

## 2. Why
A1 (🔴 data-loss): a failed refresh must not empty My Strategies. The merge-helper contract is A's, but its consumers live in D's state/effect zone. A wired them directly; this ICR transfers ownership/verification to D.

## 3. Contract
- D owns the `~11720–11970` zone. D must ensure D1 (community strip) and any future D edits do not clobber these two effects.
- Flag semantics (defined by A): `strategyBankStale` true ⇒ preserve persisted local rows; not stale + `[]` ⇒ authoritative empty (clear list).

## 4. Acceptance check
| # | Step | Expected |
|---|---|---|
| 1 | Offline, trigger refresh | My Strategies unchanged; `strategyBankStale` true |
| 2 | Server returns empty bank (not stale) | List shows empty |
| 3 | Run D1 alongside these effects | No textual/logic conflict; both effects intact |

## 5. Owning worker (D) implementation notes
- (to fill) confirm coexistence with D1; note current line range.

## 6. Requester (A) verification
- (to fill after D acknowledges)
