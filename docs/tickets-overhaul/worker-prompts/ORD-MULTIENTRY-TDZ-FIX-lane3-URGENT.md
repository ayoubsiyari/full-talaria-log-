# Lane 3 — URGENT regression fix: multi-entry TDZ crash (`splitOrderType` before initialization)

## Defect (PO live, hard crash)
`Uncaught ReferenceError: Cannot access 'splitOrderType' before initialization` at `order-manager.js:18687`/`18706`, thrown from `updatePreviewLines` → cascades to `syncMultiEntryToSplitEntries`, `equalizeMultiEntryAmounts`, `addMultiEntryLevel`, `setEntryMode`, `_applyPreviewActivator`. Breaks the entire multi-entry order path. Regression from the preview-label refactor.

## Root (confirmed, read-only)
`chart v 1.4/chart/modules/order-manager.js` ~18706-18707 — the two `const`s are inverted; `splitColor` reads `splitOrderType` before it is declared (temporal dead zone):

```js
const splitColor = _resolvePreviewEntryColor(this.orderSide, splitOrderType); // 18706 — USES it
const splitOrderType = splitEntry.orderType || this.orderType;                 // 18707 — DECLARES it
```

## Fix (minimal, no behavior change, no kill-switch — this is a crash regression)
Swap the two lines so the declaration precedes the use:

```js
const splitOrderType = splitEntry.orderType || this.orderType;
const splitColor = _resolvePreviewEntryColor(this.orderSide, splitOrderType);
```

## Constraints
- Edit `order-manager.js` in **BOTH trees** (I8): `chart v 1.4/chart/modules/` + `homepage/public/chart/modules/`.
- Do NOT change the label/color logic — only the declaration order.
- **Verify no other TDZ:** confirm the other `splitOrderType` sites (13258, 20476, 25654) declare-before-use (they do); grep for any other "use-before-const" in the touched function.
- Rebuild `dist-v9` (both trees) so the PO can live-verify — this is a served-bundle crash, source-only won't help testing.

## Proof
- Before: multi-entry (add entry level / set entry mode) throws the ReferenceError in console.
- After: add multi-entry levels, set entry mode, drag split entries → no ReferenceError; preview lines + labels render.
- Include console-clean evidence (before/after) for the add-multi-entry flow.

## Deliverable
`docs/tickets-overhaul/worker-reports/ORD-MULTIENTRY-TDZ-FIX-report.md`: the 2-line swap (both trees), dist rebuild confirmation, before/after console evidence, file-scoped commit hash. NEEDS-LIVE (PO: set multi-entry, confirm no crash + preview renders).
