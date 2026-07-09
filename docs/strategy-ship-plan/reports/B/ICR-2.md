# Interface Change Request — ICR-2

- **From (requesting worker):** Worker B
- **To (owning worker):** Worker D
- **Related task:** B4
- **Status:** OPEN
- **Date:** 2026-07-09

## 1. What I need changed (exact)

- File: `Sources Handoff/TalariaV16.jsx`
- Symbol / call site: parent builder state block around `TalariaV8b` state declarations and the `StrategyBuilderModal` instantiation.
- Requested change: lift the builder-local custom timeframe list and manual-market flag into parent state, then pass them into `StrategyBuilderModal`.

Requested state names and initial values:

```jsx
const [stratBTfCustom, setStratBTfCustom] = useState([]);
const stratBMarketsManualRef = useRef(false);
```

Requested modal props:

```jsx
stratBTfCustom={stratBTfCustom}
setStratBTfCustom={setStratBTfCustom}
stratBMarketsManualRef={stratBMarketsManualRef}
```

## 2. Why (which task/bug this unblocks, user impact)

B4 needs edit-mode restoration for custom timeframes and manually selected markets. Today `sbTfCustom` and `marketsManualFilterRef` live inside `GeneralInfoStepContent`, so they reset with the step component and cannot be restored from an edited strategy by parent-owned open/edit flow.

## 3. Contract

- `stratBTfCustom`: array of canonical custom timeframe tokens available to the builder form.
- `setStratBTfCustom`: setter used by `GeneralInfoStepContent` to add/remove custom timeframe tokens.
- `stratBMarketsManualRef`: mutable ref whose `.current` boolean tracks whether the user manually selected market filters instead of accepting symbol-derived markets.
- Who consumes it and where: Worker B will consume these props in `StrategyBuilderModal` / `GeneralInfoStepContent` during B4, after Worker D lands the parent-owned state lift.

## 4. Acceptance check (how the requester will verify the combined behavior)

| # | Step | Expected |
|---|---|---|
| 1 | Create/open a builder, add a custom timeframe such as `2H`, navigate away from step 1 and back. | Custom timeframe option remains available through parent-held `stratBTfCustom`. |
| 2 | Manually select a market filter, then change symbols. | Manual-market intent is preserved through `stratBMarketsManualRef.current` rather than being reset by a step remount. |
| 3 | Open an existing strategy for edit after B4 consumes the props. | Custom timeframes and manual market behavior restore from parent state instead of defaulting to local empty refs/state. |

## 5. Owning worker implementation notes (filled on IMPLEMENTED)

- Status: IMPLEMENTED by Worker D.
- What was done: added parent-owned `stratBTfCustom` state and `stratBMarketsManualRef` ref in `Sources Handoff/TalariaV16.jsx`, then passed `stratBTfCustom`, `setStratBTfCustom`, and `stratBMarketsManualRef` into the live `StrategyBuilderModal` instantiation for B4 consumption.
- Current line range: state/ref declarations at `Sources Handoff/TalariaV16.jsx` lines 12140 and 12156; modal props at lines 47004 and 47006.
- Deviations from request: none. The props are not consumed in `StrategyBuilderModal` / `GeneralInfoStepContent` yet because B owns that later B4 work.

## 6. Requester verification (filled on VERIFIED)

- Steps re-run, results:
