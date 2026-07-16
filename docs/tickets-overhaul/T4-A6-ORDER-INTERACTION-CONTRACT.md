# T4 Amendment A6 — Order-Interaction Contract (RC-5)

**Task:** T4-A6 (Lane 3). **Contract draft only — no code changes.**

**Purpose:** Mirror T3's interaction-parity table discipline for four new order-interaction rows from Director intake (2026-07-15). Each row names today's mechanism (file:line evidence), the failure symptom, the **target invariant**, RED scenario (I15), proposed kill-switch, and fix boundary. Fixes dispatch **after** contract approval — RED-first per row.

**RC:** **RC-5** (order-entry state model + interaction surfaces).

**Binding:** I15 — every GREEN must use real replay drag-hold / F5 reload / price-axis gesture / multichart cross-panel actuation and measure visible order end-state (line price, position open/closed, panel parity) — not helper-called or DOM-count proxies.

---

## Contract table

| Row | Ticket | Symptom | Today: mechanism (evidence) | Target invariant | RED scenario (I15) | Kill-switch (proposed) | Fix boundary | Freeze-safe? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **A6-1** | TAL-01602 | Dragging SL during replay closes trade when held line touches price | **Live SL mutation during drag + replay fill on every tick.** `makeLineDraggable` sets `_isDraggingOrderLine` + `_draggingManagedOpenLineKind='sl'` (~29446–29447) but **mutates** `sib.stopLoss = newPrice` on every `mousemove` (~29544–29555). `updatePositions()` runs each replay tick (`replaySystem.onUpdate` ~4795; `replay-system.js` ~3354) and evaluates SL hits against **live** `position.stopLoss` (~27684–27695). TP drag is suppressed (`suppressTpHitsWhileDraggingTp` ~27367–27368); **no SL equivalent**. `_slNoTriggerBeforeTime` guard set on drag (~29551–29554) is insufficient when bar/tick guard clears. Preview pending entry has drag guard (`checkPendingOrders` ~26912–26916); open SL does not. | **SL/TP edits are apply-on-release.** While pointer is down on an SL/TP (open or preview) line, price is **provisional** — must NOT enqueue fills/closes. Commit to store only on `mouseup`/`pointerup`. Replay `updatePositions` must skip SL/TP hit tests for legs under drag. | **Actuation:** Real replay **play** or step; pointer down on open SL; drag across current market price; hold ≥3 replay ticks before release. **Measure:** Position remains **open** while held; after release, SL price equals released Y; close only if released SL is on loss side and bar OHLC touches **committed** SL. Switch OFF reproduces close while held. Gate on `openPositions.length` + position id, not `isDraggingPreviewLine` alone. | `window.__TALARIA_DISABLE_ORDER_SLTP_APPLY_ON_RELEASE_FIX` (default unset = fix ON; matches T4 order-entry disable-style) | `order-manager.js`: `updatePositions` (~27323), `makeLineDraggable` onMouseMove/onMouseUp (~29499–29795), preview SL drag (~18734+). Optional: `order-entry-aggregates.mjs` pure `shouldSuppressSltpHitsWhileDragging(kind)`. **Do not edit** `replay-system.js` — consume existing `onUpdate` only. | **YES** — `order-manager.js` + aggregates only |
| **A6-2** | TAL-01616 | Order disappears on F5 refresh | **Persist path exists but is narrow / race-prone.** `persistRuntimeOrderState` (~3805) saves `pending_orders` + `open_positions` + `account_runtime` + counters; session → `chart.scheduleSessionStateSave(patch)` (~3852); no-session → `userStorage` key `chart_orders_runtime_local_v1` (~3865–3873). Restore: `restoreRuntimeOrderStateFromSession` (~3879); session load `loadTradingSessionStateIfNeeded` (~10635); no-session `loadLocalRuntimeOrdersIfNoSession` (~10582). **Gaps:** (1) persist often only at end of `updatePositionsPanel()` (~40426) — order placed without panel refresh may not flush; (2) `scheduleSessionStateSave` drops patches before `_sessionStateLoadedFor` hydrates (~11244); (3) session charts skip local restore (~10585–10587); (4) iframe `orderManager` is not host canonical store. **D-019 settled:** persist **pending + open**, **session-scoped**. | **Session-scoped runtime order state survives F5:** after reload, same session shows same pending orders and open positions (count, ids, SL/TP/entry prices) without user action. Journal merge unchanged. No-session charts use local fallback. | **Actuation:** Real F5 / browser reload on **built product** with active `?sessionId=`. Place pending limit + open market position; reload once. **Measure:** Both orders visible on chart + positions panel; store snapshot `pendingOrders`/`openPositions` lengths and ids match pre-reload. Repeat with replay active mid-session. Switch OFF may restore journal-only path without runtime patch. | `window.__TALARIA_DISABLE_ORDER_RUNTIME_PERSIST_V2` | `order-manager.js`: `persistRuntimeOrderState`, call sites (place, close, drag-release, cancel). `chart.js` (read boundary): `scheduleSessionStateSave`, `pagehide` flush (~11611), `_sessionStatePatchAllowedBeforeHydrate`, `loadTradingSessionStateIfNeeded` — ensure runtime patch in debounced + keepalive flush. **No harness edits** until Lane 4 dispatch. | **PARTIAL** — needs `chart.js` session hook lines (~11231–11250, ~11611); coordinate with Lane 1 only on hook points, not replay regions |
| **A6-3** | TAL-01615 | Dragging price-scale label drags order; double-tap restores | **Price-axis zoom couples to order line geometry.** Chart `drag.type === 'priceAxis'` mutates `priceZoom` / `priceOffset` / `priceScale.autoScale` (~18780–18787, ~16818). Order lines positioned via `yScale(price)`; `updateOrderLines` reprojects on render (~32466 skips during `_isDraggingOrderLine`). Axis drag triggers `scheduleRender` → lines **move visually** with scale; if any path writes inverted price back into `order.stopLoss` / `openPrice`, order **mutates**. Y-axis highlights are `pointer-events: none` (~23752) — symptom is scale-domain coupling, not highlight drag handle. Sibling: TAL-01566 / A1 axis family — **PO cancelled Defect D** (D-019); **order half** remains A6. | **Price-axis gesture must not mutate order prices.** Zoom/pan/scale on the price axis may change pixel Y of lines but **order store prices stay fixed** until explicit order-line drag. Double-tap auto-scale restores view without changing SL/TP/entry. | **Actuation:** Real pointer drag on **price-axis label zone** (not order line); observe order line follows scale; double-tap axis to reset. **Measure:** `openPositions[0].stopLoss` (and entry) **unchanged** after axis drag; pixel Y may change. After double-tap, line price labels match store. Switch OFF reproduces order price mutation or stuck wrong price until double-tap. | `window.__TALARIA_DISABLE_ORDER_PRICE_AXIS_ISOLATION_FIX` | `order-manager.js`: `updateOrderLines`, `drawYAxisPriceHighlight` refresh paths. `chart.js`: price-axis drag finalization (~18770+, `_isPriceAxisZoomDragging` ~24622) — gate order price writes during axis drag. **Coordinate** with T2/A1 axis rows (Defect D cancelled for pan; order-isolation is separate). | **NO** — touches `chart.js` price-axis regions (Lane 1/T2 overlap) |
| **A6-4** | TAL-01601 | 2 layouts: SL on panel 2 doesn't mirror panel 1; limit lands below SL | **Per-panel order copies — no open-position update transport.** Canonical store: **host** `window.chart.orderManager` (`MultichartGrid.jsx` ~3742–3759 pushes host open/pending to iframes once via `addOrder`). Iframes: `panel-cmd-bridge.js` `addOrder` → `orderService.registerOpenOrder` (~3519–3522) — **local clone**. Pending updates: `_emitPendingMirrorSync` → `order:pending-updated` (~717–729) → `iframe-order` → `syncPendingOrder` (~4696). **Open positions: no `order:opened-updated` event** — grep shows only `order:closed` emit (~26271, ~28555). SL drag on iframe mutates **iframe-local** `openPositions` only (`makeLineDraggable` ~29550); host + peer panels stale. Draft iframe: `_multichartPostDraftSnapshotToParent` (~23954) syncs hidden `#orderPanel` fields to parent rail only — not open legs. | **Cross-panel order-state convergence:** one **host** order store; panels render projections. Any SL/TP/entry/pending edit on any tile updates host store then fans out snapshot to peers. Per-panel divergence = defect. | **Actuation:** Real 2-up multichart; place order on panel B; drag SL on B; observe panel A. **Measure:** Host `chart.orderManager.openPositions[id].stopLoss` === panel B released SL; panel A line matches within 1 tick. Pending: drag entry on B → panel A `syncPendingOrder` mirror. Switch OFF reproduces divergent SL. **I15:** real iframe pointer on panel B required — not `runCommand` synthetic only. | `window.__TALARIA_DISABLE_ORDER_MC_STATE_CONVERGE_FIX` | `order-manager.js`: emit `order:opened-updated` (new) on open SL/TP drag release; `_syncSplitGroupProtectionPrices` (~36465). `MultichartGrid.jsx`: `broadcastOrder` / `iframe-order` handler (~6502–6513) — new kind `opened-updated`. `panel-cmd-bridge.js`: `syncOpenOrder` case (mirror `syncPendingOrder` ~3565). | **NO** — `multichart-prod` + React shell (Lane 4 / multichart-parent) |

