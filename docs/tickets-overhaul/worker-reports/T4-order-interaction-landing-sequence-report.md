# T4 — Order-manager interaction landing sequence (READ-ONLY)

## 1. Task + RC

- **Task:** T4 order-interaction landing-sequence consolidation (Lane 3). Unify A6-1 + held TAL-00752 #4/#5 + A6-3 order-half into one coherent `order-manager.js` execution plan pending **ESC-017**.
- **RC:** **RC-5** (order-entry interaction). Tooling/planning — no fix landed.
- **Escalation:** **ESC-017** OPEN — fixes gated until Director approves apply-on-release invariant + A6-4 host-canonical architecture + sequencing.

**Prerequisite docs:** [`T4-A6-ORDER-INTERACTION-CONTRACT.md`](../T4-A6-ORDER-INTERACTION-CONTRACT.md), [`T4-A6-order-interaction-contract-report.md`](T4-A6-order-interaction-contract-report.md).

**Explicitly OUT of this landing slot:** A6-2 (F5 persist — chart.js hooks), A6-4 (multichart host-canonical — post re-migration). No `replay-system.js` edits.

---

## 2. What I changed — file by file

| File | Change |
|------|--------|
| `docs/tickets-overhaul/worker-reports/T4-order-interaction-landing-sequence-report.md` | **New.** Unified change map, shared-guard model, landing order, freeze-safety, RED specs. |

**No other files touched.**

---

## 3. Kill-switch (I3 + I13) — proposed consolidation

| Layer | Switch | Default | Scope |
|-------|--------|---------|-------|
| **Master guard infra** | `window.__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2` | ON (fix when unset) | New `order-interaction-guard.mjs` + all consumers in `order-manager.js` |
| **A6-1 apply-on-release** | `window.__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` | ON | Provisional drag + hit-test suppress (open + preview commit-on-release) |
| **#4 preview replay race** | `window.__TALARIA_DISABLE_ORDER_PREVIEW_REPLAY_DRAG_FIX` | ON | `_syncPreviewToReplayPrice` deferral during provisional preview edit |
| **#5 keyboard-pan desync** | `window.__TALARIA_DISABLE_ORDER_DRAFT_SCALE_REFRESH_FIX` | ON | Draft geometry refresh on viewport/scale change without store mutation |
| **A6-3 order-half** | `window.__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX` | ON | Block `yScale.invert` → store writes during axis zoom (OM paths only in this slot) |

**Consolidation recommendation:** Land **one guard module** behind `__TALARIA_DISABLE_ORDER_INTERACTION_GUARD_V2`. Keep **per-item switches** (I13) so PO can revert A6-1 without disabling #5. When master OFF, all four behaviors revert to legacy.

**chart.js axis guard (A6-3 chart-half):** Separate switch slot `__TALARIA_DISABLE_CHART_PRICE_AXIS_ORDER_DECOUPLE_FIX` — **not** in this order-manager landing PR; gated post-combined-build.

---

## 4. Proof — RED → GREEN

**N/A** — planning only. RED specs below (Lane 4 registry ids proposed; reconcile with A6 contract — no duplicate harness ids for same actuation).

| Lane 4 id (proposed) | Item | Reconciles with |
|----------------------|------|-----------------|
| `RC5-OI-1` | A6-1 / TAL-01602 | A6 contract A6-1 row (same actuation) |
| `RC5-OI-2` | #4 / TAL-00752#4 | T4-step10 hand-back |
| `RC5-OI-3` | #5 / TAL-00752#5 | T4-step10 hand-back |
| `RC5-OI-4` | A6-3 order-half / TAL-01615 | A6 contract A6-3 row (OM slice only) |

Implement phase: RED-first per landing phase, then GREEN, then switch-OFF RED-again per item.

---

## 5. Invariants checked

| Invariant | How satisfied |
|-----------|---------------|
| READ-ONLY | No product/harness/registry edits |
| No `replay-system.js` | All replay coupling via existing `onUpdate` → `updatePositions` guards |
| I15 | Each RED names real actuation + order end-state measure |
| ESC-017 discipline | No implementation until Director rules |
| I13 | Master + per-item switches specified |

