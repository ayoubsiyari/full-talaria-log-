# T4 Lane 3 — Order-entry pure-function aggregate model (step 1)

**Task:** T4 step 1 (RC-5)  
**Worker prompt:** `docs/tickets-overhaul/worker-prompts/T4-lane3-order-entry-model.md`  
**RC:** RC-5 — order-entry state model defects (delta-mutated aggregates)  
**Kill-switch:** `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2` (default unset = V2 ON)  
**Build id:** `20260707b106`  
**Date:** 2026-07-12

---

## Summary

Implemented `computeOrderEntryAggregates(entries[])` as a pure recompute-from-entries model, gated behind `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2`. Node-side property tests were written **RED-first** against a legacy delta simulator mirroring pre-fix `order-manager.js` behavior; they fail on legacy (87 violations), pass on V2 (0 violations), and fail again when the kill-switch is simulated (`TALARIA_ORDER_AGGREGATES_V2=0`).

Both engine trees are byte-identical. This change does **not** touch the replay bus.

---

## 1. Aggregate-mutation sites (`order-manager.js`, both trees)

Paths: `chart v 1.4/chart/modules/order-manager.js` and `homepage/public/chart/modules/order-manager.js` (identical).

| # | Function / site | Lines | Incremental mutation |
|---|-----------------|------:|--------------------|
| 1 | `_syncSplitEntriesFromMultiEntryLevels` — legacy else-branch | 20871–20878 | Delta-updates `splitEntries[].price` only; **stale `percentage`** when entry count unchanged |
| 2 | `_syncSplitEntriesFromMultiEntryLevels` — legacy rebuild branch | 20845–20870 | Rebuilds splits; auto-mutates per-leg `orderType` from live price |
| 3 | `syncMultiEntryToSplitEntries` — legacy path | 21407–21450 | Full split rebuild + auto `orderType` detection per leg |
| 4 | `_rebalanceLevelAmountsToTarget` | 20271–20336 | Scales `multiEntryLevels[].amount` by ratio (delta on risk weights) |
| 5 | `equalizeMultiEntryAmounts` | 20674–20707 | Resets amounts to equal split, then rebalance + sync |
| 6 | `addMultiEntryLevel` | 20602–20638 | Push new level + equalize |
| 7 | `removeMultiEntryLevel` | 20644–20668 | Filter levels + rebalance + sync |
| 8 | Entry drag handler — main entry | 18784–18786, 18789–18837 | Syncs levels; **mutates `this.orderType`** on move vs market (limit→stop) |
| 9 | Entry drag handler — split entry | 18915–18917, 18920–18944 | Syncs levels; **mutates `lineData.orderType` / `splitEntries[].orderType`** on move |
| 10 | `_updateMultiEntryInfoRows` | 20580–20591 | Inline `%` display from current amounts |
| 11 | `updateMultiEntrySummary` | 21298–21334 | Footer avg/qty; legacy path could read stale cached average |
| 12 | `_calcMultiEntryPreviewAvgPrice` | 20716–20733 | Separate weighted-avg path for chart preview line |
| 13 | `_calcMultiEntryAvgPrice` (legacy body) | 20891–20912 | Per-leg lot loop (sound math; invoked without full split resync in delta path) |

**V2 fix wiring (new / guarded):**

| Site | Lines | Behavior when V2 ON |
|------|------:|---------------------|
| `computeOrderEntryAggregates` (pure fn) | 61–121 | Pure `aggregates = f(entries[])` |
| `_orderAggregatesV2Enabled` | 13–15 | Kill-switch check |
| `_buildOrderEntryAggregateOpts` | 20759–20788 | Builds opts for pure fn |
| `_applyOrderEntryAggregatesV2` | 20791–20825 | Applies recompute to `splitEntries` / main entry |
| `_syncSplitEntriesFromMultiEntryLevels` V2 gate | 20831–20833 | Delegates to `_applyOrderEntryAggregatesV2` |
| `syncMultiEntryToSplitEntries` V2 gate | 21394–21401 | Short-circuit before legacy rebuild |
| `_calcMultiEntryAvgPrice` V2 gate | 20887–20889 | Reads from `computeOrderEntryAggregates` |
| Drag handlers — type auto-detect | 18791, 18922 | Skipped when V2 (`!_orderAggregatesV2Enabled()`) |

