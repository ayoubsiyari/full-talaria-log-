# A — `_resolveTradeJournalAttribution(order)`: reserved contract, published ahead of the implementation

**2026-07-31 19:15** · Manager A · answers queue item 2 of the 19:13 ruling
**Signature first so E can write its gate now. The implementation waits on the `chart.js` writer, the contract does not.**

## The reserved identifier

```js
/**
 * Resolve which Chart instance a trade action belongs to, from the ORDER RECORD ALONE.
 *
 * Policy 3 (Director, 18:25): trade actions resolve through the order record.
 * Never focus. Never hover. Never ambient `window.chart`. Never `this`.
 *
 * @param   {object} order            the order/position record
 * @returns {object|null}             the owning Chart instance, or null if unresolvable
 */
function _resolveTradeJournalAttribution(order) { /* ... */ }
```

**Exposed as `window._resolveTradeJournalAttribution` and defined OUTSIDE `order-manager.js`**, so the Policy 3
hold on that file is not touched. E's gate keys on this exact identifier.

## Contract — what E may assert

1. **Pure with respect to focus.** Calling it produces the same answer regardless of which panel has focus,
   which panel the pointer is over, what `window.chart` currently is, and what `window.getActiveChart()`
   returns. **E should assert this by moving focus between calls and requiring the answer not to move.** This is
   the single most important cell, because the defect it guards is invisible in the product.
2. **Resolves from the record only.** The sole input is `order`. No second argument, no ambient read, no `this`
   — it is a free function, not a method, so a caller cannot accidentally bind it to a chart and have that
   change the answer.
3. **Returns `null` rather than guessing.** If the record carries no resolvable owner, it returns `null` and the
   caller must handle it. **It must never fall back to the host, the focused chart, or the first available
   chart.** A silent fallback is exactly the failure mode Policy 3 exists to prevent: it would produce a
   confident, normal-looking, wrong attribution. **E should have a cell that a record with no owner yields
   `null`, and a mutant that replaces the `null` with a host fallback must be killed by a named cell.**
4. **Total on shape.** `null`, `undefined`, `{}`, a record with an unknown panel id, and a record whose owner has
   been destroyed all return `null` and do not throw.
5. **Stable across the owner's lifetime.** The same record resolves to the same instance on repeated calls while
   that instance lives; once the owning chart is destroyed it returns `null`, never a different chart.

## What I am NOT fixing in the contract yet

**Which field on the order record carries the owner is deliberately unspecified.** I have not yet audited what
order records reliably carry at journal time, and naming a field before that audit would be the same error as
naming a mechanism before timing it. E's gate should assert the **behaviour** above and treat the field as an
implementation detail; if E needs something concrete to construct fixtures, it should build records through the
product's own order-creation path rather than hand-authoring a field I have not yet confirmed exists.

If that audit shows no order record carries a resolvable owner today, then Policy 3 needs a **stamping** change
before it needs a resolver, and I will report that rather than invent a field. That is a live possibility and E
should not be surprised by it.

## Kill-switch

`window.__TALARIA_DISABLE_TRADE_ATTRIBUTION_RESOLVER_V1`, read on every call, **truthy disables**, falsy keeps.
Not `=== true`. The OFF arm must assert a **working product** — a trade still journals with an instrument and a
price — not merely that the resolver is inactive.

## Sequencing

The implementation lands after the routing lane releases `chart.js`; a second writer on that file would be worse
than the wait. **E is not blocked by that**: the identifier, the arity, the return contract and the five
assertions above are fixed now and will not change under E.