---

## Diagnostic finding — A6-4 (cross-panel order state)

**Where panel 2 holds its copy:**

| Layer | Owner | Evidence |
| --- | --- | --- |
| **Canonical store** | Host tile A `window.chart.orderManager` | `openPositions`, `pendingOrders`; `persistRuntimeOrderState` (~3805); session save via host `chart.scheduleSessionStateSave` |
| **Panel B iframe clone** | Iframe `chart.orderManager` + `orderService` registry | One-time `grid.runCommand('addOrder', …)` (~3752–3758); `registerOpenOrder(ord)` (~3520–3521) |
| **Pending sync (partial)** | Host event bus → postMessage | `order:pending-updated` only (~1008, ~717) |
| **Open SL/TP sync** | **Missing** | No `order:opened-updated`; iframe SL drag writes local `openPositions` only (~29550) |
| **V9 rail / draft** | Parent hidden `#orderPanel` + postMessage snapshot | `_multichartPostDraftSnapshotToParent` (~23954) — draft fields only, not open-leg store |

**Root cause class:** RC-5 ownership defect — multichart treats open positions as **visual clones** with pending-style partial sync, not projections of a single store.

**Limit below SL on panel 2:** Separate manifestation — iframe draft preview uses local `orderManager` + panel-local `yScale`; without host-converged pending snapshot, clamp/offset math can diverge (preview path ~17747–18055, multichart draft active flag).