**Sound math (not the defect — cited in RC-5):** `_calcLevelLotSizeNumeric` (~20461), `estimatePnLForPriceLevel` (~3170).

---

## 2. Property-test files

| File | Path (both trees) |
|------|-------------------|
| Pure model + legacy simulator | `chart/modules/order-entry-aggregates.mjs` |
| Property harness | `chart/modules/order-entry-aggregates.property.test.mjs` |

Canonical tree: `chart v 1.4/chart/modules/`  
Mirror tree: `homepage/public/chart/modules/`

**Run commands:**

```bash
# RED — legacy delta model (pre-fix behavior)
node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"

# GREEN — V2 pure recompute
TALARIA_ORDER_AGGREGATES_V2=1 node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"

# RED again — kill-switch simulated
TALARIA_ORDER_AGGREGATES_V2=0 node "chart v 1.4/chart/modules/order-entry-aggregates.property.test.mjs"
```

**Invariants asserted over randomized add/move/delete sequences:**

1. Average entry price ∈ [min entry, max entry]
2. Risk split sums to configured total (100% in risk-percent mode; single-entry restore → 100%)
3. **Revised by D-005 / T4 step 5:** on move, order type always equals the correct classification for its price relative to market, per side. Source quote, TAL-00752 message #17: *"When I add more than one entry and move the second entry, its location changes and it remains called a market order, even if it was a limit order."*
4. PNL sign correct relative to entry side (no positive PNL below a long entry)

---

## 3. RED evidence (before fix — legacy delta model)

**Command:** `node order-entry-aggregates.property.test.mjs` (default, no env var)  
**Result:** **87 violation events**, 34/50 random seeds fail.  
**Captured:** `docs/tickets-overhaul/T4-lane3-RED-legacy.txt`

### Deterministic failing sequence: `limit-main-crosses-market`

```
op: {"type":"move","id":1,"price":1.105}
  [main-type-mutated] main order type mutated limit → stop
  [leg-type-mutated] leg 2 type mutated to stop (expected limit)
  state: {"averageEntry":1.086667,"riskSplitSum":100,"mainOrderType":"stop",
          "legs":[{"id":2,"price":1.085,"pct":50,"type":"stop","pnl":1000},
                  {"id":1,"price":1.105,"pct":50,"type":"stop","pnl":-200}]}
```

### Random seed 7 (excerpt)

After add → rebalance → move chain:

```
[avg-in-range] average 1.0832501428478587 not in [1.0812391651514919, 1.0829284315027763]
```

After subsequent move of leg 2 above market:

```
[main-type-mutated] main order type mutated limit → stop
[leg-type-mutated] leg 3 type mutated to stop (expected limit)
```

---

## 4. GREEN evidence (after fix — V2 ON)

**Command:** `TALARIA_ORDER_AGGREGATES_V2=1 node order-entry-aggregates.property.test.mjs`  
**Result:** **0 violation events**, 0/50 random seeds fail.  
**Captured:** `docs/tickets-overhaul/T4-lane3-GREEN-v2.txt`

```
pass (known): limit-main-crosses-market
pass (known): delete-then-delta-stale-split
pass (known): move-below-mark-positive-pnl

Random seeds with violations: 0 / 50
Total violation events: 0

GREEN — all invariants hold under computeOrderEntryAggregates V2
```

**Browser:** V2 active when `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2` is **unset**. Production code routes all multi-entry mutations through `_applyOrderEntryAggregatesV2()`.

---

## 5. RED again with kill-switch

**Browser kill-switch:** `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2 = true` restores all legacy delta paths (sites in §1, rows 1–13).

**Test harness simulation:** `TALARIA_ORDER_AGGREGATES_V2=0` selects the legacy delta simulator in the property test.

**Result:** **87 violation events** (identical to pre-fix RED — non-vacuous).

```
FAIL (known): limit-main-crosses-market
  [main-type-mutated] main order type mutated limit → stop
Random seeds with violations: 34 / 50
Total violation events: 87
RED — legacy delta model violates invariants (expected before fix)
```

---

## 6. State matrix (I5)

