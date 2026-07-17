# ORD-EXEC-SLTP-DRAG — open-leg diagnostic (read-only)

**Task:** Lane 3 read-only follow-up to [`A6-ORDER-FAMILY-CLOSURE-SWEEP.md`](../A6-ORDER-FAMILY-CLOSURE-SWEEP.md) §4 **G1**.  
**Question:** Does **executed open-position** SL/TP drag read **committed store** mid-drag (same class as the original executed freeze), or a different path? Does the **b2 v2 provisional-follow** fix cover it?  
**Build context:** Source tree includes v2 fix (commit `7722a71f`, build **`20260717b2`**); b38 stack carries same `order-manager.js` module.  
**RC:** RC-5 / A6-1 apply-on-release × render reposition. **DIAGNOSTIC-ONLY — no RC discharged.**

**Prior reports:** [`ORD-EXEC-SLTP-DRAG-diagnostic-report.md`](ORD-EXEC-SLTP-DRAG-diagnostic-report.md) (mechanism), [`ORD-EXEC-SLTP-DRAG-FIX-v2-report.md`](ORD-EXEC-SLTP-DRAG-FIX-v2-report.md) (fix landed).

---

## 1. Terminology (avoid mixing legs)

| Leg | Store | Drag handler | A6-1 provisional? | Render reposition |
|-----|-------|--------------|-------------------|-------------------|
| **Preview / draft** | Panel inputs + `previewLines` | `drawPreviewLine` → d3 drag (`makePreviewLineDraggable`) | **Yes** — `phase: 'preview'` | `updatePreviewLinePositions` (blocked full redraw via `isDraggingPreviewLine`) |
| **Pending (unfilled)** | `pendingOrders` / `target.price` | `makePendingTargetDraggable` | **No** — live mutation during drag | `positionPendingOrderTargets` **skipped** when `_isDraggingPendingTarget` |
| **Executed open position** (“open leg”) | `openPositions.stopLoss` / `takeProfit` | `makeLineDraggable` (`lineType` `'sl'` \| `'tp'`) | **Yes** — `phase: 'open'` | `updateSLTPLines` every `chart.render()` |

**This report’s “open-leg”** = **executed open position** single SL/TP rows (`openPositions`), not pending limit orders and not draft preview lines.

---

## 2. Answer (executive)

| Question | Answer |
|----------|--------|
| Same class as original executed freeze? | **Yes** — without v2, `updateSLTPLines` reads **committed** `position.stopLoss` / `takeProfit` while A6-1 keeps store frozen and drag writes **provisional** only. |
| Different path from pending/preview? | **Yes** — pending mutates store live; preview updates `lineData.price` + defers full redraw. Only executed open SL/TP hits the **store vs render fight**. |
| Does v2 provisional-follow extend to open leg? | **Yes — already implemented** for single SL/TP via `_oiResolveOpenSltpDragDisplayPrice` (`phase === 'open'`). |
| Why closure sweep still flagged G1? | Sweep treated fix as **unlanded / NEEDS-LIVE**; v2 **is in source** but **not** a dedicated b38 checklist row and **not PO-confirmed** on b38. |

---

## 3. Mechanism trace — executed open SL/TP (open leg)

### 3.1 Drag start — provisional, store unchanged (A6-1)

On `mousedown` in `makeLineDraggable`, when `lineType` is `'sl'` or `'tp'` and A6-1 is ON:

```30276:30291:chart v 1.4/chart/modules/order-manager.js
            if (_orderSltpApplyOnReleaseFixEnabled() && (lineType === 'sl' || lineType === 'tp')) {
                self._oiEnsureProvisionalCancelHandlers();
                self._oiBeginProvisionalEdit({
                    phase: 'open',
                    lineKind: lineType,
                    orderId: order.id,
                    splitGroupId: order.splitGroupId || null,
                    committedPrice: dragStartPrice,
                });
                // ...
            }
```

During `mousemove`, store is **not** written (provisional only):

```30353:30371:chart v 1.4/chart/modules/order-manager.js
                } else if (lineType === 'sl') {
                    if (_orderSltpApplyOnReleaseFixEnabled()) {
                        self._oiUpdateProvisionalPrice(newPrice);
                    } else if (!blockStoreForAxis) {
                        // legacy: mutates sib.stopLoss live
```

Drag handler also moves the SVG row (`line.attr('x1', 0).attr('x2', ctx.w)...` ~30431).

### 3.2 Render loop — `updateSLTPLines` (the fight site)

Every chart render calls `updateOrderLines` → `updateSLTPLines`:

```26396:26397:chart v 1.4/chart/chart.js
            if (typeof this.orderManager.updateOrderLines === 'function') {
                this.orderManager.updateOrderLines(this);
```

**Without v2:** SL loop used `position.stopLoss` directly → **committed** price → line snaps back (original diagnostic ~38552 class).

**With v2 (current):** SL and TP loops call the display resolver:

```38746:38746:chart v 1.4/chart/modules/order-manager.js
                const displaySlPrice = this._oiResolveOpenSltpDragDisplayPrice(orderId, 'sl', position.stopLoss);
```

```38981:38981:chart v 1.4/chart/modules/order-manager.js
                const displayTpPrice = this._oiResolveOpenSltpDragDisplayPrice(orderId, 'tp', tpPrice);
```

Geometry uses `yScale(displaySlPrice)` / `yScale(displayTpPrice)` (~38773, ~39072).

### 3.3 v2 resolver — provisional price during open drag

```836:857:chart v 1.4/chart/modules/order-manager.js
    _oiResolveOpenSltpDragDisplayPrice(orderId, lineKind, committedPrice) {
        if (!_execSltpDragFollowFixV1Enabled() || !_orderSltpApplyOnReleaseFixEnabled()) {
            return committedPrice;
        }
        if (!this._isDraggingOrderLine || this._draggingManagedOpenLineKind !== lineKind) {
            return committedPrice;
        }
        // ... orderId + phase === 'open' + lineKind match ...
        const prov = Number(st.provisionalPrice);
        return Number.isFinite(prov) ? prov : committedPrice;
    }
```

**Switch (I3):** `__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1` — unset = v2 ON (~187–190).

This is the **same design intent** as v2 prompt: reposition the **full row** at **provisional** Y, not skip the row (b12 skip removed — `_shouldSkipOpenSltpLineReposition` no longer in tree).

### 3.4 Release — commit to store (host on multichart iframe)

```30561:30565:chart v 1.4/chart/modules/order-manager.js
            if (_orderSltpApplyOnReleaseFixEnabled() && (lineType === 'sl' || lineType === 'tp')) {
                const committed = self._oiCommitProvisionalEdit();
                if (Number.isFinite(committed)) {
                    self._oiCommitOpenSltpToStore(order, lineType, committed);
```

On A6-4 iframe embed, commit routes to host (Step 4), not local store:

```754:763:chart v 1.4/chart/modules/order-manager.js
    _oiCommitOpenSltpToStore(order, lineType, price) {
        if (!Number.isFinite(price)) return;
        if (_orderMcOpenPatchV1Enabled() && this._multichartIsEmbedIframe()) {
            this._postHostOrderCommand('patch-open-leg', { orderId, lineType, price, ... });
            return;
        }
```

### 3.5 Contrast — BE guard (why original diagnostic cited asymmetry)

`updateBELines` still **skips** entirely during BE drag (~39225–39227). Open SL/TP no longer skips; v2 **follows provisional** instead — correct fix for full-width line + labels.

---

## 4. Other legs (not the same bug class)

### 4.1 Pending SL/TP

- Handler: `makePendingTargetDraggable` (~34478+) — **`target.price = newPrice`** and pending order fields updated **during** drag (~34582+).
- Render: `updateOrderLines` skips full pending rebuild while dragging:

```39954:39957:chart v 1.4/chart/modules/order-manager.js
        if (!this._isDraggingPendingTarget) {
            this.positionPendingOrderTargets(ch);
        }
```

**Verdict:** Does **not** read committed-only mid-drag; **not** the executed freeze class. Original matrix “Pending OK” still holds.

### 4.2 Preview / draft SL/TP

- Provisional: `phase: 'preview'` (~19459–19465).
- Drag updates `lineData.price` (~19588) + `_oiUpdateProvisionalPrice` (~19594–19598).
- Pan/zoom: `_oiResolveProvisionalPreviewPrice` (~859–869) + `_oiSyncPreviewLinePricesFromStore` (~875–897); full redraw blocked when `isDraggingPreviewLine` (~1161).

**Verdict:** Separate path; already uses provisional visual follow. Distinct from open-leg executed fight.

### 4.3 Multi-TP open (`makeLineDraggableMultiTP`)

- Mutates `tpTargets[].price` **during** drag (store live) — no A6-1 provisional on that path.
- `updateSLTPLines` reads `target.price` from store → stays consistent.
- **Predicted OK** (original diagnostic); live gap only if PO sees otherwise.

---

## 5. v2 vs closure sweep G1

