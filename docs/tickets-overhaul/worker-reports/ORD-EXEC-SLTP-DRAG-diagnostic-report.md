# ORD-EXEC-SLTP-DRAG — Executed-position SL/TP drag freeze (Lane 3 diagnostic)

## 1. Task + RC

- **Task:** ORD-EXEC-SLTP-DRAG diagnostic (read-only, freeze-safe, build **20260716b11**).
- **Goal:** Explain why **executed** (open) position SL/TP lines cannot be dragged/edited after fill; bisect order-interaction guard V2; locate exact drag-loss site; matrix pending vs executed; regression commit; fix menu + RED id.
- **RC:** RC-5 / order-interaction guard (A6-1 apply-on-release). **DIAGNOSTIC-ONLY — no RC discharged.**

**PO evidence:** Multi-entry TDZ fixed (b11). After order **executes**, open-position SL/TP lines do not move on drag; console otherwise clean. Pending behavior reported separately below (code-predicted).

---

## 2. What I changed — file by file

**N/A — diagnostic only.** No product/engine/harness/React edits.

**Read paths:** `chart v 1.4/chart/modules/order-manager.js`, `chart v 1.4/chart/chart.js`, `chart v 1.4/chart/modules/order-interaction-guard.mjs` (+ I8 mirror `homepage/public/chart/modules/**`).

---

## 3. Kill-switch (I3 + I13)

Existing switches (default **ON** = guard active):

| Switch | Effect when set `true` |
|--------|-------------------------|
| `window.__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2` | Master OFF → all sub-legs OFF (reverts to pre-A6 drag/store behavior). |
| `window.__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` | A6-1 OFF only → open SL/TP drag mutates store live during drag (legacy path). |

**A/B prediction (static — NEEDS-LIVE confirm):** Either switch above should restore executed-position SL/TP drag on reload. Sub-legs #4 (preview replay deferral), #5 (draft scale refresh), A6-3 (price-axis isolation) are **not** the primary drag-freeze mechanism for open positions.

---

## 4. Proof — RED → GREEN

### A/B bisect (guard ON vs OFF)

| State | Predicted executed SL/TP drag | Basis |
|-------|------------------------------|--------|
| **Guard ON** (default b11) | **Frozen** — line does not follow pointer during drag | A6-1 holds `stopLoss`/`takeProfit` in store; `updateSLTPLines` repositions from store every `chart.render()` |
| **Guard OFF** (`__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2 = true`) | **Restores drag** | `makeLineDraggable` writes store during `mousemove`; `updateSLTPLines` reads same values |
| **A6-1 only OFF** (`__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX = true`) | **Restores drag** | Same as master OFF for SL/TP path |

**Live A/B not run in this session** (freeze-safe, no PO browser). PO bisect: DevTools → `window.__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2 = true` → hard reload → place→fill→drag TP/SL → expect line follows pointer + `🖱️ Drag started` / `✅ Drag ended` console logs from `makeLineDraggable`.

### Node simulation (render-fight model)

```text
A6 ON:  drag provisional=150 store=100 updateSLTPLines reads=100 => FROZEN
A6 OFF: drag store=150        updateSLTPLines reads=150 => MOVES
```

Matches `order-interaction-guard.test.mjs` RC5-OI-1 GREEN: store unchanged during provisional open drag (`36 passed, 0 failed`).

### I15 actuation / measurement

- **Actuation:** Not performed — no real mouse place→fill→drag in built product this session.
- **Measurement:** Code trace + Node simulation; **not proven** on live UI.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| I8 | No edits; refs canonical `chart v 1.4/chart/**` |
| I15 | Labeled code-predicted; live bisect delegated to PO |
| Freeze | No `chart.js`, `replay-system.js`, or harness lib edits |
| Lane 3 read-only | STOP after report |

---

## 6. What I did NOT do / limits

- Did **not** run live guard ON/OFF bisect in browser (NEEDS-LIVE).
- Did **not** verify open-position **panel field** edit (positions tab inputs) — PO “edited” may mean drag-only.
- **Multi-TP open** drag uses `makeLineDraggableMultiTP` (mutates `tpTargets` during drag, no A6-1 provisional) — may behave differently from single SL/TP; matrix marks as **LIKELY OK** pending PO check.
- Did **not** bisect git between b50d45d4 and parent beyond static analysis (regression is interaction of A6-1 + pre-existing `updateSLTPLines` loop).

---

## 7. Root cause — answers to diagnostic questions

### Q1 — `isDraggable` / `pointer-events` for open SL/TP?

**Not the defect.** Executed lines are drawn in `drawSLTPLines` (~37253) with `pointer-events: 'all'` on SL/TP line + label chrome (~37316–37348, ~37608–37644). `makeLineDraggable` attaches `mousedown` on line + labels (~30447–30458).

The prompt’s `drawPreviewLine` sites (~19022 `isDraggable ? 'stroke' : 'none'`) apply to **draft preview** only, not executed rows.

### Q2 — Is `d3.drag()` / drag handler attached for executed SL/TP?

**Yes for creation path.** Open SL → `makeLineDraggable(..., 'sl', ...)` (~37396). Single open TP → `makeLineDraggable(..., 'tp', ...)` (~37697). Multi open TP → `makeLineDraggableMultiTP` (~37534). Pending → `makePendingTargetDraggable` via d3.drag (~34135–34137, ~34266).

Drag attach is **not** skipped for executed positions. Failure is **post-attach**: geometry reset each render.

### Q3 — Does apply-on-release swallow pointerdown / hit-line?