---

## 6. What I did NOT do / limits

- No code, tests, or harness scenarios.
- **#4 hypothesis** (T4-step10) cites ~16987 / ~18805 — line numbers shifted; verified `_syncPreviewToReplayPrice` ~17079, preview drag ~18734+.
- **#5** root cause not fully traced in chart keyboard handler (chart.js) — OM-side fix is **geometry refresh on scale change**; full fix may need chart pan hook (flagged).
- **A6-3 chart-half** deferred to separate gated slot.
- **D-017** snap-back / Lane 2 pan policy may affect #5 live RED timing — run RED after combined build when possible.

---

## 7. Live-verification handoff (post-landing)

**Single combined build** (D-018 unfreeze) — PO runs in order:

1. **RC5-OI-1:** Replay play → hold open SL across price ≥3 ticks → release.
2. **RC5-OI-2:** Replay play → draft limit → drag preview SL during tick → release; SL stable.
3. **RC5-OI-3:** Replay active → keyboard pan chart → draft limit lines track scale; entry price in panel unchanged for limit/stop.
4. **RC5-OI-4:** Price-axis drag → verify `openPositions[0].stopLoss` unchanged in devtools.

Toggle master + per-item switches OFF between rows to repro legacy.

---

## 8. Status

**DIAGNOSTIC-ONLY** — landing plan complete.

**Order-manager slot ready to execute on ESC-017 approval.**

---

# Appendix A — Unified `order-manager.js` change map

## A.1 — Hot zones (shared real estate)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  replaySystem.onUpdate  (~4795)  →  updatePositions()  (~27323)          │
│       │                              ├─ checkPendingOrders (~26906)    │
│       │                              ├─ _syncPreviewToReplayPrice       │
│       │                              │       (~17079)  ← #4            │
│       │                              └─ SL/TP hit tests (~27680+)       │
│       │                                   suppressTp only (~27367) ←A6-1│
├─────────────────────────────────────────────────────────────────────────┤
│  Preview drag (d3)  (~18690–19540)   isDraggingPreviewLine              │
│       └─ mutates slPrice inputs + preview lineData.price  ← #4, A6-1   │
├─────────────────────────────────────────────────────────────────────────┤
│  Open drag makeLineDraggable  (~29405–29800)                            │
│       ├─ _isDraggingOrderLine / _draggingManagedOpenLineKind            │
│       └─ mutates order.stopLoss live on mousemove (~29544) ← A6-1      │
├─────────────────────────────────────────────────────────────────────────┤
│  updatePreviewLinePositions  (~17745)  ← #5 scale/pan refresh            │
│  updatePreviewLines  (~18048+)       ← #5, #4                           │
│  updateOrderLines  (~38751)          ← A6-3 order-half                  │
├─────────────────────────────────────────────────────────────────────────┤
│  updateOrderPanelPrice  (~17042)     skips limit/stop (~17047) ← #5    │
└─────────────────────────────────────────────────────────────────────────┘
```

## A.2 — Per-item regions

### A6-1 — SL/TP apply-on-release (TAL-01602)

| Region | Lines (approx) | Change |
|--------|----------------|--------|
| `makeLineDraggable` `onMouseMove` | 29499–29595 | Write **provisional** price to drag state; defer `order.stopLoss` / `takeProfit` commit |
| `makeLineDraggable` `onMouseUp` | 29734–29800 | **Commit** provisional → store; `_syncSplitGroupProtectionPrices`; persist |
| Preview d3 drag `on('drag')` | 18734–19480 | Same provisional model for preview SL/TP/entry (`#slPrice` inputs commit on end) |
| `updatePositions` | 27367–27368, 27680–28030 | Extend suppress to **SL + all TP paths** when provisional open drag active |
| `_stopLossFillPrice` | 1488–1542 | Evaluate against **committed** SL only (or provisional guard bar) |
| `checkPendingOrders` | 26912–26916 | Align with unified `_draggingPendingOrderIds` / provisional set |

