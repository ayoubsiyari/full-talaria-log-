# Ship gate M3 — closure stamp

**Row:** V6-P1 (order lines partially disappearing)
**Manager:** B
**Status:** product fix ACCEPTED and merged; **gate not yet load-bearing** — M3 is not closed.

M3 states: *order lines do not vanish and do not cross-delete siblings.* This document records exactly which part of that is now true, which part is not, and what the evidence does and does not license. It is deliberately narrower than the row title.

---

## 1. The defect

Five removal sites in `order-manager.js` selected DOM by **substring** match on an interpolated order id:

```js
[class*="pending-tp-${orderId}"]
```

CSS `[class*=...]` is a substring test, not a token test. `[class*="pending-tp-1"]` therefore matches `pending-tp-12`. Removing order 1's parts also removed order 12's.

Every order id is a prefix of some other reachable id — ids are `orderIdCounter++` integers from 1 — so this is not an edge case. It fires whenever two live orders have prefix-related ids, which for ids 1 and 12 means as soon as twelve orders have existed in a session.

**Reproduced in real Edge** before the fix, and cured after. This is the first mechanism on the board that explains the PO's own report of order lines *partially* disappearing: partial is exactly what a sibling-eviction bug produces, because only the parts whose class strings collide are removed.

## 2. The fix

Five selectors narrowed from substring to class-token form, one line each:

| # | Line | Before | After |
|---|---|---|---|
| 1 | ~39148 | `[class*="pending-tp-pct"][class*="pending-tp-${orderId}"]` | `.pending-tp-pct-control.pending-tp-${orderId}` |
| 2 | ~41707 | `[class*="open-tp-pct"][class*="tp-${oid}"]` | `.open-tp-pct-control.tp-${oid}` |
| 3 | ~41708 | `[class*="pending-tp-pct"][class*="pending-tp-${oid}"]` | `.pending-tp-pct-control.pending-tp-${oid}` |
| 4 | ~41709 | `[class*="pending-tp-delete"][class*="pending-tp-${oid}"]` | `.pending-tp-delete.pending-tp-${oid}` |
| 5 | ~41712 | `[class*="multi-tp-avg-"][class*="-${oid}"]` | `.multi-tp-avg-${oid}` |

Five insertions, five deletions, one file. No other product change.

## 3. What the evidence licenses

Independently verified at top tier (B-R3), by reading rather than by re-running my tests:

- Each new selector matches a **strict subset** of the old one, so the change can only remove *less*, never more.
- The producer inventory is **complete** — these four class families are produced only at `order-manager.js` 37012/37020/37026/37034/37040, 38558, 38586, 42589, 44047. Nothing is stranded.
- The TP-percent stepper is one `<g>` whose children carry `tp-pct-stepper-*` classes with no `pending-tp-pct`/`open-tp-pct` token and no order id. The old broad selector never matched them either; they die with the parent.
- Order ids are CSS-token-safe integers. The non-integer ids that exist (`__preview__`, `splitgrp_*`) never reach these selectors — their removal goes through tracked D3 handles in `_destroyMultiTPAvgEntry`.
- Seven pre-existing class-token selectors using identical interpolation already run **before** the changed lines, so the change introduces no new id-shape exposure.

## 4. What this does NOT cover — read this before treating M3 as closed

1. **The gate covers reintroduction, with one known residual.** The first attempt was rejected — 13 of 31 mutations survived, a stub scored 6/6, one cell was a tautology that passed while the source collided, and re-adding a broad selector *beside* the narrow one went green. It was rebuilt three times and now stands at **31 designed / 1 survived**, the survivor being a pure stub, over three identical runs.

   Its barrier is a **closed exact-literal allowlist**: any `[class*=` in a `selectAll` argument fails unless it is one of the 20 literal arguments legitimately present today. That replaced an allowlist of *identifier names*, which I attacked and found leaked 5 of 7 regression forms — including `${ol.orderId}`, where `ol` is the variable name this file uses in its own eviction predicates. All seven forms are now permanent mutants.

   I verified the 20 blessed literals are legitimate rather than taking that on trust. The broad ones — `[class*="multi-tp-avg-"]`, `[class*="split-avg-"]` — live in `_stripOrderDrawingLayersFromChart`, a **whole-chart teardown** where removing every order's elements is the intended behaviour, not a per-order path.

   **Residual, stated because it is real:** the allowlist is keyed on *argument text*, not on the *call site*. Relocating one of the 20 broad teardown literals into a per-order removal path would pass. That is a narrower hole than the one it replaced and it requires a deliberate move rather than a plausible slip, but it is not closed.
2. **`drawing-tools-manager.js` is out of scope.** A's deletions there are separate work. My contradiction does not apply to them and this closure makes no claim about them. That file is a **second writer** of the `orderLines` registry carrying the same undiscriminated-eviction bug; it is covered by the eviction-invariant hand-off to C, not by this.
3. **This is not all of V6-P1.** `updateOrderLines` contains **no creation path**, so once a line is gone, absence is the steady state — restoration must be built, not repaired. This fix stops lines being *wrongly removed*; it does not restore lines already lost. That work is specified separately and still open.
4. **Only the five listed sites.** Other substring selectors elsewhere in the file were not surveyed for this gate.
5. **Registry-level eviction is a different defect** (the `isPending` discriminator, B-W4/B-W5) and is separately handed to C.

## 5. Deployment

**No mirror sync is required, and any request to perform one is withdrawn.** `homepage/Dockerfile` copies `chart v 1.4/chart` into the `chart_assets` stage (line 27) and overwrites `./public/chart/modules` at image build (line 79), with line 6 stating nginx serves fresh assets "not stale committed public/chart". The deployed surface gets this fix automatically.

**Repo hygiene caveat:** the committed `homepage/public/chart/modules/order-manager.js` still carries all five original substring selectors at identical line numbers. It is inert at runtime, but anyone serving `homepage/public` directly, or grepping the repo later, will hit the stale copy and reach the wrong conclusion — as I did.

## 6. Closure

The condition set when this document was written was: a declared mutation-survival count with no survivor other than a pure stub, **and** the re-added-broad-selector case caught. Both are met — 31 designed / 1 survived, stub only, and the re-added case dies on the exact-literal allowlist.

**M3's cross-delete half is closed.** Fix shipped, barrier in place, coverage boundary stated in §4.

Two things a reader should carry away rather than infer:

- **The "vanish" half of M3 is not closed** (§4.3). This fix removes a *cause* of loss; it does not add *recovery*. `updateOrderLines` still has no creation path, so a line already lost stays lost.
- **A green from this gate is a statement about `order-manager.js` selector shapes**, not about order-line behaviour in general. The browser oracle carries real product-shaped collision evidence, but for a source regression the static allowlist fails first — so in practice the barrier is structural. Stamped not-behaviour-covering per §A4b.