**No.** Apply-on-release begins on **successful** `mousedown` inside `makeLineDraggable` (~30038–30054). It does not set `pointer-events: none` or block hit targets.

The failure mode is **after** drag starts: `onMouseMove` updates **provisional** price only (~30116–30133) and moves the line (~30194), but **`updateSLTPLines` overwrites Y from committed store** on the next `chart.render()`.

### Q4 — Exact site where executed SL/TP loses draggability

| Layer | File:line | What happens |
|-------|-----------|--------------|
| **A6-1 provisional write** | `order-manager.js:30116–30133` | During drag, `stopLoss`/`takeProfit` **not** written to store when A6-1 ON |
| **Render loop calls reposition** | `chart.js:26396–26397` → `order-manager.js:39876` | Every `render()`, `updateOrderLines` → `updateSLTPLines` |
| **Store-only Y read (no provisional, no drag skip)** | `order-manager.js:38552` (`yScale(position.stopLoss)`) and ~38760+ for TP | Resets line/labels to **committed** price |
| **Contrast: BE already guarded** | `order-manager.js:39019–39021` | `updateBELines` returns early when `_draggingManagedOpenLineKind === 'be'` |
| **Missing symmetric guard** | `updateSLTPLines` entry ~38476 | **No** `_isDraggingOrderLine` + `sl`/`tp` early return |

**Verdict:** Root is **A6-1 apply-on-release × `updateSLTPLines` render fight**, not missing drag attach or `isDraggable=false`.

### Q5 — Pending vs executed matrix (code-predicted)

|  | **SL drag** | **TP drag** | **Field edit** |
|--|-------------|-------------|----------------|
| **Preview (draft rail open)** | OK — d3 drag + provisional; `updatePreviewLines` defers while `isDraggingPreviewLine` | OK — same | OK — panel inputs |
| **Pending (unfilled)** | OK — `makePendingTargetDraggable`; mutates `pendingOrder` during drag; `positionPendingOrderTargets` skips full rebuild when `_isDraggingPendingTarget` | OK — same | OK — pending targets + panel |
| **Executed (open)** | **BROKEN** (A6-1 ON) — `makeLineDraggable` + store frozen + `updateSLTPLines` reset | **BROKEN** single TP — same path | **Unknown** — positions-panel inline edit not traced; may work if it writes store directly |
| **Executed multi-TP** | N/A | **LIKELY OK** — `makeLineDraggableMultiTP` mutates `tpTargets[].price` during drag (~30531–30544); still subject to `updateSLTPLines` but store updates each frame | **Unknown** |

### Q6 — Regression origin

| Commit | What it introduced |
|--------|-------------------|
| **`b50d45d4e`** (2026-07-16) | **A6-1 SL/TP apply-on-release** — open drag updates `_orderProvisionalEdit` only; commit on mouseup (`_oiCommitOpenSltpToStore` ~30322–30326) |
| Pre-existing | `updateOrderLines` → `updateSLTPLines` every render (~39876); `updateBELines` drag skip (~39019) added earlier (blame `d62e5da5c1`) but **never mirrored for SL/TP** |

**Regression = `b50d45d4` exposing latent asymmetry** (BE guarded, SL/TP not).

---

## 8. Ranked freeze-safe fix menu

| Rank | Fix | Cost | Freeze-risk | Notes |
|------|-----|------|-------------|-------|
| **1 (recommended)** | In `updateSLTPLines`, early-return when `_isDraggingOrderLine && (_draggingManagedOpenLineKind === 'sl' \|\| 'tp')` — mirror `updateBELines:39019` | ~6 lines, both trees | **Low** | Preserves A6-1 hit-test/store semantics; drag handler owns geometry until mouseup |
| **2** | In `updateSLTPLines`, when `_oiIsProvisionalEditActive()` && `phase==='open'`, position lines from `_orderProvisionalEdit.provisionalPrice` for matching `orderId`+`lineKind` | ~15–25 lines | **Med** | Keeps label/PnL refresh during drag; must not write store |
| **3** | Wire `makeLineDraggableMultiTP` through same A6-1 provisional + commit path for consistency | Larger | **Med** | Only if multi-TP drag also broken live |
| **4 (escape)** | PO/worker temporary: `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX = true` | 0 code | **High** (reopens D-020 edge cells) | Bisect only — not ship default |

**Proposed RED id:** `RC5-EXEC-SLTP-DRAG-1` — harness scenario: place→fill→mousedown SL/TP hit-line→drag ≥20px→release→assert store price changed + line Y matches store after one `render()` tick. Gate under Lane 4 when harness accepts real-actuation place→fill path.

---

## 9. Live-verification handoff (PO)

**Build:** `20260716b11` (`order-manager.js?v=20260716b11`).

**A/B bisect (do first):**

1. Open chart → place order with SL+TP → execute (market/limit fill).
2. **Guard ON (default):** drag open SL line → expect **frozen** (current bug).
3. Console: `window.__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2 = true` → hard reload → repeat → expect **drag works** + console `🖱️ Drag started: SL` / `✅ Drag ended: SL`.
4. Repeat with only `window.__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX = true` (guard master still ON) — expect same restore.

**After fix rank #1:** drag moves line live; release commits; replay SL hit-test still uses committed price during drag (D-020 edge a).

---

## 10. Status

**DIAGNOSTIC-ONLY (mechanism reported, fix not started)**

Guard V2 / **A6-1 apply-on-release** is the predicted root via `updateSLTPLines` store-only reposition every render. Live A/B bisect **NEEDS-LIVE** to close the evidence gap (I15).