| Item | Status |
|------|--------|
| v1 skip fix (b12) | Superseded — skip helper removed |
| **v2 provisional-follow (b2)** | **LANDED** in `order-manager.js` (both I8 trees) |
| Node proof | `order-interaction-guard.test.mjs` 36/36 — A6-1 store unchanged during drag unchanged |
| PO / b38 | **NEEDS-LIVE** — drag follow + release commit not a dedicated row in [`A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md`](../A6-4-b38-PO-LIVE-CONFIRM-CHECKLIST.md) (row **3** covers host/tile **convergence after release**, not mid-drag follow) |

**Sweep correction:** G1 should read **“STAGED-NEEDS-LIVE (v2 landed, PO not closed)”**, not **“no fix landed”**, unless PO bisect proves v2 OFF or fix absent from deployed build id.

---

## 6. Residual risks (multichart / b38)

| Risk | Mechanism | Likelihood |
|------|-----------|------------|
| **Snapshot stomp mid-drag** | `applyOrderSnapshotProjection` (`panel-cmd-bridge.js` ~119–158) replaces iframe `openPositions` from **host committed** snapshot with **no** check for `_oiIsProvisionalEditActive()` | **Med** on 2-up if fan-out runs during drag (host place, ready-panels, post-patch fan-out is release-only — lower during drag unless extra fan-out added) |
| **v2 switch OFF** | `_oiResolveOpenSltpDragDisplayPrice` returns committed → **frozen** under A6-1 ON | Bisect only |
| **A6-1 OFF** | Legacy live store mutation during drag — drag works but D-020 edge cells regress | Bisect only |
| **Multi-TP open** | Different mutation path | Low unless PO reports freeze |

---

## 7. Proposed freeze-safe fix scope (if PO still RED on b38)

**No new code required if** PO confirms v2 ON: place → fill → drag SL/TP → full line follows → release commits (row **3** convergence pass).

If PO still sees freeze with v2 ON:

| Rank | Scope | Files | Switch | Freeze-risk |
|------|-------|-------|--------|-------------|
| **0** | PO bisect: `__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1=true` → expect freeze; OFF → expect follow | — | existing | None |
| **1** | **Live-confirm only** — extend b38 checklist row **3** with mid-drag follow sub-leg (executed SL + TP, single-leg) | docs only | — | None |
| **2 (recommended if multichart RED)** | Skip or defer `applyOrderSnapshotProjection` when iframe `orderManager._oiIsProvisionalEditActive()` && `phase==='open'` | `panel-cmd-bridge.js` (~119–158) | new: `__TALARIA_DISABLE_ORDER_MC_SNAPSHOT_DEFER_OPEN_DRAG_V1` (default ON = defer) | **Low** — read-only projection deferral |
| **3** | If multi-TP open freezes: extend `_oiResolveOpenSltpDragDisplayPrice` for multi-TP drag flags **or** wire multi-TP through A6-1 provisional | `order-manager.js` | extend existing EXEC switch or A6-1 sub-switch | **Med** |
| **4 (escape)** | Disable A6-1 or v2 for bisect | console | `__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` / EXEC switch | **High** — reopens D-020 |

**Do not:** revert A6-1 commit-on-release for ship; do not touch `chart.js` / `replay-system.js` for rank 2.

**RED id (unchanged):** `RC5-EXEC-SLTP-DRAG-1` — place → fill → drag SL/TP ≥20px → release → store price + line Y match after one render tick; switch-OFF RED on `__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1`.

---

## 8. Live-verification handoff (PO)

**Build:** confirm `order-manager.js?v=` matches build with v2 (≥ **`20260717b2`**; b38 bundle should include hunks).

1. Single chart: market/limit with SL+TP → fill → drag **open** SL then TP (default switches).
2. **Expect GREEN:** full-width dashed line tracks pointer; release updates host store / panel; no jump at release.
3. **RED-again:** `window.__TALARIA_DISABLE_EXEC_SLTP_DRAG_FOLLOW_FIX_V1 = true` → reload → expect full-line freeze (committed read).
4. **Multichart (b38):** repeat on panel **B** iframe; row **3** after release; add mid-drag follow observation from step 1.
5. Optional: multi-TP open drag spot-check.

---

## 9. Status

**DIAGNOSTIC-ONLY**

**Conclusion:** Executed **open-leg** SL/TP drag is the **same mechanism class** as the original ORD-EXEC-SLTP-DRAG freeze (committed store vs A6-1 provisional × `updateSLTPLines`). The **v2 provisional-follow fix already targets this leg** via `_oiResolveOpenSltpDragDisplayPrice`. Pending and preview use **different paths** and are not the same bug. Remaining work is **PO live-confirm on b38** and, if multichart still RED, a **freeze-safe snapshot deferral during open provisional drag** (rank 2).
