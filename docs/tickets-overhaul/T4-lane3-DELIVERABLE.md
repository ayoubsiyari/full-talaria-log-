# T4 Lane 3 Step 1 — Order-entry pure-function aggregate model (RC-5)

**Worker:** Lane 3 (orders)  
**RC:** RC-5 — order-entry state model defects  
**Kill-switch:** `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2` (default unset = V2 ON)  
**Build id:** `20260707b106`

---

## 1. Aggregate-mutation sites found (`order-manager.js`)

| Site | Lines (approx.) | What it mutates incrementally |
|------|-----------------|------------------------------|
| `_syncSplitEntriesFromMultiEntryLevels` | 20822–20910 | Delta-updates `splitEntries[].price` only; **stale `percentage`** when count unchanged (RC-5 delta path) |
| `syncMultiEntryToSplitEntries` | 21371–21450 | Rebuilds splits but auto-mutates `orderType` per leg from live price |
| `_rebalanceLevelAmountsToTarget` | 20265–20336 | Scales `multiEntryLevels[].amount` by ratio (delta on weights) |
| `equalizeMultiEntryAmounts` | 20668–20702 | Resets amounts to equal split then rebalance |
| `removeMultiEntryLevel` | 20638–20663 | Filter + `_rebalanceLevelAmountsToTarget` + `syncMultiEntryToSplitEntries` |
| `addMultiEntryLevel` | 20596–20633 | Push + `equalizeMultiEntryAmounts` |
| Entry drag handler (main) | 18789–18837 | **Mutates `this.orderType`** on move vs market (limit→stop) |
| Split entry drag handler | 18917–18942 | **Mutates `lineData.orderType` / `splitEntries[].orderType`** on move |
| `_updateMultiEntryInfoRows` | 20574–20591 | Inline `%` from current amounts (display only) |
| `updateMultiEntrySummary` | 21292–21330 | Footer avg/qty from `_calcMultiEntryAvgPrice` (could read stale cache in legacy delta path) |
| `_calcMultiEntryPreviewAvgPrice` | 20710–20733 | Separate weighted-avg path for chart preview line |

**Pure math (sound, not the defect):** `_calcLevelLotSizeNumeric` (~20461), `estimatePnLForPriceLevel` (~3170), placement validation (~23541).

---

## 2. Property tests + RED evidence (before fix)

**Files (both trees, byte-identical pairs):**

- `chart/modules/order-entry-aggregates.mjs` — pure `computeOrderEntryAggregates` + legacy delta simulator
- `chart/modules/order-entry-aggregates.property.test.mjs` — Node property harness (zero deps)

**Run:**

```bash
node chart\ v\ 1.4\chart\modules\order-entry-aggregates.property.test.mjs
```

**RED result (legacy delta model):** 87 violation events across 34/50 random seeds + deterministic sequences.

Captured: `docs/tickets-overhaul/T4-lane3-RED-legacy.txt`

**Deterministic failing sequences (examples):**

1. **`limit-main-crosses-market`** — move E1 from 1.0900 → 1.1050 (above market 1.1000): `main-type-mutated limit → stop`
2. **Random seed 7** — after add/rebalance/move/delete chain: `avg-in-range` (cached average 1.08325 outside [1.08124, 1.08293]) and `main-type-mutated`

**Invariants tested:**

- Average entry ∈ [min entry, max entry]
- Risk split sums to 100 (risk-percent mode)
- Order type never mutates on move (limit stays limit)
- PNL sign: no positive PNL below long entry at mark

---

## 3. `computeOrderEntryAggregates` implementation + GREEN evidence

**Mechanism:** `computeOrderEntryAggregates(entries[], opts)` — pure recompute of average, risk split, per-leg type/PNL from the entry list. Wired via:

