# T4 step 5 order-type reclassification report

## Scope

Prompt: `docs/tickets-overhaul/worker-prompts/T4-step5-order-type-reclassify.md`

Authorization: D-005.

Kill-switch: `window.__TALARIA_DISABLE_ORDER_TYPE_RECLASSIFY_V2` (default unset = fix ON). Node property kill-switch equivalent: `TALARIA_ORDER_TYPE_RECLASSIFY_V2=0`.

No build bump was run.

## Revised invariant #3

**Invariant #3:** On move, order type always equals the correct classification for its price relative to market, per side.

Source evidence, TAL-00752 message #17: *"When I add more than one entry and move the second entry, its location changes and it remains called a market order, even if it was a limit order."*

This replaces the old step-1 invariant that froze order type on move.

## Mechanism

Decision points:

- Pure aggregate/property model: `chart v 1.4/chart/modules/order-entry-aggregates.mjs`, `classifyOrderTypeForPrice()` and `computeOrderEntryAggregates()`.
- Runtime aggregate path: `chart v 1.4/chart/modules/order-manager.js`, `_classifyOrderTypeForPrice()` and `computeOrderEntryAggregates()`.
- Single/main entry drag: `chart v 1.4/chart/modules/order-manager.js`, main entry drag block reclassifies `self.orderType`, updates buttons/place text, and re-renders the entry label.
- Split/multi-entry drag: `chart v 1.4/chart/modules/order-manager.js`, split entry drag block reclassifies `lineData.orderType`, updates `splitEntries[]` / `multiEntryLevels[]`, and re-renders `Entry#N:<type>`.
- Programmatic/multi-entry sync: `_applyOrderEntryAggregatesV2()` now writes per-leg `orderType` from the classifier, independent of the aggregate switch's prior freeze semantics.

Classification:

- Buy below market => `limit`; buy above market => `stop`; buy at market => `market`.
- Sell above market => `limit`; sell below market => `stop`; sell at market => `market`.
- Multi-entry legs classify independently by each leg price.

At-market tolerance: exactly **1 price tick**. In code, one price tick is `tickSize || pipSize || 0.0001`; this satisfies I12 with a single unit.

## RED/GREEN/RED-again

RED first, after replacing the old invariant tests and before the fix:

```powershell
$env:TALARIA_ORDER_AGGREGATES_V2='1'
node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"
```

Result:

- Exit code `1`.
- `ERROR: V2 mode must be GREEN (0 violations)`.
- Violations included `order-type-reclassify` for:
  - `buy-zones-limit-market-stop`
  - `sell-zones-limit-market-stop`
  - `buy-zone-crossing-drag`
  - `multi-entry-legs-classify-independently`

GREEN after fix:

```powershell
$env:TALARIA_ORDER_AGGREGATES_V2='1'
node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"
```

Result:

- Exit code `0`.
- `pass (order-type): buy-zones-limit-market-stop`
- `pass (order-type): sell-zones-limit-market-stop`
- `pass (order-type): buy-zone-crossing-drag`
- `pass (order-type): multi-entry-legs-classify-independently`
- `Random seeds with violations: 0 / 50`
- `GREEN — all invariants hold under computeOrderEntryAggregates V2`

RED-again with only the new kill-switch disabled:

```powershell
$env:TALARIA_ORDER_AGGREGATES_V2='1'
$env:TALARIA_ORDER_TYPE_RECLASSIFY_V2='0'
node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"
```

Result:

- Exit code `1`.
- `ERROR: V2 mode must be GREEN (0 violations)`.
- `Total violation events: 53`.
- This proves the reclassification switch is decoupled from `TALARIA_ORDER_AGGREGATES_V2`.

## State matrix

| Cell | Behavior change |
| --- | --- |
| Single chart, replay off | Changed: entry drag reclassifies `limit` / `market` / `stop` and label/buttons update. |
| Single chart, replay paused | Changed: same classifier, using current replay candle price as market. |
| Single chart, replay playing | Changed: same classifier on move; no replay bus touched. |
| Multichart host/panel, sync on | Changed only for order-entry drag/sync state; each visible order leg classifies by its own price vs market. |
| Multichart host/panel, sync off | Changed only for local order-entry state; no mirror-frame or sync policy path touched. |
| Multi-entry legs | Changed: each leg classifies independently. |
| Aggregate math | Unchanged except `orderType` field classification; average/risk/PNL math preserved. |
| SL/TP display/parse helpers | Unchanged. |

## Registry and docs

- Updated `docs/tickets-overhaul/PER-BUG-REGISTRY.csv` on the order-type row with a D-005 note and the new kill-switch.
- Revised invariant #3 wording in `docs/tickets-overhaul/worker-reports/T4-lane3-order-entry-model-report.md`, including the TAL-00752 #17 source quote.

## Diff summary

Worker-owned changes:

- `chart v 1.4/chart/modules/order-entry-aggregates.mjs`
- `homepage/public/chart/modules/order-entry-aggregates.mjs`
- `chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs`
- `homepage/public/chart/modules/order-entry-aggregates.property.test.mjs`
- `chart v 1.4/chart/modules/order-manager.js`
- `homepage/public/chart/modules/order-manager.js`
- `docs/tickets-overhaul/PER-BUG-REGISTRY.csv`
- `docs/tickets-overhaul/worker-reports/T4-lane3-order-entry-model-report.md`
- `docs/tickets-overhaul/worker-reports/T4-step5-order-type-reclassify-report.md`

Pre-existing modified manager/director docs were present in the working tree and were not part of this worker's implementation diff.

## Verification

Syntax:

```powershell
node --check "chart v 1.4/chart/modules/order-manager.js"
node --check "chart v 1.4/chart/modules/order-entry-aggregates.mjs"
node --check "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"
```

Result: pass.

Lints:

- `ReadLints` on canonical/public touched JS files: no linter errors.

Byte identity:

- `order-manager.js`: `BCEE433338BDD21CF6D61E1C5378DDDA85214117B3752881243146257D7C8C1F`
- `order-entry-aggregates.mjs`: `F3A652BB23AB88198AB16065D9D672CC2FC4A4EA20868EE4117D74CDA47DAC31`
- `order-entry-aggregates.property.test.mjs`: `C38D70F05624B8C30219BA658F8151CB908BC1EDC971848C15056A9C701CEE10`

Each hash matched between `chart v 1.4/chart/**` and `homepage/public/chart/**`.

## PO spot-check

Live check after Manager build bump:

1. Confirm expected build ID on host and all panels.
2. Create a buy order entry.
3. Drag the buy entry below market: label/button should show `Limit`.
4. Drag the same entry to within **1 price tick** of market: label/button should show `Market`.
5. Drag the same entry above market: label/button should show `Stop`.
6. Repeat with a second multi-entry leg and confirm the moved leg reclassifies independently.