### TAL-00752 #4 — Replay × drag limit → SL glitch

| Region | Lines (approx) | Change |
|--------|----------------|--------|
| `_syncPreviewToReplayPrice` | 17079–17180 | Return early when **any** provisional preview edit OR `isDraggingPreviewLine`; defer `_autoDetectOrderTypeFromEntry` until release |
| Preview drag end | 19480–19540 | Serialize: release → then allow replay sync on next `updatePositions` tick |
| `_autoDetectOrderTypeFromEntry` | (called from ~17090) | Must not run mid-drag against mutating `#slPrice` |
| `calculateAdvancedRiskReward` during drag | 18732, 19200+ | Optional throttle — no full preview rebuild racing drag |

**Overlap with A6-1:** Same preview drag block (~18734–19540). **Single provisional-drag implementation** covers both.

### TAL-00752 #5 — Keyboard-pan × replay draft desync

| Region | Lines (approx) | Change |
|--------|----------------|--------|
| `updatePreviewLinePositions` | 17745–17880 | Ensure called on chart scale/offset change (subscribe via chart callback or existing render hook) |
| `updatePreviewLines` | 18048+ | After pan: reposition from **store** prices only — never `invert(mouse)` → store |
| `updateOrderPanelPrice` | 17042–17072 | Already skips limit/stop (~17047); document invariant; ensure keyboard pan does not trigger spurious market entry overwrite |
| `refreshDraftPreviewForActivePanel` | 654–674 | Respect provisional drag guard |
| `_scheduleDraftPreviewRedrawIfNeeded` | 676–711 | Same |

**Overlap with A6-1/#4:** Shares `updatePreviewLinePositions` / `isDraggingPreviewLine` guards.

**chart.js spillover (optional):** Keyboard pan handler may need to call `orderManager.onChartViewportChanged()` — **separate thin hook** in chart.js gated slot, not in Phase 1–3 if OM can hook existing `scheduleRender` / scale recalc paths.

### A6-3 order-half — Price-axis must not mutate order prices (TAL-01615)

| Region | Lines (approx) | Change |
|--------|----------------|--------|
| `updateOrderLines` | 38751–38850+ | Reposition from store prices only; never write inverted Y → `openPrice`/`stopLoss` |
| `makeLineDraggable` `onMouseMove` | 29514–29515 | Skip store write when `chart._isPriceAxisZoomDragging()` (read-only probe) |
| `drawYAxisPriceHighlight` | 23738–23793 | Visual-only; confirm no invert→store side path |
| `_splitGroupAvgLines` / SL line builders | 32380+, 37966+ | Same store-read-only rule during axis drag |

**chart.js spillover:** `drag.type === 'priceAxis'` (~18780), `_isPriceAxisZoomDragging` (~24622) — **separate gated PR** sets read-only flag consumed by OM.

## A.3 — Overlap matrix

| Region | A6-1 | #4 | #5 | A6-3 OM |
|--------|:----:|:--:|:--:|:-------:|
| `updatePositions` hit-test | ● | ○ | ○ | ○ |
| `_syncPreviewToReplayPrice` | ○ | ● | ○ | ○ |
| Preview d3 drag | ● | ● | ○ | ○ |
| `makeLineDraggable` open | ● | ○ | ○ | ● |
| `updatePreviewLinePositions` | ○ | ○ | ● | ○ |
| `updateOrderLines` | ○ | ○ | ○ | ● |
| `checkPendingOrders` drag guard | ● | ○ | ○ | ○ |

● = primary touch; ○ = shared guard consumer

**Collision risk if landed piecemeal:** Four separate PRs touching `makeLineDraggable` + preview drag + `updatePositions` → merge conflicts and inconsistent flags. **One landing sequence mandatory.**

---

# Appendix B — Shared guard model

## B.1 — Problem with today’s flags