| Cell | Replay bus? | Changed? |
|------|-------------|----------|
| Single chart, replay off | No | **Yes** — multi-entry preview aggregates |
| Single chart, replay playing | No | **Yes** — order panel preview only |
| Single chart, replay paused | No | **Yes** — order panel preview only |
| Multichart host order rail | No | **Yes** — same `order-manager.js` |
| Multichart panel iframe | No | **Yes** — panel loads mirrored module |
| Replay mirror frame / `applyReplayFrame` | — | **No** |
| Filled open-position split math (`_getSplitGroupAvgEntry`) | No | **No** |
| Trade journal / closed positions | No | **No** |

**Explicit:** Core aggregate recompute is math-only on the order-entry preview state. It does **not** write to or read from the replay bus. I11 safe — no new mirror-frame guards.

---

## 7. SHA256 — both `order-manager.js` trees

| Tree | Path | SHA256 |
|------|------|--------|
| Canonical | `chart v 1.4/chart/modules/order-manager.js` | `F71824F55AA96CA6CF4B3BF205F1B4A5AE816437C6CC6271D47FD1C1655B26DA` |
| Mirror | `homepage/public/chart/modules/order-manager.js` | `F71824F55AA96CA6CF4B3BF205F1B4A5AE816437C6CC6271D47FD1C1655B26DA` |

**Match:** byte-identical (I8).

Supporting modules (also mirrored):

| Pair | SHA256 |
|------|--------|
| `order-entry-aggregates.mjs` | `527FE6846E920EC7C26F2EE0F4DFB11B692ED97F51097DBEECC98B0BBB127807` |

---

## 8. Build id

| Before | After |
|--------|-------|
| `20260707b105` | **`20260707b106`** |

Bumped via `chart v 1.4/talaria-design/scripts/bump-dist-v9-cache.mjs --live --dist`.

`node --check` clean on `order-manager.js`, `order-entry-aggregates.mjs`, `order-entry-aggregates.property.test.mjs`.

---

## 9. TAL-00752 registry disposition

TAL-00752 is a 22-message multi-bug thread (~20 distinct sub-bugs per `TICKET-ANALYSIS.md` §2). This gated step addresses the **aggregate math / type-on-move** family only.

### Closed by this change (`__TALARIA_DISABLE_ORDER_AGGREGATES_V2` unset)

| Sub-bug family | Tester symptom (paraphrased) | Mechanism discharged |
|----------------|------------------------------|----------------------|
| Multi-entry averaging | Average stuck on deleted entry's price after add/delete/move | Stale `cachedAverage` in delta sync path; V2 recomputes from `entries[]` |
| Risk split | 50/50 doesn't revert to 100% on entry delete | Stale `splitEntries[].percentage` in delta else-branch; V2 recomputes risk split |
| Order type mutation | Limit order mutates to stop/market when entry line dragged | Auto-detect on drag (`order-manager.js:18789–18837`, `18920–18944`); guarded off under V2 |
| PNL sign | Positive PNL shown while price below long entry | Per-leg PNL derived from stale aggregate state; V2 computes per-leg from current entries |

### Deferred to later gated step (NOT bundled here)

| Sub-bug family | Reason deferred |
|----------------|-----------------|
| SL/TP below 10 not rendered on chart | Display-threshold bug — separate gated fix per T4 track step 2 |
| Trailing-zero parsing zeroes lot on SL/TP inputs | Parsing/formatting bug — separate gated fix |
| SL/TP arithmetic edge cases (non-aggregate) | Math is sound per RC-5 evidence (`:18332`, `:38143`); any remaining arithmetic rows need per-row triage |
| Replay-interaction (entry fills wrong candle, TP flicker) | Touches replay bus — RED-first harness scenarios + state matrix required |
| Ghost artifacts after delete (labels/lines) | Symptom overlaps RC-1/RC-2; not RC-5 aggregate mechanism |

---

## 10. Manager re-verification (P1)

- [ ] Re-run property test: RED (default) / GREEN (`TALARIA_ORDER_AGGREGATES_V2=1`) / RED-again (`=0`)
- [ ] Confirm build `20260707b106` on host frame before live retest (L1)
- [ ] Live spot-check: multi-entry 50/50 → delete one leg → footer shows 100%; drag limit entry across market → type stays limit
- [ ] Set `window.__TALARIA_DISABLE_ORDER_AGGREGATES_V2 = true` in console → legacy delta behavior returns
- [ ] Multichart 29-scenario gate unchanged (I9)
