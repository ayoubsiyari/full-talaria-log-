# ORD-MULTICHART-CROSS-TICKER-PNL — cross-ticker price bleed diagnostic (Lane 3)

**Status:** DIAGNOSTIC-ONLY (informed Step 0 branch + A6-4 dispatch)  
**Baseline:** blessed `20260717b16`  
**PO evidence:** GBP/USD Long exit `1.31315` (EUR-range) → PnL `-587757.04` while EUR/USD exit `1.31316` (correct)

---

## 1. Root mechanism (confirmed by code trace)

| Rank | Mechanism | File:lines | Confidence |
|------|-----------|------------|------------|
| **1** | **`_getActiveTicker()` / `_getOrderContextChart()` follow `window.getActiveChart()`** (focused panel), not the document-local chart or position owner | `order-manager.js:927-934`, `977-979`; `MultichartGrid.jsx:6009-6010` | **High** |
| **2** | **`updatePositions` mismatch uses focused ticker** — when ownership fields missing, main-chart OHLC path runs on **local iframe candle** (peer price) | `order-manager.js:28028-28063` (pre-fix) | **High** |
| **3** | **`_resolveMidMarkPrice` sameInstrument** pairs position ticker with **focused** chart but reads **`currentCandle.c` from local replay candle** — cross-instrument mark bleed | `order-manager.js:2129-2137` (pre-fix) | **High** |
| **4** | **`closePosition` else branch** uses `currentCandle.c` when ticker guard fails (missing ticker / false match) | `order-manager.js:26862-26885` (pre-fix) | **Medium** |
| **5** | **Per-iframe mutable store + mirror clone model** (A6-4 gap) — wrong marks on clone + host rail divergence | design §1 | **Architectural** |

**Pinpoint:** The wrong price source is **`getActiveChart()`-polluted instrument context** combined with **main-chart OHLC path** when position ownership is ambiguous. This is **cleanly isolatable in `order-manager.js`** without `MultichartGrid.jsx` / `panel-cmd-bridge.js` edits.

---

## 2. Deterministic repro (GBP + EUR, multichart topology)

| Step | Action | Assert |
|------|--------|--------|
| 1 | 2-up multichart: tile A `GBP/USD`, iframe B `EUR/USD` (different TF OK) | Both replay active |
| 2 | Place one long on each panel | Two open rows, distinct entry bands (~1.64 vs ~1.31) |
| 3 | Focus panel B; step replay / close GBP row from iframe-local path OR SL hit on mirrored GBP clone | **RED (pre-fix):** GBP exit/mark in **EUR band** (~1.313x) |
| 4 | Switch **`__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1=true`** | RED returns (peer bleed) |
| 5 | Switch unset (fix ON) | **GREEN:** GBP mark/close within **1.55–1.75** band |

**Node discriminator (I15 mechanism):** `order-owning-panel-price.test.mjs` — GBP position on EUR document, EUR `currentCandle.c=1.31315`, owning bg bar `1.64683` → legacy RED / fix GREEN.

---

## 3. Step 0 branch decision (D-030 / D-026 ruling 1)

**Decision: LAND narrow stopgap first**, then A6-4 (authorized).

| Item | Value |
|------|-------|
| Stopgap switch | `__TALARIA_DISABLE_ORDER_OWNING_PANEL_PRICE_V1` (unset = ON) |
| Scope | `order-manager.js` only (+ pure helpers / property test) |
| Bridge files | **None** for stopgap |
| A6-4 retires stopgap | When full snapshot package lands (Step 6), stopgap guard removed — no orphan |

If stopgap were **not** isolatable → skip to A6-4 only (no half-guards). **Isolatable — stopgap landed.**

---

## 4. Relationship to other diagnostics

| Report | Relationship |
|--------|--------------|
| `ORD-DUP-DURATION` | Independent dup/duration hygiene; cross-ticker bleed can amplify garbage PnL on dup rows |
| `ORD-MULTICHART-PARITY` | Panel-B lockout shares focus/replay ownership class; same RED multichart topology |
| `A6-4-HOST-CANONICAL-ORDER-STORE-DESIGN.md` | **Target fix** — host store + snapshot projection removes clone bleed class |

---

## 5. RED spec (owning-panel-price — discriminator of record)

**ID:** `ORD-XPNL-RED-1`

- **Topology:** 2 panels, different symbols, one order each (must be multichart — single-panel cannot carry).
- **Actuation:** replay step or manual close on non-owning focus.
- **Assert GREEN:** every mark/close price ∈ owning symbol session range.
- **Switch OFF:** peer price leak returns (GBP @ ~1.31315).

**Store property:** `assertMarkWithinOwningSymbolRange` — one lifecycle, one feed (`order-owning-panel-price.test.mjs`).

---

## 6. Status

**DIAGNOSTIC COMPLETE** → Step 0 stopgap + A6-4 Steps 1–6 implemented (dev). **NEEDS-LIVE** on b16+ for PO confirm + D-026 proof-row re-run.
