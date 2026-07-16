# T4 — Order-interaction landing Phases 3→4 (Lane 3)

## 1. Task + RC

- **Task:** T4 order-interaction Phases 3→4 — continue D-020 series after Phases 0–2 (`84926d3e`, `b50d45d4`, `b6b4473d`).
- **RC:** **RC-5** (order-entry interaction). Discharges **RC5-OI-3** (#5 / TAL-00752#5) and **RC5-OI-4** (A6-3 order-half / TAL-01615) at dev/property-test level.
- **Scope:** Freeze-safe `order-manager.js` + `order-interaction-guard.mjs` only. Chart-half A6-3 flag deferred.

**Series status:** Freeze-safe order-interaction landing **Phases 0–4 complete**. Next separate task: **A6-2 F5 persist** (chart.js hooks).

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `chart v 1.4/chart/modules/order-interaction-guard.mjs` | Added `#5` / `A6-3` switch resolvers, `shouldRefreshDraftGeometryOnly`, `syncPreviewLinePriceFromStore`, `previewLineYFromStorePrice`, `shouldBlockOrderStoreWriteDuringAxisGesture`, `simulateOpenLineDragStoreWrite`. |
| `homepage/public/chart/modules/order-interaction-guard.mjs` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/order-interaction-guard.test.mjs` | RC5-OI-3 + RC5-OI-4 property tests; switch A/B paths. |
| `homepage/public/chart/modules/order-interaction-guard.test.mjs` | **I8 mirror** — byte-identical. |
| `chart v 1.4/chart/modules/order-manager.js` | **Phase 3:** `_orderDraftScaleRefreshFixEnabled`, `_oiSyncPreviewLinePricesFromStore`, `onChartViewportChanged`, geometry-only paths in `updatePreviewLinePositions` / `refreshDraftPreviewForActivePanel` / `_scheduleDraftPreviewRedrawIfNeeded`; limit/stop replay sync uses position refresh when type unchanged. **Phase 4:** `_orderPriceAxisIsolationFixEnabled`, `_oiIsChartAxisGestureActive`, store-write blocks in `makeLineDraggable` + multi-TP drag during simulated axis gesture. |
| `homepage/public/chart/modules/order-manager.js` | **I8 mirror** — byte-identical. |

**No other product files touched.** `chart.js`, `replay-system.js`, `known-failing.json` untouched.

---

## 3. Kill-switch (I3 + I13)

| Switch | Default | Gated paths |
|--------|---------|-------------|
| `window.__TALARIA_DISABLE_ORDER_DRAFT_SCALE_REFRESH_FIX` | ON | `_oiSyncPreviewLinePricesFromStore`, `_oiShouldRefreshDraftGeometryOnly`, `onChartViewportChanged`, limit/stop `_syncPreviewToReplayPrice` position-only path |
| `window.__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX` | ON | `_oiShouldBlockStoreWriteDuringAxisGesture` → `makeLineDraggable` entry/SL/TP/BE + multi-TP drag store writes |

Both require master `__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2` ON (unset).

**Revert:** `#5` OFF → legacy full `updatePreviewLines()` on limit/stop replay ticks; no store re-sync before geometry refresh. `A6-3` OFF → live store writes during axis gesture (legacy invert→store on drag paths).

Env mirrors: `TALARIA_ORDER_DRAFT_SCALE_REFRESH_FIX=0`, `TALARIA_ORDER_PRICE_AXIS_ISOLATION_FIX=0`.

---

## 4. Proof — RED → GREEN

### Commands

```text
node "chart v 1.4/chart/modules/order-interaction-guard.test.mjs"
node --check "chart v 1.4/chart/modules/order-manager.js"
TALARIA_ORDER_DRAFT_SCALE_REFRESH_FIX=0 node "chart v 1.4/chart/modules/order-interaction-guard.test.mjs"
```

### Phase 3 — RC5-OI-3 (#5)

| | |
|--|--|
| **Actuation (dev)** | Property: drifted `previewLines.entry.price` vs store `#orderEntryPrice`; yScale change simulates keyboard pan. |
| **Measure** | `syncPreviewLinePriceFromStore` restores store price; `previewLineYFromStorePrice` reprojects Y on new scale; `shouldRefreshDraftGeometryOnly` true during provisional preview. |
| **GREEN** | `36 passed, 0 failed` (RC5-OI-3 section) |
| **RED (#5 OFF)** | `TALARIA_ORDER_DRAFT_SCALE_REFRESH_FIX=0` → `34 passed, 2 failed` (`#5 default ON`, `geometry-only during provisional preview`) |
| **I15** | End-state = store entry numeric + line Y from store price — not offsetX call-count. |

### Phase 4 — RC5-OI-4 (A6-3 order-half)

| | |
|--|--|
| **Actuation (dev)** | Simulated `chart._isPriceAxisZoomDragging() === true` during open-line drag invert→store. |
| **Measure** | `openPrice` / `stopLoss` unchanged when fix ON; mutates when `__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX` set. |
| **GREEN** | `simulateOpenLineDragStoreWrite` blocked + store invariant assertions pass |
| **RED (A6-3 OFF)** | Same helper returns `true` (store mutated to inverted price) |
| **Note** | Chart-half `_isPriceAxisZoomDragging` setter not added — OM reads probe only; live axis drag needs post-combined-build chart PR. |

### chart.js dependency (#5) — **NOT required for freeze-safe slot**

Existing `chart.js` paths already invoke OM on viewport change:

- `render()` → `orderManager.updatePreviewLinePositions()` (~26400)
- `_syncOrderOverlaysDuringPan()` → `updateOrderLines` + `updatePreviewLinePositions` (~25659)

`onChartViewportChanged()` added as optional thin hook for future callers; **no chart.js edit committed.** If live RED still fails after combined build, schedule a one-line `onChartViewportChanged` micro-slot — flagged for Manager only.

---

## 5. Invariants checked

| Invariant | How |
|-----------|-----|
| I3 / I13 | Per-item switches + master guard dependency |
| I8 | SHA256 match both trees |
| I15 | Store price + geometry end-state assertions |
| D-019 | Axis Defect D cancelled — order-line invariance only |
| Freeze-safe | No chart.js / replay-system / harness edits |
| `updateOrderPanelPrice` | Limit/stop skip preserved (~17225) |

---

## 6. What I did NOT do / limits

- **chart-half A6-3 flag** (`_isPriceAxisZoomDragging` setter in chart.js) — separate post-combined-build PR.
- **Harness registration** — `known-failing.json` untouched; Lane 4 after RED.
- **Live PO** — keyboard pan + price-axis drag not run on built product.
- **Pending-order drag paths** beyond multi-TP — not exhaustively axis-guarded (open `makeLineDraggable` + multi-TP covered).

---

## 7. Live-verification handoff

**Build:** commits `5889a1f0` (Phase 3) + `2f70df64` (Phase 4) atop `b6b4473d`.

1. **RC5-OI-3:** Replay active → draft **limit** with SL → keyboard pan (arrow keys) ≥3 steps → preview entry/SL lines stay on correct candle prices; `#orderEntryPrice` numeric unchanged. Toggle `__TALARIA_DISABLE_ORDER_DRAFT_SCALE_REFRESH_FIX=true` → lines float until click.
2. **RC5-OI-4:** Open position with SL → drag **price-axis** (not order line) → devtools `openPositions[id].stopLoss` / `openPrice` unchanged. Toggle `__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX=true` to repro store mutation (may need chart-half flag PR for full axis drag).
3. **Combined series PO:** Run RC5-OI-1→4 in order per landing report Appendix F.

---

## 8. Status

**DONE (dev only) — NEEDS-LIVE**

Property tests prove switch gating and store/geometry invariants. PO live-confirm on combined build required per I15 / D-010.

**Freeze-safe order-interaction series (Phases 0–4) complete.** A6-2 F5 persist is the next separate Lane 3 task.

---

## Commits + SHA256 (I8)

| Phase | Commit | Files |
|-------|--------|-------|
| 3 | `5889a1f0` | guard `.mjs` + `.test.mjs` + `order-manager.js` ×2 |
| 4 | `2f70df64` | `order-manager.js` ×2 (axis isolation) |

| Artifact | SHA256 (both trees match) |
|----------|---------------------------|
| `order-interaction-guard.mjs` | `c709913e0b78a496a5d1798ab1d31c8f5642869c82e1c64aa98c259aae480dfb` |
| `order-interaction-guard.test.mjs` | `4cca3111d82ec0da9dcfea57390aed32b98fea429a0e62b2b6a01abb61562571` |
| `order-manager.js` (post Phase 4) | `4a3e750953cc839a118192b8baaec9b129867d0667c556ddcb00d1ef0cb640c6` |
