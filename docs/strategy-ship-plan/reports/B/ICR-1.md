# Interface Change Request — ICR-1

- **From (requesting worker):** Worker B
- **To (owning worker):** Worker A
- **Related task:** B2
- **Status:** OPEN
- **Date:** 2026-07-09

## 1. What I need changed (exact)

- File: `Sources Handoff/TalariaV16.jsx`
- Symbol / call site: `saveBuilder`
- Requested change: add a final guard before the strategy payload is persisted. The guard should case-normalize and dedupe `stratBTimeframes`, enforce `MAX_STRATEGY_TIMEFRAMES`, and refuse save if the normalized list is empty or still over cap. Canonical units should match Builder UI behavior: `m` minutes stays lowercase, `H/D/W/M` are uppercase, so template values like `1h` save as `1H`.

## 2. Why (which task/bug this unblocks, user impact)

B2 enforces the 6-timeframe cap and canonical display in the Builder UI, but `saveBuilder` remains the persistence backstop outside Worker B's zone. Without the save guard, an out-of-zone caller or stale legacy edit payload could still persist unchecked or case-duplicated timeframe arrays.

## 3. Contract

- New/changed props, state, flags, or return values and their exact semantics: none.
- Who consumes it and where: `saveBuilder` consumes current `stratBTimeframes` and should save only the normalized, deduped, <=6 array.

## 4. Acceptance check (how the requester will verify the combined behavior)

| # | Step | Expected |
|---|---|---|
| 1 | Force `stratBTimeframes` to `["1H","1h","4h","1D","1W","1M","15m"]`, then save. | Save is blocked or normalized before persistence; no persisted strategy contains duplicate `1H`/`1h` or more than 6 timeframes. |
| 2 | Save a valid builder with `["1h","4H"]`. | Persisted strategy stores `["1H","4H"]`. |
| 3 | Save with 7 unique canonical timeframes. | Save is blocked with existing builder save-error UX; no unchecked over-cap payload is persisted. |

## 5. Owning worker implementation notes (filled on IMPLEMENTED)

- Status: IMPLEMENTED by Worker A.
- What was done: added shared `canonicalStrategyTimeframe`, `normalizeStrategyTimeframes`, and `deriveCustomStrategyTimeframes` helpers in `Sources Handoff/TalariaV16.jsx` lines 397-424. `saveBuilder` now normalizes/dedupes `stratBTimeframes`, rejects empty normalized arrays, rejects arrays over `MAX_STRATEGY_TIMEFRAMES`, writes the normalized list into the saved strategy payload, and syncs builder state before persistence.
- Current line range: `saveBuilder` lines 46588-46672.
- Deviations: none. The guard blocks over-cap payloads with existing builder save-error UX and normalizes valid lowercase-hour inputs such as `1h` to `1H` before persistence.

## 6. Requester verification (filled on VERIFIED)

- Steps re-run, results:
