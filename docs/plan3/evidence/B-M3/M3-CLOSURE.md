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

1. **No working regression gate.** The gate I built was **rejected** at review: 13 of 31 mutations survived, a 30-line stub scored 6/6, one cell was a tautology that passed while the source genuinely collided, and — decisively — re-adding a broad substring selector *alongside* the narrow one went green. **Nothing currently prevents this defect being reintroduced.** Rebuild in flight as B-W10. Under §A16.5 M3 cannot join an automated-GREEN chain until that lands.
2. **`drawing-tools-manager.js` is out of scope.** A's deletions there are separate work. My contradiction does not apply to them and this closure makes no claim about them. That file is a **second writer** of the `orderLines` registry carrying the same undiscriminated-eviction bug; it is covered by the eviction-invariant hand-off to C, not by this.
3. **This is not all of V6-P1.** `updateOrderLines` contains **no creation path**, so once a line is gone, absence is the steady state — restoration must be built, not repaired. This fix stops lines being *wrongly removed*; it does not restore lines already lost. That work is specified separately and still open.
4. **Only the five listed sites.** Other substring selectors elsewhere in the file were not surveyed for this gate.
5. **Registry-level eviction is a different defect** (the `isPending` discriminator, B-W4/B-W5) and is separately handed to C.

## 5. Deployment

**No mirror sync is required, and any request to perform one is withdrawn.** `homepage/Dockerfile` copies `chart v 1.4/chart` into the `chart_assets` stage (line 27) and overwrites `./public/chart/modules` at image build (line 79), with line 6 stating nginx serves fresh assets "not stale committed public/chart". The deployed surface gets this fix automatically.

**Repo hygiene caveat:** the committed `homepage/public/chart/modules/order-manager.js` still carries all five original substring selectors at identical line numbers. It is inert at runtime, but anyone serving `homepage/public` directly, or grepping the repo later, will hit the stale copy and reach the wrong conclusion — as I did.

## 6. Closure condition

M3 closes when the rebuilt gate demonstrates a declared mutation-survival count with no survivor other than a pure stub, **and** catches the re-added-broad-selector case that defeated the first attempt. Until then: **fix shipped, barrier absent.**