| Flag | Purpose | Gap |
|------|---------|-----|
| `isDraggingPreviewLine` | Preview d3 drag | Open SL uses different flags |
| `_isDraggingOrderLine` | Open line drag | Hit-test only suppresses **TP** (~27367) |
| `_draggingManagedOpenLineKind` | sl/tp/entry | No provisional price buffer |
| `_draggingPendingOrderIds` | Pending execution guard | Not used for open SL hit suppress |

## B.2 — Proposed unified model

**New module:** `order-interaction-guard.mjs` (mirrored both trees)

```text
OrderProvisionalEdit {
  phase: 'idle' | 'preview' | 'open' | 'pending'
  lineKind: 'entry' | 'sl' | 'tp' | 'be' | null
  orderId: number | null
  splitGroupId: string | null
  provisionalPrice: number | null      // visual + hit-test isolation
  committedPrice: number | null        // snapshot at drag start
  chart: Chart | null                  // surface where drag started
}
```

**API (pure + OM methods):**

| Function | Used by |
|----------|---------|
| `beginProvisionalEdit(om, opts)` | drag start (preview + open) |
| `updateProvisionalPrice(om, price)` | mousemove — **no store write** |
| `commitProvisionalEdit(om)` | mouseup — write store once |
| `cancelProvisionalEdit(om)` | escape / pointer cancel |
| `shouldSuppressSltpHits(om, position, kind)` | `updatePositions` — replaces `suppressTpHitsWhileDraggingTp` |
| `shouldDeferReplayPreviewSync(om)` | `_syncPreviewToReplayPrice` — replaces bare `isDraggingPreviewLine` check |
| `shouldRefreshDraftGeometryOnly(om)` | `#5` — reposition SVG from store |
| `isChartAxisGestureActive(chart)` | A6-3 — read `chart._isPriceAxisZoomDragging?.()` |

**Store rule:** While `phase !== 'idle'`, `updatePositions` must not close/fill based on provisional prices. `checkPendingOrders` uses same guard set as today’s `_draggingPendingOrderIds` extended to provisional state.

**Visual rule:** Line Y comes from `provisionalPrice ?? storePrice` during drag; labels update; store commits on release only (A6-1).

## B.3 — Why one guard, not four

| Item | Guard consumption |
|------|-------------------|
| A6-1 | `begin/update/commit` + `shouldSuppressSltpHits` |
| #4 | `shouldDeferReplayPreviewSync` (preview phase) |
| #5 | `shouldRefreshDraftGeometryOnly` + no commit on scale change |
| A6-3 OM | `isChartAxisGestureActive` blocks commit + invert→store in drag handlers |

Adding four independent booleans would recreate TP-only suppress asymmetry.

---

# Appendix C — Coherent landing order (ESC-017 execution plan)

| Phase | PR scope | Items | Files | Depends on |
|-------|----------|-------|-------|------------|
| **0** | Guard module + tests | Infrastructure | `order-interaction-guard.mjs`, `.test.mjs`, loader | ESC-017 approve A6-1 invariant |
| **1** | Apply-on-release + hit suppress | **A6-1** | `order-manager.js` regions A6-1; wire guard in drag + `updatePositions` | Phase 0 |
| **2** | Replay preview deferral | **#4** | `_syncPreviewToReplayPrice`, preview drag end | Phase 1 (same provisional API) |
| **3** | Draft scale refresh | **#5** | `updatePreviewLinePositions`, optional `onChartViewportChanged` | Phase 1; prefer post-D-017 for live RED |
| **4** | Axis-gesture store isolation (OM) | **A6-3 order-half** | `updateOrderLines`, `makeLineDraggable` + chart flag probe | Phase 1; chart-half flag may be no-op until chart PR |

**Commits:** File-scoped per phase; mirror both trees (I8); one phase per commit preferred for Manager review.

**NOT in this sequence:** A6-2, A6-4, `replay-system.js`, harness `known-failing.json` (Lane 4 after RED registration).

### Sequencing vs held #4/#5 (ESC-017 question)