- `_applyOrderEntryAggregatesV2()` — applies aggregates to `splitEntries` / main entry
- `_syncSplitEntriesFromMultiEntryLevels()` — delegates to V2 when enabled
- `syncMultiEntryToSplitEntries()` — V2 short-circuit before legacy rebuild
- `_calcMultiEntryAvgPrice()` — reads from `computeOrderEntryAggregates` when V2
- Drag handlers — order-type auto-detect **skipped** when V2 (preserves leg type)

**Kill-switch:** `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2` restores all legacy delta paths.

**GREEN run:**

```bash
TALARIA_ORDER_AGGREGATES_V2=1 node chart\ v\ 1.4\chart\modules\order-entry-aggregates.property.test.mjs
```

**Result:** 0 violations / 50 random seeds. Captured: `docs/tickets-overhaul/T4-lane3-GREEN-v2.txt`

**RED-again (kill-switch):**

```bash
TALARIA_ORDER_AGGREGATES_V2=0 node chart\ v\ 1.4\chart\modules\order-entry-aggregates.property.test.mjs
```

**Result:** 87 violations (non-vacuous — same as pre-fix legacy).

---

## 4. State matrix (I5)

| Cell | Touches replay bus? | Changed? |
|------|---------------------|----------|
| Single chart, replay off | No | **Yes** — multi-entry preview aggregates |
| Single chart, replay playing/paused | No | **Yes** — same (order panel preview only) |
| Multichart host | No | **Yes** — host order rail / panel |
| Multichart panel iframe | No | **Yes** — panel loads same `order-manager.js` |
| Replay mirror frame / `applyReplayFrame` | No | **No** |
| Filled position / journal aggregates | No | **No** — open-position split math (`_getSplitGroupAvgEntry`) unchanged |

**Explicit:** This change does **not** touch the replay bus or mirror-frame application path (I11 safe).

---

## 5. Byte-identical trees + build + checks

| Pair | SHA256 |
|------|--------|
| `chart v 1.4/chart/modules/order-manager.js` ↔ `homepage/public/chart/modules/order-manager.js` | `F71824F55AA96CA6CF4B3BF205F1B4A5AE816437C6CC6271D47FD1C1655B26DA` |
| `chart v 1.4/chart/modules/order-entry-aggregates.mjs` ↔ `homepage/public/chart/modules/order-entry-aggregates.mjs` | `527FE6846E920EC7C26F2EE0F4DFB11B692ED97F51097DBEECC98B0BBB127807` |
| `order-entry-aggregates.property.test.mjs` (both trees) | Mirrored via copy (run Manager SHA256 if needed) |

- **Build id bumped:** `20260707b105` → `20260707b106` via `bump-dist-v9-cache.mjs --live --dist`
- **`node --check`:** clean on `order-manager.js`, `order-entry-aggregates.mjs`, `order-entry-aggregates.property.test.mjs`

---

## 6. TAL-00752 registry disposition

### Closed by this gated change (aggregate math / type-on-move family)

- Average entry stuck on deleted entry's price after add/delete/move sequences
- Risk split 50/50 not restoring to 100% on entry delete (recompute-from-entries)
- Limit order mutating to stop/market when entry line dragged across market
- PNL sign wrong (positive PNL below long entry) from stale per-leg aggregate state

### Deferred to later gated step (display-threshold / parsing — **not bundled here**)

- SL/TP below 10 not rendered on chart
- Trailing-zero parsing zeroes lot size on SL/TP inputs
- Replay-interaction rows (entry fills on wrong candle, TP line flicker per candle) — separate harness scenarios per T4 track

---

## 7. Manager re-verification checklist (P1)

- [ ] Re-run property test RED (default) / GREEN (`TALARIA_ORDER_AGGREGATES_V2=1`) / RED-again (`=0`)
- [ ] Confirm build `20260707b106` on host frame before live retest
- [ ] Spot-check TAL-00752: multi-entry 50/50 → delete one leg → footer shows 100%; drag limit entry across market → type stays limit
- [ ] Set `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2 = true` → legacy behavior returns
