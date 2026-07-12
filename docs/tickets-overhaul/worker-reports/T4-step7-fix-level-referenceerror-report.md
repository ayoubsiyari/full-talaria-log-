# T4 step 7 fix level ReferenceError report

## Scope

Prompt: `docs/tickets-overhaul/worker-prompts/T4-step7-fix-level-referenceerror.md`

Priority regression from T4 step 5/6: dragging an entry threw `ReferenceError: level is not defined`.

No build bump was run.

## Throw site and fix

Throw site:

- `chart v 1.4/chart/modules/order-manager.js`
- Main entry drag branch in `makePreviewLineDraggable()`
- The step-5 reclassification block referenced `level` after it had been declared as `const level` inside the preceding multi-entry sync block.

What `level` should have been:

- The dragged main-entry level object resolved from `lineData.multiEntryLevelId`, falling back to the sorted primary multi-entry level.

Fix:

- Introduced outer-scope `draggedEntryLevel`.
- Assigned it in the sync block.
- Used `draggedEntryLevel` for both price sync and `orderType` update.
- No reclassification semantics changed.
- No step-6 throttle/live-label design changed.

Introduced by:

- T4 step 5. The bug came from adding `if (level) level.orderType = newOrderType;` outside the lexical scope where `level` was declared.

## RED-first repro

Added real drag-handler test:

- `chart v 1.4/chart/modules/order-entry-drag-handler-reference.test.mjs`
- `homepage/public/chart/modules/order-entry-drag-handler-reference.test.mjs`

This test:

- Evaluates `order-manager.js` in a VM.
- Stubs `d3.drag()` to capture the real `.on('start')` and `.on('drag')` callbacks registered by `makePreviewLineDraggable()`.
- Instantiates an `OrderManager` prototype object.
- Calls `makePreviewLineDraggable(lineData)`.
- Invokes the real start/drag callbacks.

RED before fix:

```powershell
node "chart v 1.4/chart/modules/order-entry-drag-handler-reference.test.mjs"
```

Result:

- Exit code `1`.
- `FAIL: ReferenceError: level is not defined`
- Stack pointed to `order-manager.js:18903` inside the drag callback.

GREEN after fix:

```powershell
node "chart v 1.4/chart/modules/order-entry-drag-handler-reference.test.mjs"
```

Result:

- Exit code `0`.
- Covered switch matrix:
  - `pass: switches default ON`
  - `pass: reclassification switch OFF`
  - `pass: live-label switch OFF`
  - `pass: both switches OFF`
- `GREEN — real entry drag handler ran without ReferenceError across switch matrix`

Helper-only tests still pass:

```powershell
node "chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs"
```

Result:

- Exit code `0`.
- `GREEN — order-type live label refresh is decoupled from updatePreviewLines drag throttle`

Step-5 property suite still passes:

```powershell
$env:TALARIA_ORDER_AGGREGATES_V2='1'
node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"
```

Result:

- Exit code `0`.
- `Random seeds with violations: 0 / 50`
- `GREEN — all invariants hold under computeOrderEntryAggregates V2`

## State matrix

| Cell | Result |
| --- | --- |
| Single entry, switches default ON | Real drag callback runs; no `ReferenceError`. |
| Single entry, `__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` ON | Real drag callback runs; no `ReferenceError`. |
| Single entry, `__TALARIA_DISABLE_ORDERTYPE_LIVE_LABEL_FIX` ON | Real drag callback runs; no `ReferenceError`. |
| Single entry, both switches ON | Real drag callback runs; no `ReferenceError`. |
| Multi-entry main leg | Fixed: dragged level is carried as `draggedEntryLevel` and remains in scope for type update. |
| Split entry leg | Unchanged; its own scoped `level` lookup already lives inside the split branch. |
| Replay off/paused/playing | No replay bus or mirror-frame path touched; drag handler uses the same current candle lookup as step 5. |
| Host/panel multichart | No sync policy touched; handler fix is local order-entry scope. |

## Diff summary

Worker-owned changes:

- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `chart v 1.4/chart/modules/order-entry-drag-handler-reference.test.mjs`
- `homepage/public/chart/modules/order-entry-drag-handler-reference.test.mjs`
- `docs/tickets-overhaul/worker-reports/T4-step7-fix-level-referenceerror-report.md`

No build-id files were intentionally modified by this worker.

## Verification

Syntax:

```powershell
node --check "chart v 1.4/chart/modules/order-manager.js"
node --check "chart v 1.4/chart/modules/order-entry-drag-handler-reference.test.mjs"
node --check "chart v 1.4/chart/modules/order-type-live-label-refresh.test.mjs"
```

Result: pass.

Lints:

- `ReadLints` on canonical/public touched files: no linter errors.

Byte identity:

- `order-manager.js`: `E7A5AEC4FCB67B2541A1C5F35C87422EA7B63B2D4E76E3FDE5C6A700BD8969A2`
- `order-entry-drag-handler-reference.test.mjs`: `EB58C52BC0222D47F3CEA93BED6F11D3A705C96C461CD31DB5DF8E4834BA46D2`

Each hash matched between `chart v 1.4/chart/**` and `homepage/public/chart/**`.

## PO spot-check

After Manager build bump:

1. Confirm expected build ID on host and all panels.
2. Open an order draft.
3. Drag entry below market, through market, and above market.
4. Confirm no console `ReferenceError`.
5. Confirm label tracks continuously across `LIMIT` / `MARKET` / `STOP`.
6. Repeat with multi-entry enabled and drag the first entry plus a split leg.