---

## A6-2 — PO spec (D-019)

**SPEC SETTLED — no open PO question.**

Per [DIRECTOR-DECISIONS.md D-019](DIRECTOR-DECISIONS.md) (2026-07-16):

1. Persist **both pending orders AND open positions** across F5.
2. Scope: **session-scoped** (active trading session / `?sessionId=` path + merged `state_json` / local backup).
3. No-session charts: continue `chart_orders_runtime_local_v1` local fallback (already implemented; verify flush timing).

**Implementation must ensure:** place → persist before first navigation; hydrate → restore runtime patch before replay/order UI mounts; multichart placements on iframe route through host store before persist.

---

## Overlap / ordering — held #4 / #5 cross-track pair

| Held row | Relationship to A6 | Recommended order |
| --- | --- | --- |
| **TAL-00752#4** | Replay + drag **limit** glitches SL — `_syncPreviewToReplayPrice` (~17079) races preview SL drag while `isDraggingPreviewLine` | **Distinct from A6-1** (open SL), but same replay×drag family. Land **A6-1 first** (apply-on-release invariant); then #4 preview-path race in post-b1 order-manager slot |
| **TAL-00752#5** | Keyboard pan glitches order entry during replay — scale/offset desync on draft preview | **Orthogonal to A6-1**; overlaps **A6-3** axis/scale coupling. Hold until Lane 2 pan policy (D-017) stable |
| **A6-1** | Fixes open SL premature close (TAL-01602) | **Freeze-safe; dispatch first** among A6 rows |
| **A6-2** | F5 persistence (TAL-01616) | After A6-1 or parallel; needs chart.js hook coordination |
| **A6-3** | Price-axis vs order (TAL-01615) | After D-019 axis PO ruling; chart.js touch — post combined-build unfreeze |
| **A6-4** | Multichart converge (TAL-01601) | After re-migration Phase 0 + multichart lane clear; diagnostic complete above |

**Coherence rule:** Do not edit `replay-system.js` for A6 — all replay coupling stays in `order-manager.js` guards and store emit/fan-out.

---

## Explicitly OUT OF A6 (other RC / lanes)

| Item | Reason |
| --- | --- |
| TAL-01566 price-label pulls chart (A1 Defect D) | PO cancelled per D-019 — working-as-intended |
| TAL-00752#3 TP/SL flicker | RC-5 visual replay — separate switch `__TALARIA_DISABLE_TP_REPLAY_FLICKER_FIX` |
| Indicator replay legend (T6 M4) | RC-6 — Lane 3 separate track |
| Multichart selection/focus (T3) | RC-4 — prerequisite for A6-4 live RED only |

---

## Freeze-safe vs collision summary

| Row | Order-entry only? | Also touches |
| --- | --- | --- |
| A6-1 | **YES** | — |
| A6-2 | Partial | `chart.js` session save/load hooks (narrow) |
| A6-3 | **NO** | `chart.js` price-axis drag |
| A6-4 | **NO** | `MultichartGrid.jsx`, `panel-cmd-bridge.js` |

---

## Director checkpoint (post-contract)

1. Approve **apply-on-release** as canonical SL/TP interaction invariant (A6-1).
2. Confirm **D-019 persistence spec** is sufficient for A6-2 implementation (no further PO input).
3. Approve **host-canonical + opened-updated fan-out** as A6-4 target (supersedes per-iframe mutable clones).
4. Sequence A6-1 → A6-2 on Lane 3 freeze-safe paths; gate A6-3/A6-4 on combined-build / multichart unfreeze.

**After approval:** Lane 4 registers RED scenarios per row; Lane 3 one gated fix per row.

---

## Worker confirmation

- **No product, harness, or registry files edited.**
- **Docs only:** this contract + `worker-reports/T4-A6-order-interaction-contract-report.md`.