| Director ask | Answer |
|--------------|--------|
| Land A6-1 with #4/#5? | **Same landing slot, phased PRs** — shared guard module first, then A6-1+#4 in one or two commits (same drag regions), #5 immediately after |
| #4 before or after A6-1? | **A6-1 first** (establishes commit-on-release); #4 is additive deferral on preview replay path |
| #5 vs D-017? | **#5 Phase 3** can ship with OM-only refresh; full keyboard pan may need chart hook after D-017 committed |

---

# Appendix D — Freeze-safety per item

| Item | `order-manager.js` only? | Spillover | Landing phase |
|------|--------------------------|-----------|---------------|
| **A6-1** | **YES** | None | 1 — **execute first on ESC-017** |
| **#4** | **YES** | None | 2 |
| **#5** | **MOSTLY** | Optional `chart.js` one-liner `onChartViewportChanged` hook — **flag for separate micro-slot** if RED fails OM-only | 3 |
| **A6-3 order-half** | **PARTIAL** | Reads `chart._isPriceAxisZoomDragging`; chart sets flag in **separate** PR | 4 |

**Freeze-safe bundle (Phases 0–3):** Entirely `order-manager.js` + `order-interaction-guard.mjs` + aggregates — **no `replay-system.js`, no multichart-parent.**

---

# Appendix E — RED scenarios (I15)

### RC5-OI-1 — A6-1 (TAL-01602) — *same as A6 contract*

| | |
|--|--|
| **Actuation** | Built product; replay **play**; real pointer down on **open** SL; drag across market; hold ≥3 ticks; release |
| **Measure** | `openPositions` count unchanged while held; `stopLoss` equals released price after mouseup; close only if committed SL valid and bar touches |
| **Switch OFF** | Position closes while held |
| **Proxy invalid** | `isDraggingPreviewLine` alone, line attribute counts |

### RC5-OI-2 — #4 (TAL-00752#4)

| | |
|--|--|
| **Actuation** | Replay play; draft **limit** order with SL enabled; pointer down preview **SL**; replay advances ≥2 ticks while held |
| **Measure** | Preview SL Y stable vs panel `#slPrice`; no `_autoDetectOrderTypeFromEntry` flip mid-drag; after release, SL matches final Y |
| **Switch OFF** | SL jumps / wrong side during replay drag |
| **Proxy invalid** | `_syncPreviewToReplayPrice` call count without price assertion |

### RC5-OI-3 — #5 (TAL-00752#5)

| | |
|--|--|
| **Actuation** | Replay active; draft limit/stop visible; **keyboard** pan chart (arrow keys / harness `realKeyboard` if available) |
| **Measure** | Preview lines remain aligned to entry/SL store prices; limit entry **numeric** in panel unchanged; no ghost offset |
| **Switch OFF** | Preview lines float away from candles until click |
| **Proxy invalid** | `offsetX` changed without line position check |

### RC5-OI-4 — A6-3 order-half (TAL-01615)

| | |
|--|--|
| **Actuation** | Open position with SL; real pointer drag on **price-axis** (not order line); double-tap axis reset |
| **Measure** | `chart.orderManager.openPositions[id].stopLoss` and `openPrice` **unchanged** after axis drag; pixel Y may change |
| **Switch OFF** | Store price changes when axis dragged |
| **Note** | Full pass may require chart-half flag PR; OM-only phase tests store immutability during simulated `_isPriceAxisZoomDragging` |

---

# Appendix F — ESC-017 readiness checklist

| Checkpoint | Ready? |
|------------|--------|
| Unified change map | ✅ |
| Shared guard model (one provisional-edit concept) | ✅ |
| Landing order Phases 0–4 | ✅ |
| Per-item + master kill-switches named | ✅ |
| Freeze-safety classified | ✅ |
| RED specs reconciled with A6 contract (RC5-OI-1/4) | ✅ |
| `replay-system.js` untouched | ✅ |
| A6-2 / A6-4 excluded | ✅ |

**Blocked on:** Director ESC-017 ruling (apply-on-release + A6-4 architecture + sequencing confirm).

**Unblocked immediately on approval:** Phases 0–2 (freeze-safe `order-manager.js` bundle).

---

## Worker confirmation

- **No product, harness, or registry files edited.**
- **Docs only:** this report.
