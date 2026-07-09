# Interface Change Request — ICR-4

- **From (requesting worker):** Worker D
- **To (owning worker):** Worker A
- **Related task:** D2 — verify saved markets restore in Strategy Builder edit mode
- **Status:** OPEN
- **Date:** 2026-07-09

## 1. What I need changed (exact)

- File: `Sources Handoff/TalariaV16.jsx`
- Symbol / call site: `openBuilder(editStrat)` market restoration path.
- Current line range: `Sources Handoff/TalariaV16.jsx` lines 46251-46258.
- Requested change: when editing an existing strategy, prefer persisted saved markets from `editStrat.markets` when that array is present and non-empty. Only fall back to `deriveStrategyMarketsFromInstruments(editInst, editSupport)` when no saved markets exist.

Current behavior:

```jsx
const editDerivedMarkets = deriveStrategyMarketsFromInstruments(editInst, editSupport);
setStratBMarkets(
  editDerivedMarkets.length
    ? editDerivedMarkets
    : (editStrat.markets || [])
);
```

Requested behavior:

```jsx
const editSavedMarkets = Array.isArray(editStrat.markets) ? editStrat.markets : [];
const editDerivedMarkets = deriveStrategyMarketsFromInstruments(editInst, editSupport);
setStratBMarkets(editSavedMarkets.length ? editSavedMarkets : editDerivedMarkets);
```

Equivalent code is fine if it preserves this precedence.

## 2. Why

D2 needs to verify market restoration honesty in the Strategy Builder. At the moment, editing a saved strategy can overwrite a manually saved market scope with symbol-derived markets whenever instruments/support symbols derive any markets. This blocks Worker D from verifying the builder restores persisted saved market choices.

## 3. Contract

- If `editStrat.markets` is a non-empty array, `stratBMarkets` should restore exactly those saved market ids.
- If `editStrat.markets` is missing, not an array, or empty, derive markets from `editStrat.instruments` and `editStrat.supportInst`.
- Do not change `saveBuilder` payload semantics in this ICR unless needed to preserve the existing saved `markets` field.

## 4. Acceptance check (D2)

| # | Step | Expected |
|---|---|---|
| 1 | Save or mock a strategy with `markets:["forex"]` and instruments/support symbols that would derive additional non-forex markets. Open it for edit. | Builder market filters show only the saved `forex` market selection. |
| 2 | Save or mock a strategy with no saved `markets` but with instruments/support symbols. Open it for edit. | Builder derives market filters from the instruments/support symbols. |
| 3 | Save/edit after restoring saved markets. | Saved strategy preserves the selected saved market scope unless the user changes it. |

## 5. Owning worker implementation notes

- Status: IMPLEMENTED by Worker A.
- What was done: updated `openBuilder(editStrat)` in `Sources Handoff/TalariaV16.jsx` to read `editSavedMarkets = Array.isArray(editStrat.markets) ? editStrat.markets : []`, derive markets from instruments/support symbols, and call `setStratBMarkets(editSavedMarkets.length ? editSavedMarkets : editDerivedMarkets)`.
- Current line range: `Sources Handoff/TalariaV16.jsx` lines 46339-46358.
- Deviations: none. The existing save payload still preserves `stratBMarkets` when present and derives only when the builder has no market selection.

## 6. Requester verification

- (to fill by Worker D after A lands the change)
