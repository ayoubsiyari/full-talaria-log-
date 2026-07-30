# Manager D Journal

## 2026-07-30 — CKPT-01 binding (Director 14:45 amendment)

- Read and copied `AMENDMENT-DIRECTOR-RUNS-THE-MILES-20260730-1445.md`. AUTH-01: no permission pauses inside dispatch; journal and keep moving. CKPT-01 applies to D risky money-path landings.
- Hard checkpoint taken **before** the next OM product landing (system still green):
  - Tag: `ckpt/pre-d-money-conf01-d5b790e56` on tip `d5b790e56`
  - Retained bytes: `artifacts/ckpt/pre-d-money-conf01-d5b790e56/` (both `order-manager.js` mirrors, SHA `A788A611…2D0D68`); durable also via tag tree blobs
  - Kill-switch: required on each subsequent landing (FLAG-01/02/03); reuse existing money flags when mechanism matches
  - Rollback **exercised while green**: corrupt probe → restore from artifact → SHA match; tip gates GREEN
- Record: `docs/plan3/CKPT01-D-MONEY-PATH-20260730.md`
- H-S18/H-S83 reopen (TAL-01887/01910/01939) owner-routed to **A** (`OWNER-A-HS18-HS83-CONF01-20260730.md`) — harness/chart territory, not D money rewrite
- MEAS-01 page stamp still TBD until B serves; train ID is tip SHA until then

## 2026-07-30 — CONF-01 / DUR-01 (Director 14:30)

- Binding: shipping reference is 4 panels / 4 symbols / 4 TFs / indicators / orders; same-pair has no acceptance weight; performance is slope-over-duration.
- **D1:** Re-audited `fixed` gates. Reopened TAL-01887 / TAL-01910 / TAL-01939 (`H-S18`/`H-S83` `pair: 'same'`). Strengthened Rayan #2/#8, M24 restore mixed-symbol hydrate, and cross-TF peer isolation (kept TAL-01802/01886 fixed). Honest `fixed` = **48**.
- **D2:** Rayan #2 teardown asserts four distinct symbols; Rayan #8 gap/place-audit use mixed-symbol / cross-panel cells. GREEN + RED kills verified.
- **D3:** Note to C — TAL-01941 unit soak rides C2 duration; no second long harness (`NOTE-C-TAL01941-SOAK-INTO-C2-20260730.md`).
- **D4:** M24 #5→#942 restore gate complete (mixed-symbol cell); `.red.test.mjs` remains RED under legacy path.
- **D5:** Restaged `PO-SCRIPTS-NEXT-BUILD-20260730.md` — every pack opens CONF-01 layout first; packs still AWAITING STAMP.

## 2026-07-30 — Director 13:50 Rayan #8 / Rayan #2

- Rayan #8A skipped ID: existing `m24-order-id-allocator` + `m24-order-id-restore-stability` cover stale-counter collisions and hydrate display renumber (`#5→#942`); they did **not** cover a persisted counter ahead of live rows when pending `#8` vanished on hydrate (next mint jumped to `#9`). Fix: `_m24ReconcileOrderIdCounter()` now prefers `max(live ids)+1` over a stale persisted counter when `__TALARIA_DISABLE_M24_ORDER_ID_GAP_RECONCILE_V1` is absent (default ON). Gate: `node "chart v 1.4/chart/modules/m24-order-id-gap-after-hydrate.test.mjs"` ± homepage; RED `TALARIA_TEST_DISABLE_M24_ORDER_ID_GAP_RECONCILE=1`.
- Rayan #8B self-opened sell: no deterministic PO repro. Added strict audit hook `_pushOpenPosition` / `_assertExplicitPlaceAudit` (active only when `window.__TALARIA_ORDER_EXPLICIT_PLACE_AUDIT_STRICT`; kill `__TALARIA_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT_V1`). `executePendingOrder` uses `pending-fill` source. **Root-cause hypothesis:** idle replay still auto-fills ghost/stale `pendingOrders` via `checkPendingOrders` → `executePendingOrder` (user-visible “self-open” without a fresh confirm), possibly combined with multichart mirror resurrect class already gated elsewhere. Gate: `node "chart v 1.4/chart/modules/order-explicit-place-audit.test.mjs"` ± homepage; RED `TALARIA_TEST_DISABLE_ORDER_EXPLICIT_PLACE_AUDIT=1`.
- Rayan #2: lag half is **Cluster A** (multichart perf); **vanished open order** is D money-path. Static + contract gate asserts `MultichartGrid` / `multichart-manager` `removeChart` paths do not assign host `openPositions = []`, and host journal/open rows survive simulated peer panel teardown. Gate: `node "chart v 1.4/chart/modules/order-mc-layout-teardown-retains-host-orders.test.mjs"` ± homepage; RED `TALARIA_TEST_DISABLE_MC_LAYOUT_HOST_ORDER_RETAIN=1`.

## 2026-07-30 — M24 Restore-Time Display Identity Escape

- PO b103 result: history count survived refresh, but displayed trade ID changed from `#5` to `#942`. The existing allocator gate only covered minting new IDs past stale counters; it did not cover session hydrate / journal restore display identity.
- RED: `node "chart v 1.4/chart/modules/m24-order-id-restore-stability.test.mjs"` failed before the fix with `942 !== 5`.
- Fix: legacy order-manager display surfaces now use `_resolveJournalDisplayTradeId()` behind `__TALARIA_DISABLE_M24_DISPLAY_ID_STABILITY_V1` (default ON). The corrected resolver prefers the client/session ID (`client_trade_id` / `clientTradeId` / `tradeId`) so hydrate cannot replace `#5` with backend `user_trade_id`/`display_trade_id`/`journal_trade_id`. CSV/export now uses separate `_resolveJournalExportTradeId()` so display IDs cannot re-key ledger import/export. Allocator/dedupe semantics are not changed by this display fix.
- GREEN: `node "chart v 1.4/chart/modules/m24-order-id-restore-stability.test.mjs"` and `node "homepage/public/chart/modules/m24-order-id-restore-stability.test.mjs"` pass, including the real hydrated row shape, equal client/user/journal IDs, zero display/user IDs, export identity, and kill-switch OFF legacy coverage.
- Tier: money-path display/journal packet. Initial TOP review rejected the synthetic hydrate shape and user-id preference. Corrected packet was TOP-reviewed by `claude-opus-5-thinking-high` and ACCEPTED. Residual canary gates: module cache-buster/redeploy required before PO sees it, and deployed-build Script 1 must verify M24 on the live stamp.

## 2026-07-30 — PO Visuals: Multi-TP Drift, SL Edge, Label/Hover Mechanism

- Multi-TP drift root cause: coincident TP rungs were made separable by moving the visible preview row. Fix keeps the visible TP line/label/y-axis price at the true price and applies `_hitStackOffsetY` only to the invisible hit line, behind `__TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1`.
- Follow-up correction: drag start on the invisible offset hit row still had to subtract `_hitStackOffsetY` before price math; `_previewDragHitOffsetY()` now keeps drag geometry hit-only, and Escape/cancel restores the hit row offset instead of collapsing it onto the visible line.
- Multi-TP gates: `node "chart v 1.4/chart/modules/order-multi-tp-coincident-stack.test.mjs"` and `node "homepage/public/chart/modules/order-multi-tp-coincident-stack.test.mjs"` pass, including kill-switch OFF coverage and hit-row drag source coverage.
- Placed SL partial-disappearance root cause: two mechanisms. Executed SL/TP rows used raw `yScale(price)` for visibility/clip checks, so a line landing just outside the price-pane edge could be hidden or clipped. Pending placed SL/TP rows could also be shortened to the label column by `_alignAllOrderLabels()` after placement.
- SL edge/placement gates: `node "chart v 1.4/chart/modules/order-line-edge-visibility.test.mjs"` and `node "homepage/public/chart/modules/order-line-edge-visibility.test.mjs"` pass, including kill-switch OFF legacy-hidden coverage and pending full-width `x2` coverage.
- Value-box shaky and sequential hover root cause: `renderPreviewLabel()` rebuilt the preview toast/value-box shell with `labelGroup.selectAll('*').remove()` on every live refresh, then hover controls restored opacity with an extra forced layout read per badge. Fix behind `__TALARIA_DISABLE_ORDER_STABLE_LABEL_HOVER_DOM_V1`: preserve and update the `.order-level-toast-label` shell in place when the label shape is unchanged, clear only adjacent controls before rebuilding them, and restore hover-control transitions in one rAF batch with no per-badge forced reflow.
- Stable label/hover gates: `node "chart v 1.4/chart/modules/order-stable-label-hover-dom.test.mjs"` and `node "homepage/public/chart/modules/order-stable-label-hover-dom.test.mjs"` pass. The gate covers value-box shell reuse, control rebuild without shell teardown, kill-switch full-teardown legacy behavior, immediate hover visibility, and removal of the old extra layout read.
- Pending SL/TP resurrect after re-drag+cancel root cause: local pending protection clears did not emit a cleared pending snapshot to peer panels, so a stale multichart peer could rebroadcast old `stopLoss`/`takeProfit`/`tpTargets` on the next drag. Fix behind `__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1`: after pending SL/TP clear, emit `_emitPendingMirrorSync()` for every cleared pending record, including split-group legs, so peer panels receive explicit null protection. Gate: `node "chart v 1.4/chart/modules/order-pending-protection-clear.test.mjs"` and homepage mirror pass. TOP review initially rejected the fake two-array mirror test; corrected alias-shape/snapshot-emission packet was TOP-reviewed by `claude-opus-5-thinking-high` and ACCEPTED. Residual: `homepage/out` export copy must be rebuilt before deployed PO verification.
- Open-row clustering: created `docs/plan3/UNVERIFIED-MECHANISM-CLUSTERS-20260730.md` and current canary authority `docs/plan3/CANARY-LEDGER-20260730.md`. Persistence/backend write-read is first and must be checked with B before frontend persistence edits; reports with no reproducible steps moved to NEEDS-INFO rather than PO scripts. Follow-up owner split recorded there: symbol persist to A, timezone residuals to A/M20-A, pins/favorites to B merge/backend, layout isolation remains open, and owner-identity shell resets split across A/B/homepage/backend.

## 2026-07-29 — M24 / TAL-01926

- Charter files requested at start were absent in the original checkout: `docs/plan3/CHARTER-D-TRADE-CORRECTNESS-20260729-1310.md` and `docs/plan3/AUDIT-TICKET-BACKLOG-20260729-1300.md`. Controlling boundary recovered from `docs/plan3/INTAKE-MERGE-20260727.md`, then superseded by Director instruction: `session_journal_store.py` is Manager D scope; `api_server.py` belongs to Manager B.
- Root cause found: `_sync_trading_session_journal_trades` in Manager B's `api_server.py` treats chart PATCH journals as complete replacement authority and deletes SQL rows absent from an incoming browser array. A stale shorter patch after refresh can therefore turn a 28-trade SQL ledger into 27 rows, matching TAL-01926's history decrement / frozen all-trades stat.
- Manager D fix in owned file: `session_journal_store.py` now exposes `should_prune_absent_journal_trades(explicit_replace=...)`, guarded by `SESSION_JOURNAL_PATCH_DELETE_GUARD` (default ON). Chart PATCH should be additive by omission; explicit replace/import paths may still prune.
- Manager B request written at `docs/plan3/PATCH-REQUEST-B-M24-API-SERVER-20260729.md`; no Manager D edit to `api_server.py`.
- RED: `SESSION_JOURNAL_PATCH_DELETE_GUARD=0` makes the defect assertion fail with `legacy shorter PATCH would prune missing trades`.
- GREEN: `py -m pytest "chart v 1.4/chart/tests/test_session_journal_store.py"` with `PYTHONPATH=chart v 1.4/chart` passed 14/14.
- I16/data safety: no live user data or production DB touched; all evidence is helper-level synthetic rows only.

## 2026-07-29 — M14 / Fibonacci Settings

- Root cause found: saved Fibonacci dialog levels were copied into `drawing.style.levels`, but the canonical drawing object kept constructor/default `drawing.levels`. Reopen/render paths read `drawing.levels`, so accepted custom levels reverted to the default 0.236/0.382/0.5/0.618/0.786 set.
- Fix: `applySavedStyle` rehydrates canonical `drawing.levels` from saved fib-style levels for fib-level tools, behind `__TALARIA_DISABLE_M14_FIB_SETTINGS_LEVELS_PERSIST_V1` (default ON). Homepage and canonical chart mirrors are aligned.
- RED: with `TALARIA_TEST_DISABLE_M14_FIB_SETTINGS_LEVELS_PERSIST_V1=1`, both M14 tests fail showing default levels instead of `[0, 1, 1.1, 1.3, 1.5, 1.8]`.
- GREEN: both `node "chart v 1.4/chart/modules/m14-fibonacci-settings-levels-persist.test.mjs"` and `node "homepage/public/chart/modules/m14-fibonacci-settings-levels-persist.test.mjs"` pass.

## 2026-07-29 — M24 / Order Identity

- Root cause found: closed-trade journal identity is `tradeId || id`, and close paths call `upsertJournalEntry(..., { skipIfExists: true })`. If a restored stale `orderIdCounter` reuses an existing pending/open/journal numeric id, the later close is silently skipped as an existing journal row. That matches duplicate Order ID, skipped sequence, chart markers without history, missing counts, and frozen P&L reports (Rayan #4/#5/#9/#11, TAL-01908, TAL-01919, TAL-01924).
- Fix: `order-manager.js` now allocates order ids through `_allocateOrderId()`, behind `__TALARIA_DISABLE_M24_ORDER_ID_ALLOCATOR_V1` (default ON). The allocator reconciles the next numeric id against loaded pending orders, open positions, closed positions, journal rows, local `orders`, and `orderService` mirrors before reserving an id. Runtime restore also reconciles immediately after applying persisted counters. Homepage and canonical chart mirrors are aligned.
- RED: `TALARIA_TEST_DISABLE_M24_ORDER_ID_ALLOCATOR=1 node m24-order-id-allocator.test.mjs` fails with stale counter `4 !== 62`, reproducing the duplicate-id condition without user data.
- GREEN: both `node "chart v 1.4/chart/modules/m24-order-id-allocator.test.mjs"` and `node "homepage/public/chart/modules/m24-order-id-allocator.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01904

- Root cause found: the order-type classifier treated any entry within one tick of market as `market`. A BUY entry exactly one tick above current price therefore remained a market order instead of becoming a stop order; SELL one tick below had the same defect.
- Fix: one full tick away now classifies as pending (BUY above/SELL below = stop, BUY below/SELL above = limit), behind `TALARIA_ORDER_TYPE_ONE_TICK_PENDING_V1` / `__TALARIA_DISABLE_ORDER_TYPE_ONE_TICK_PENDING_V1` (default ON). Exact market remains `market`; homepage and canonical mirrors are aligned.
- RED: `TALARIA_ORDER_TYPE_ONE_TICK_PENDING_V1=0 node order-type-one-tick-pending.test.mjs` fails with `'market' !== 'stop'` for BUY one tick above market.
- GREEN: both `node "chart v 1.4/chart/modules/order-type-one-tick-pending.test.mjs"` and `node "homepage/public/chart/modules/order-type-one-tick-pending.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01897

- Root cause found: the panel-close path used `_discardUnplacedOrderDraftLevels()` to zero draft SL/TP and clear TP targets, but `beginNewOrderDraft()` only reset flags and multi-entry rows. Pressing "Make new order" after a placed trade could therefore keep previous `#slPrice`, `#tpPrice`, or TP ladder state.
- Fix: `beginNewOrderDraft()` now uses the same draft-level discard helper, behind `__TALARIA_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET_V1` (default ON). Homepage and canonical mirrors are aligned.
- RED: `TALARIA_TEST_DISABLE_ORDER_ENTRY_NEW_DRAFT_LEVELS_RESET=1 node order-entry-new-draft-reset.test.mjs` fails with previous `slPrice` still present (`'1.09500' !== '0'`).
- GREEN: both `node "chart v 1.4/chart/modules/order-entry-new-draft-reset.test.mjs"` and `node "homepage/public/chart/modules/order-entry-new-draft-reset.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01933

- Root cause found: single-TP close checks required TP to remain on the original side of the current SL (`tp > sl` for BUY, `tp < sl` for SELL). After BE/trailing moved SL past the TP, a later bar could touch the TP but keep the trade open because the TP was treated as non-executable.
- Fix: single-TP executable checks now ignore the current SL side once a valid TP exists, behind `__TALARIA_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL_V1` (default ON). Foreground and background single-TP paths share the same helper. Multi-TP rung gating remains unchanged.
- RED: `TALARIA_TEST_DISABLE_ORDER_SINGLE_TP_AFTER_TRAIL=1 node order-single-tp-after-trail.test.mjs` fails with `false !== true` for BUY TP after SL has trailed above it.
- GREEN: both `node "chart v 1.4/chart/modules/order-single-tp-after-trail.test.mjs"` and `node "homepage/public/chart/modules/order-single-tp-after-trail.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01809

- Root cause found: close paths applied realized losses with raw `this.balance += pnl`, journal recompute assigned `initialBalance + realizedPnL`, and runtime restore trusted persisted balance directly. A loss larger than the current balance could therefore display and persist a negative account balance.
- Fix: balance mutations now route through a shared zero-floor helper, behind `__TALARIA_DISABLE_ORDER_BALANCE_FLOOR_V1` (default ON). Manual closes, SL/TP closes, journal recompute, and runtime restore use the same floor. Homepage and canonical mirrors are aligned.
- RED: `TALARIA_TEST_DISABLE_ORDER_BALANCE_FLOOR=1 node order-balance-floor.test.mjs` fails with `-50 !== 0`.
- GREEN: both `node "chart v 1.4/chart/modules/order-balance-floor.test.mjs"` and `node "homepage/public/chart/modules/order-balance-floor.test.mjs"` pass.

## 2026-07-29 — Cluster G / SEL-01

- Root cause found: per-order pending TP teardown used substring selectors such as `[class*="pending-tp-pct"][class*="pending-tp-1"]`. Those selectors can match other orders with the same prefix, e.g. `pending-tp-12`, causing unrelated pending TP controls/lines to disappear when order `1` is redrawn or removed.
- Fix: per-order pending TP percentage/delete teardown now uses exact compound class selectors, behind `__TALARIA_DISABLE_ORDER_SEL01_EXACT_TEARDOWN_V1` (default ON). Whole-chart sweeps remain intentionally broad; per-order cleanup is exact. Homepage and canonical mirrors are aligned.
- RED: `TALARIA_TEST_DISABLE_ORDER_SEL01_EXACT_TEARDOWN=1 node order-sel01-exact-teardown.test.mjs` fails because the selector still contains `[class*=...]`.
- GREEN: both `node "chart v 1.4/chart/modules/order-sel01-exact-teardown.test.mjs"` and `node "homepage/public/chart/modules/order-sel01-exact-teardown.test.mjs"` pass.

## 2026-07-29 — Timezone Refresh / EST to CST

- Root cause found: `timezone-manager.js` does not fall back to CST. It loads `chartTimezone` and otherwise falls back to `UTC`, as expected. The CST comes from a later V9 settings sync path: `v9-theme-bridge.js` applies `settings.timezone` through `timezoneManager.setTimezone(resolveV9Tz(...))`, and `America/Chicago` is a valid IANA id that overwrites a previously loaded `America/New_York` chart timezone during boot.
- The userStorage-timing hypothesis is refuted as the primary mechanism: the reproduced failure still happens when `userStorage.getItem('chartTimezone')` returns `America/New_York` before the external V9 boot push.
- Fix: `timezone-manager.js` now preserves a valid persisted `chartTimezone` during boot until the first pointer/key user interaction, behind `__TALARIA_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD_V1` (default ON). External pre-interaction pushes that disagree with the stored chart timezone are rejected; post-interaction user timezone changes still apply.
- Residual non-owned hole: V9/session stores can retain stale `America/Chicago` and re-apply it after the boot guard releases. Patch request written at `docs/plan3/PATCH-REQUEST-V9-TIMEZONE-DUAL-STORE-20260729.md`; Manager D did not edit V9 settings, `chart.js`, or `replay-system.js`.
- RED: `TALARIA_TEST_DISABLE_TIMEZONE_PERSISTED_BOOT_GUARD=1 node timezone-persisted-boot-guard.test.mjs` fails because the old behavior accepts `America/Chicago` and overwrites stored `America/New_York`.
- GREEN: both `node "chart v 1.4/chart/modules/timezone-persisted-boot-guard.test.mjs"` and `node "homepage/public/chart/modules/timezone-persisted-boot-guard.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01861

- Root cause found: the chart preview place/cancel badges fire on `pointerdown` and `click` with debounce stored on the individual badge DOM instance. Market drafts are live-refreshed and can recreate those badges between cancel press and trailing click; a recreated place badge has a fresh debounce and can call `placeAdvancedOrder`, immediately opening a market order after the user pressed cancel.
- Fix: cancel badge press now sets an instance-level short suppression window that blocks recreated place-badge clicks, behind `__TALARIA_DISABLE_ORDER_CANCEL_BEFORE_CONFIRM_V1` (default ON). Later intentional place clicks still work after the suppression window.
- RED: `TALARIA_TEST_DISABLE_ORDER_CANCEL_BEFORE_CONFIRM=1 node order-cancel-before-confirm.test.mjs` fails with the recreated-place click not suppressed.
- GREEN: both `node "chart v 1.4/chart/modules/order-cancel-before-confirm.test.mjs"` and `node "homepage/public/chart/modules/order-cancel-before-confirm.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01885

- Root cause found: pending limit/stop SL rows are created, but `positionPendingOrderTargets()` hides the line/label/hitLine when the row Y falls just outside the computed main plot. Indicator-stack plot bounds and clip paths can therefore make a valid pending SL look missing at the edge.
- Fix: pending SL/TP/BE target rows now clamp just-beyond-edge Y coordinates back to the main price plot edge instead of hiding them, behind `__TALARIA_DISABLE_ORDER_LINE_EDGE_VISIBILITY_V1` (default ON). Far outside prices remain hidden; entry rows are not edge-clamped.
- RED: `TALARIA_TEST_DISABLE_ORDER_LINE_EDGE_VISIBILITY=1 node order-line-edge-visibility.test.mjs` fails with `null !== 270` for a pending SL just below the plot.
- GREEN: both `node "chart v 1.4/chart/modules/order-line-edge-visibility.test.mjs"` and `node "homepage/public/chart/modules/order-line-edge-visibility.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01905

- Root cause found: `_refreshAllGuardsToTimestamp(t)` defaulted an omitted tick argument to `-1`. In candle replay, that allows `_tickAnimOverridesGuard()` to inspect the destination candle's full high/low immediately after a seek/panel re-arm, recreating the TAL-01815 instant-close class without needing a fresh price event.
- Fix: omitted guard ticks now default to strict `Infinity`, behind `__TALARIA_DISABLE_ORDER_SEEK_GUARD_INFINITY_V1` (default ON). Explicit `-1` callers still get legacy same-candle evaluation when intentionally passed.
- RED: `TALARIA_DISABLE_ORDER_SEEK_GUARD_INFINITY_V1=1 node --test order-lifecycle-event-ownership.test.mjs` fails with `-1 !== Infinity`.
- GREEN: both `node --test "chart v 1.4/chart/modules/order-lifecycle-event-ownership.test.mjs"` and `node --test "homepage/public/chart/modules/order-lifecycle-event-ownership.test.mjs"` pass 14/14.
- TAL-01932 is separate: manual opposing SELL LIMIT is currently a new pending short, not close-by/netting against open BUY size. Do not merge it with this guard-lifecycle fix.

## 2026-07-29 — Cluster G / TP-SL Drag Family

- Root cause found: yes, the `beginNewOrderDraft()` fix for TAL-01897 could cause the reported symptom. It cleared visible draft SL/TP fields via `_discardUnplacedOrderDraftLevels()`, but that helper did not clear hidden draft constraint state: provisional SL/TP drag baseline, RR Execute/tool coupling, manual-position flags, and preview drag flags. The next SL drag could therefore start from an old committed SL even though `#slPrice` displayed empty.
- Fix: `_discardUnplacedOrderDraftLevels()` now also clears hidden new-draft constraint state, behind `__TALARIA_DISABLE_ORDER_NEW_DRAFT_CONSTRAINT_RESET_V1` (default ON). The visible no-inheritance fix remains intact.
- RED: `TALARIA_TEST_DISABLE_ORDER_NEW_DRAFT_CONSTRAINT_RESET=1 node order-new-draft-constraint-reset.test.mjs` fails because `_rrExecuteArmed` and stale provisional drag state survive while fields clear.
- GREEN: both `node "chart v 1.4/chart/modules/order-new-draft-constraint-reset.test.mjs"` and `node "homepage/public/chart/modules/order-new-draft-constraint-reset.test.mjs"` pass. Existing `order-entry-new-draft-reset.test.mjs` still passes in both mirrors.

## 2026-07-29 — Cluster E / TAL-01927

- Root cause found: entry screenshot capture was not idempotent. Market placement, drawing-tool market placement, and pending fill always called `captureChartSnapshot()` even when a restored order already had `entryScreenshot` or `entryScreenshotRef`. After play/refresh, that could attach a second PRE image for the same trade.
- Fix: entry screenshot capture now routes through `_captureEntryScreenshotOnce()`, behind `__TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT_V1` (default ON). Existing entry screenshots/refs suppress recapture; fresh captures still attach once and critical-persist after the screenshot lands. Homepage and canonical mirrors are aligned.
- RED: `TALARIA_TEST_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT=1 node "chart v 1.4/chart/modules/order-entry-screenshot-idempotent.test.mjs"` fails because a restored entry screenshot recaptures.
- GREEN: both `node "chart v 1.4/chart/modules/order-entry-screenshot-idempotent.test.mjs"` and `node "homepage/public/chart/modules/order-entry-screenshot-idempotent.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01932

- Root cause found: pending fill conversion always treated a touched pending order as a new open position. A full-size opposing SELL LIMIT against an existing BUY therefore opened a hedge/short instead of closing the long, so the intended 5-contract close did not trigger.
- Fix: exact full-size opposing pending fills now resolve to the existing `closePositionAtPrice()` path before new-position conversion, behind `__TALARIA_DISABLE_ORDER_PENDING_CLOSE_NETTING_V1` (default ON). Scope is intentionally narrow: same symbol/source, opposite side, exact quantity, non-split, non-scale orders only. Partial-size opposing orders keep legacy behavior until a separate partial-close design is requested.
- RED: `TALARIA_TEST_DISABLE_ORDER_PENDING_CLOSE_NETTING=1 node "chart v 1.4/chart/modules/order-pending-close-netting.test.mjs"` fails because the opposing pending fill is not handled as a close.
- GREEN: both `node "chart v 1.4/chart/modules/order-pending-close-netting.test.mjs"` and `node "homepage/public/chart/modules/order-pending-close-netting.test.mjs"` pass.

## 2026-07-29 — Cluster E / TAL-01903

- Root cause found: journal restore/hydrate replaced `tradeJournal` via `_m19CommitJournalArray()`, but did not recompute account state at the same authority boundary. The UI could therefore keep a stale `account_runtime.balance`/header PnL from an earlier hot patch until another path later recomputed from closed rows, producing a PnL jump after refresh.
- Fix: structural journal replacement now immediately recomputes balance, equity, and header realized PnL from the restored journal, behind `__TALARIA_DISABLE_ORDER_PNL_RESTORE_STABLE_V1` (default ON). Hot runtime state remains the fallback when no journal rows have been restored.
- RED: `TALARIA_TEST_DISABLE_ORDER_PNL_RESTORE_STABLE=1 node "chart v 1.4/chart/modules/order-pnl-refresh-stable.test.mjs"` fails with stale `12000 !== 10075`.
- GREEN: both `node "chart v 1.4/chart/modules/order-pnl-refresh-stable.test.mjs"` and `node "homepage/public/chart/modules/order-pnl-refresh-stable.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01777

- Root cause found: pair/symbol visual sync removed placed-order drawings that did not belong to the active ticker, but left an unplaced order draft alive. The old pair's draft SL/TP fields and preview state could therefore remain attached after switching to another pair.
- Fix: `syncOrderVisualsToActiveChart()` now detects active ticker changes and discards any open unplaced draft state, behind `__TALARIA_DISABLE_ORDER_PAIR_SWITCH_DRAFT_REBIND_V1` (default ON). The cleanup closes/removes the draft panel/preview and clears hidden draft SL/TP stores; ordinary same-ticker redraws do not discard drafts.
- RED: `TALARIA_TEST_DISABLE_ORDER_PAIR_SWITCH_DRAFT_REBIND=1 node "chart v 1.4/chart/modules/order-pair-switch-draft-rebind.test.mjs"` fails because the old pair draft remains.
- GREEN: both `node "chart v 1.4/chart/modules/order-pair-switch-draft-rebind.test.mjs"` and `node "homepage/public/chart/modules/order-pair-switch-draft-rebind.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01750

- Root cause found: split-entry handles treated any non-zero price movement as an intentional split. A hover or micro-drag with a tiny pointer movement could therefore add a second entry even though the user did not deliberately drag the handle.
- Fix: split-entry handle drag-end now requires an intentional pixel movement as well as a non-zero price movement, behind `__TALARIA_DISABLE_ORDER_SPLIT_ENTRY_HOVER_STICK_V1` (default ON). The threshold is 4px; larger drags still add split entries/TPs normally. Homepage and canonical mirrors are aligned.
- RED: `TALARIA_TEST_DISABLE_ORDER_SPLIT_ENTRY_HOVER_STICK=1 node "chart v 1.4/chart/modules/order-split-entry-hover-stick.test.mjs"` fails because a 2px micro-drag is accepted.
- GREEN: both `node "chart v 1.4/chart/modules/order-split-entry-hover-stick.test.mjs"` and `node "homepage/public/chart/modules/order-split-entry-hover-stick.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01810

- Root cause confirmed: legacy exit marker price-refinement can drift a spread-side SL/TP exit back toward the entry candle when mid OHLC does not contain the spread-adjusted close price. This is separate from the draft/restore tickets.
- Fix status: no new production code needed in this batch. Existing canonical trade-marker projection (`__TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1`, default ON) maps exit markers by immutable hit time instead of rescanning by mid-price containment, which covers the spread-column failure.
- RED: `TALARIA_DISABLE_TRADE_MARKER_CANONICAL_PROJECTION_V1=1 node "chart v 1.4/chart/modules/order-exit-marker-spread-column.test.mjs"` fails with legacy marker index `0 !== 2`.
- GREEN: both `node "chart v 1.4/chart/modules/order-exit-marker-spread-column.test.mjs"` and `node "homepage/public/chart/modules/order-exit-marker-spread-column.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01683

- Root cause found: with SL/TP apply-on-release active, dragging preview SL commits the new value to `#slPrice` only on drag end. The commit path updated the hidden SL input but did not rerun risk-based sizing, so fixed-dollar / percent-risk quantity could remain sized from the previous SL distance.
- Fix: SL preview drag commit now recalculates position size for `risk-usd` and `risk-percent` modes, behind `__TALARIA_DISABLE_ORDER_RISK_QTY_ON_SL_COMMIT_V1` (default ON). Lot-size mode is unchanged.
- RED: `TALARIA_TEST_DISABLE_ORDER_RISK_QTY_ON_SL_COMMIT=1 node "chart v 1.4/chart/modules/order-risk-qty-on-sl-commit.test.mjs"` fails because SL commits but sizing is not recalculated.
- GREEN: both `node "chart v 1.4/chart/modules/order-risk-qty-on-sl-commit.test.mjs"` and `node "homepage/public/chart/modules/order-risk-qty-on-sl-commit.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01751

- Root cause found: preview BE trigger, pending BE line, open BE line, and BE trigger evaluation could use different anchors. Place-time tick snap, split/pending average entry, or open first-leg anchor could therefore move the BE level after the user clicked Place.
- Fix: place now persists the preview BE trigger as `breakevenSettings.triggerPrice`, and pending/open rendering plus trigger evaluation prefer that frozen trigger, behind `__TALARIA_DISABLE_ORDER_BE_PLACE_ANCHOR_V1` (default ON). Manual BE drags update the persisted trigger so later redraws do not revert.
- RED: `TALARIA_TEST_DISABLE_ORDER_BE_PLACE_ANCHOR=1 node "chart v 1.4/chart/modules/order-be-place-anchor.test.mjs"` fails because BE recomputes from the moved fallback anchor (`1.115 !== 1.1125`).
- GREEN: both `node "chart v 1.4/chart/modules/order-be-place-anchor.test.mjs"` and `node "homepage/public/chart/modules/order-be-place-anchor.test.mjs"` pass.

## 2026-07-29 — TAL-01895 / TAL-01792

- Root cause found: timeframe pins had a preference bridge, but empty cloud preference fields could overwrite non-empty local user pins during preference load. Drawing-tool pins were worse: `FavoritesManager` only persisted `chart_favorite_tools` locally and never entered the user-level preferences payload, so pins could not appear in a new session.
- Fix: pinned timeframes and pinned drawing tools are now user-level preferences, behind `__TALARIA_DISABLE_PINS_USER_PREFS_V1` (default ON). Preference load preserves non-empty local pin arrays when the server field is empty and queues that merge for sync; drawing-tool pin save/load now uses the preferences bridge while keeping the scoped local key in sync.
- RED: `TALARIA_TEST_DISABLE_PINS_USER_PREFS=1 node "chart v 1.4/chart/modules/pins-user-preferences.test.mjs"` fails because empty cloud pins erase local pins.
- GREEN: both `node "chart v 1.4/chart/modules/pins-user-preferences.test.mjs"` and `node "homepage/public/chart/modules/pins-user-preferences.test.mjs"` pass.

## 2026-07-29 — TAL-01865 / TAL-01747

- Owner finding: symbol refresh persistence lives in `chart v 1.4/chart/chart.js`, not in the newly granted preferences modules. Boot uses `urlParams.get('fileId') || this.getPrimarySessionFileId(session)` before loading data, so refresh falls back to the session's primary instrument unless the URL carries the switched `fileId`.
- Pair-switch code later mutates `this.currentFileId` and `this.currentSymbol` inside `chart.js`, but I found no granted-module persistence site that writes the switched file/symbol back to session state. Fix requires a grant for `chart.js` or routing to Manager A.

## 2026-07-29 — Cluster E / TAL-01927 changed shape

- Root cause found: the earlier duplicate-screenshot fix made entry capture idempotent and critical-persisted runtime order state after a fresh screenshot attached, but if the matching trade was already in `tradeJournal`, the late screenshot mutated only the live order object. The visible card could therefore show the in-memory screenshot while the durable journal row stayed screenshot-empty and came back empty after refresh.
- This was not the M24 prune guard deleting the row; the server-side prefer-richer merge already preserves screenshot fields from marked slim patches. The missing edge was client-side journal row propagation after a late capture.
- Fix: `_captureEntryScreenshotOnce()` now copies a late entry screenshot/ref into the matching journal row and calls `persistJournal()`, behind `__TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_JOURNAL_RETENTION_V1` (default ON). Existing duplicate-capture idempotency remains behind `__TALARIA_DISABLE_ORDER_ENTRY_SCREENSHOT_IDEMPOTENT_V1`.
- RED: `TALARIA_TEST_DISABLE_ORDER_ENTRY_SCREENSHOT_JOURNAL_RETENTION=1 node "chart v 1.4/chart/modules/order-entry-screenshot-idempotent.test.mjs"` fails because the journal row remains screenshot-empty.
- GREEN: both `node "chart v 1.4/chart/modules/order-entry-screenshot-idempotent.test.mjs"` and `node "homepage/public/chart/modules/order-entry-screenshot-idempotent.test.mjs"` pass.

## 2026-07-29 — Cluster G / TAL-01941

- Scope decision: no speculative SL fill change. Report lacks pair/timeframe/repro, so this batch adds bounded decision evidence only.
- Instrumentation: local BUY/SELL SL paths now record `hit`, `guarded-touch-miss`, and `skipped-touch` rows into `window.__talariaOrderSlTriggerDiag` and `orderManager._slTriggerDiag`, capped at 80 rows, behind `__TALARIA_DISABLE_ORDER_SL_TRIGGER_DIAG_V1` (default ON). Rows include order id, side, ticker/sourceFileId, stop, bid/ask extremes, effective extreme, guard time/tick, skip reason, bar time, and fill price when applicable. Console output remains quiet unless `window.__TALARIA_ORDER_SL_TRIGGER_DIAG_LOGS === true`.
- Ownership note: TAL-01896 still points at `chart v 1.4/talaria-design/src/orderManagerTradeRows.js`, outside Manager D's grant. I did not edit it.
- RED: `TALARIA_TEST_DISABLE_ORDER_SL_TRIGGER_DIAG=1 node "chart v 1.4/chart/modules/order-sl-trigger-diagnostics.test.mjs"` fails because diagnostics are disabled.
- GREEN: both `node "chart v 1.4/chart/modules/order-sl-trigger-diagnostics.test.mjs"` and `node "homepage/public/chart/modules/order-sl-trigger-diagnostics.test.mjs"` pass.

## 2026-07-29 — Timezone / V9 theme CST override (narrow grant)

- Grant: `chart v 1.4/chart/modules/v9-theme-bridge.js` only. No `chart.js` edits.
- Root cause confirmed in bridge: `talariaApplyV9ThemeSettings` wrote `settings.timezone` into `chartSettings` and called `timezoneManager.setTimezone(resolveV9Tz(...))`, so a V9/session `America/Chicago` snapshot could replace persisted `chartTimezone=America/New_York` on reload (including after the manager boot guard released).
- Fix: bridge honors persisted `chartTimezone` over a disagreeing V9 timezone during theme apply, behind `__TALARIA_DISABLE_V9_THEME_TZ_HONOR_CHART_V1` (default ON). Rejected `setTimezone` results no longer leave Chicago on `chartSettings.timezone`. Homepage mirror aligned.
- Escalations (not edited): `docs/plan3/PATCH-REQUEST-V9-THEME-TZ-FOLLOWUPS-20260729.md` — `chart.js` `applySessionTimezone` ~1799 and DOM sync ~32040; Live `v9ThemeSync.js` duplicate replace of the bridge global; V9 confirm write-through must `setTimezone` before apply for intentional TZ changes.
- Symbol persist: not implemented. Patch request for A at `docs/plan3/PATCH-REQUEST-A-SYMBOL-PERSIST-20260729.md` (boot read ~2370; pair-switch writes ~5420 / ~10115 / ~10509 / symbol switcher ~17318).
- RED: `TALARIA_TEST_DISABLE_V9_THEME_TZ_HONOR_CHART=1 node v9-theme-tz-honor-chart.test.mjs` fails (Chicago overwrites New_York).
- GREEN: both canonical and homepage `v9-theme-tz-honor-chart.test.mjs` pass.

## 2026-07-29 — Cluster G / TAL-01697 TP-SL drag live panel PnL

- tier=mid author model=gpt-5.5; TOP review required before canary because this is money-path panel PnL / order sizing context.
- Root cause found: apply-on-release drag intentionally withholds `#tpPrice` / `#slPrice` input commits until mouseup, but `calculateAdvancedRiskReward()` and the throttled drag R:R path read those inputs. During a TP/SL drag, panel reward/R:R can therefore stay stale/zero until release even though provisional/preview line geometry has already moved.
- Fix: `order-manager.js` now resolves live preview panel prices from preview-phase provisional SL/TP state or active preview-line geometry, behind `__TALARIA_DISABLE_ORDER_PREVIEW_LIVE_RECALC_V1` (default ON). At rest, typed panel values still win. Homepage mirror aligned.
- TOP review 1: tier=top reviewer model=claude-opus-5-thinking-high result=REJECT. Blocking findings fixed before commit: avoid making the old lot-size `netAtSl` risk branch live by introducing a local `slPrice`; restrict geometry fallback to preview-phase provisional edits (not open-position drags); avoid feeding multi-TP rung provisional prices into single-TP panel price; align mirror test bytes.
- TOP review 2: tier=top reviewer model=claude-opus-5-thinking-high result=ACCEPT. Reviewer verified the prior blockers closed, mirror SHA parity, `node --check`, RED/GREEN, full order sweeps, and no placement / persistence / journal leakage. Residuals recorded: risk-mode quantity still self-corrects on commit rather than live; Escape-cancel can leave display stale until drag end; multi-TP rung PnL remains intentionally out of scope.
- RED: `TALARIA_TEST_DISABLE_ORDER_PREVIEW_LIVE_RECALC=1 node "chart v 1.4/chart/modules/order-preview-live-recalc.test.mjs"` fails because provisional TP is not visible to panel math.
- GREEN: canonical and homepage `order-preview-live-recalc.test.mjs` pass; full canonical and homepage `order-*.test.mjs` sweeps pass with `ALL_ORDER_TESTS_PASS`.

## 2026-07-29 — Tier / fallback review audit

- tier=audit model=gpt-5.5. I found no explicit `API fallback window` marker in `docs/plan3` or the prior transcript. During the resumed fallback-routing window, no money-path packet was accepted as TOP-reviewed: timezone was non-money-path and committed; TAL-01697 live-recalc remained uncommitted and is being TOP-reviewed before commit. Standing action: any money-path commit without a recorded `tier=top reviewer model=... result=ACCEPT` is not canary-ready and must be re-reviewed at TOP.

## 2026-07-29 — Cluster G / Drag-family residual: risk quantity live SL

- tier=mid author model=gpt-5.5; TOP review required before canary because this writes `#orderQuantity`, a placement input.
- Root cause found: TAL-01697 live panel PnL fixed panel math during apply-on-release preview drag, but `calculatePositionFromRisk()` still read committed `#slPrice`. In fixed-risk modes, quantity therefore used the stale SL distance during drag and corrected only at mouseup commit.
- Fix: `calculatePositionFromRisk()` now reads the live preview/provisional SL from `_resolveLivePreviewPanelPrices()` behind `__TALARIA_DISABLE_ORDER_RISK_QTY_LIVE_PREVIEW_SL_V1` (default ON). `#slPrice` still remains uncommitted until release.
- TOP review 1: tier=top reviewer model=claude-opus-5-thinking-high result=ACCEPT. Reviewer verified mirror hash parity, RED/GREEN, full order sweeps, switch composition, and no placement / execution / journal leakage. Residual follow-up identified: cancelling a preview SL drag could leave `#orderQuantity` sized from the abandoned provisional SL until recalculated.
- Follow-up folded into packet before final commit: `_oiCancelActiveProvisionalEdit()` now recalculates risk-mode quantity after preview SL cancel/escape/focus-loss while the same kill-switch is ON, so quantity returns to the committed SL distance.
- TOP review 2: tier=top reviewer model=claude-opus-5-thinking-high result=ACCEPT. Reviewer verified cancel ordering, blast-radius guards, kill-switch parity, mirror SHA, RED/GREEN, and full order sweeps. Residuals recorded: mid-drag place mismatch window if placement could fire without pointer release; host mirrored draft can lag until another snapshot; multi-entry risk-mode branch remains separate.
- RED: `TALARIA_TEST_DISABLE_ORDER_RISK_QTY_LIVE_PREVIEW_SL=1 node "chart v 1.4/chart/modules/order-risk-qty-live-preview-sl.test.mjs"` fails with quantity `10.00` instead of live-distance `5.00`.
- GREEN: canonical and homepage `order-risk-qty-live-preview-sl.test.mjs` pass, including cancel re-size back to committed SL; adjacent `order-preview-live-recalc.test.mjs` and `order-risk-qty-on-sl-commit.test.mjs` pass.

## 2026-07-29 — Cluster G / Drag-family residual: block place during preview drag

- tier=mid author model=gpt-5.5; TOP review required before canary because this blocks a placement path.
- Root cause found: after live preview SL sizing, `#orderQuantity` can reflect provisional SL distance while `placeAdvancedOrder()` still reads committed `#slPrice`. A place call during a preview drag would therefore mix live quantity with stale committed SL.
- Fix: `placeAdvancedOrder()` now exits early while `isDraggingPreviewLine` or preview provisional state is active, behind `__TALARIA_DISABLE_ORDER_BLOCK_PLACE_DURING_PREVIEW_DRAG_V1` (default ON). Placement resumes after drag commit or cancel.
- TOP review: tier=top reviewer model=claude-opus-5-thinking-high result=ACCEPT. Reviewer verified predicate scope matches `_resolveLivePreviewPanelPrices()`, open-position drags are untouched, mirrors match, RED/GREEN and full order sweeps pass. Strengthened test after review to prove idle placement reaches the next guard and both predicate clauses are covered separately.
- RED: `TALARIA_TEST_DISABLE_ORDER_BLOCK_PLACE_DURING_PREVIEW_DRAG=1 node "chart v 1.4/chart/modules/order-block-place-during-preview-drag.test.mjs"` fails because preview drag does not block placement.
- GREEN: canonical and homepage `order-block-place-during-preview-drag.test.mjs` pass; adjacent `order-risk-qty-live-preview-sl.test.mjs` and `order-cancel-before-confirm.test.mjs` pass.

## 2026-07-29 — Cluster G / TAL-01699 coincident multi-TP hit rows

- tier=mid author model=gpt-5.5; TOP review required before canary because this changes TP drag hit-testing.
- Root cause found: this sibling is not another committed-input read site. Priced multi-TP preview rungs at the same visual price are drawn with identical line/hit-line Y, so the front rung can swallow drags and the stacked TP1/TP2 rungs cannot be separated.
- Fix: coincident priced multi-TP preview rungs now get a small visual/hit-row Y offset behind `__TALARIA_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK_V1` (default ON). TP1 stays on the true price row; later coincident rungs offset only for interaction, and pan/zoom refresh preserves the offset.
- TOP review: tier=top reviewer model=claude-opus-5-thinking-high result=ACCEPT. Reviewer verified RED/GREEN, full canonical/homepage order sweeps, mirror parity, kill-switch behavior, and the strengthened pan/zoom geometry assertion. Material residuals: dragging an offset rung converts the visual offset into a small real price delta until the rung separates; wiring from `updatePreviewLines()` to `drawPreviewLine()` is not directly mutation-covered; y-axis pill can jump on first refresh.
- RED: `TALARIA_TEST_DISABLE_ORDER_MULTI_TP_COINCIDENT_STACK=1 node "chart v 1.4/chart/modules/order-multi-tp-coincident-stack.test.mjs"` fails because the second coincident rung offset is `0`.
- GREEN: canonical and homepage `order-multi-tp-coincident-stack.test.mjs` pass, including pan/zoom line/hit-line/label geometry; adjacent `multi-tp-preview-drag-sync.test.mjs` and `order-preview-live-recalc.test.mjs` pass; full canonical/homepage `order-*.test.mjs` sweeps pass.

## 2026-07-29 — Cluster G / TAL-01896 all-trades duration

- Territory carve-out: Director explicitly granted Manager D write access to `chart v 1.4/talaria-design/src/orderManagerTradeRows.js` for TAL-01896 only; A was notified and handed off. Scope is this single file plus tests/journal/docs for the packet.
- tier=mid author model=gpt-5.5; TOP review required before canary because this changes the trade-row / all-trades journal display.
- Root cause found: closed rows with missing/invalid close timestamps used `v9TradeDuration()`'s default `Date.now()` fallback, producing huge wall-clock durations; journal-only closed rows with numeric timestamp strings could fail parsing and collapse to `0h 0m`.
- Fix: closed rows now use a closed-trade duration helper that returns `—` unless both replay open and close times are valid, and journal-only coalescing normalizes numeric seconds/ms strings before `Date.parse`. Existing `__TALARIA_DISABLE_TRADE_DURATION_NORM_V1` keeps the legacy path.
- TOP review: tier=top reviewer model=claude-opus-5-thinking-high result=ACCEPT. Reviewer verified RED/GREEN, mutation coverage for the prior rejection, sibling source tests, `node --check`, and lints. Material residuals: canary will not observe the fix until `dist-v9` bundles are rebuilt by the bundle owner; `holdingTimeMs` remains a separate unresolved canonical-duration source; alternate timestamp keys (`exitDate`, snake_case close fields) remain outside this packet.
- RED: `node "chart v 1.4/talaria-design/src/orderManagerTradeRows.test.mjs"` failed with `139271h 0m !== —` and `0h 0m !== 2h 30m`.
- GREEN: `orderManagerTradeRows.test.mjs` passes with ON-path and kill-switch OFF legacy coverage; `node --test tests/evidence/b70-stage5/b75-tal-01896-duration-oracle.test.mjs` and `node --check orderManagerTradeRows.js` pass.

## 2026-07-29 — TOP re-review queue cleared

- tier=audit model=gpt-5.5; reviewer tier=top model=claude-opus-5-thinking-high result=ACCEPT for all queued money-path commits in `docs/plan3/TOP-REVIEW-REQUEUE-D-20260729.md`.
- Queue result: 13/13 ACCEPT, 0 REJECT. Accepted commits: `b21d236d3`, `f1ddb2e64`, `b3f6cd6de`, `5f3e68368`, `a8d887db1`, `7a2871f24`, `864c2446c`, `c0a0d7620`, `e9d9f7594`, `379394fc0`, `b1196e79c`, `adaffe58e`, `93c842bc8`.
- Residual routed: `c0a0d7620` changed `timezone-manager.js` and broke a non-money-path M20-A sha256 pin; M20-A owner should re-pin/re-review that gate. TIER-01 money-path queue is clear for canary.

## 2026-07-29 — Merge handoff to B / on-call

- Wrote `docs/plan3/HANDOFF-D-TO-B-MERGE-20260729.md` for B's merge: D is on call to review every `order-manager.js` conflict hunk before money-path canary.
- Flagged post-merge D gates that must pass after B resolves conflicts: new-draft constraint reset, live preview PnL, live risk quantity, block-place-during-preview-drag, and coincident multi-TP hit rows.
- noted out-of-grant preferences writes from `6ad9f48ec`: `preferences-sync.js` / `preferences-init.js` add user-level drawing-tool pins, preserve non-empty local timeframe/tool pins over empty cloud arrays, queue them back to API, and expose `save/loadDrawingToolFavorites`. These are not D-ratified and should come through B's merge only if B accepts them.
- Routed residuals again: M20-A owner must re-pin/re-review the `timezone-manager.js` sha256 gate; B must rebuild `dist-v9` bundles before PO can see TAL-01896 in the app.

## 2026-07-29 — M17-DI2 / TAL-01918 completed-bar close mutation

- Read-only diagnosis complete; no product code edited before grant.
- Root cause found: same-symbol multichart replay current-price synchronization writes a host canonical mark into `chart.data[chart.data.length - 1]`. Primary sites are `chart.js` `resolveEffectiveCurrentPrice()`, `replay-system.js` `_applyCanonicalReplayMarkFromDetail()`, and fallback `panel-cmd-bridge.js` `applyCanonicalReplayMarkToPanel()`. Trigger: host replay mark is resolved/broadcast into a same-symbol embed panel; if no forming candle is active, the panel's last display bar is already completed and its `c/h/l` are mutated by a read/render path.
- RED: `node --test "chart v 1.4/chart/modules/m17-di2-completed-bar-close-mutation.red.test.mjs"` fails today on both `last.c/h/l` mutation sites.
- PO check written at `docs/plan3/PO-M17-DI2-COMPLETED-BAR-MUTATION-CHECK-20260729.md`. It is visually observable if a same-symbol multichart panel's closed candle shape or OHLC readout changes after the host price moves; if the PO cannot reproduce the visible change, use the RED gate as the engineering blocker.
- Ticket status ledger written at `docs/plan3/TICKET-STATUS-LEDGER-20260729.md`.
- Follow-up inventory correction: `TAL-01696`, `TAL-01698`, and `TAL-01617` are unknown, not fixed, because no dedicated accepted D-tip product gate exists; `TAL-01941` is not-fixed because it is instrumentation only. Added omitted M23/M6/paired-ticket unknown rows.

## 2026-07-29 — Whole-intake ledger extension and PO checks

- Extended `docs/plan3/TICKET-STATUS-LEDGER-20260729.md` against the raw 2026-07-27 intake blob and Rayan reports. Fixed remains restricted to rows with a product commit and gate; missing current-surface proof is `unknown`.
- Wrote `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` as the single PO checklist for genuinely unknown intake clusters: multichart replay, session resume/Go To, refresh persistence, indicator labels, candle/data integrity, zoom/scale/grid, crosshair, replay controls, and memory/idle lag.
- No product code edited.
- Rebased `manager-d/trade-correctness` onto B's accepted train `manager-b/reconcile-d-20260729` before continuing ledger work.
- Evidence-only sweep closed rows only where the rebased train had a commit and a direct gate/cross-link: M24/TAL-01926 (`95adb8285` + `56b773b90`), M23/TAL-01937 and Rayan #1/#3/#6b (`f127d25dd`), M10/TAL-01800/TAL-01798/TAL-01815 (`c0a0d7620`), and Rayan #11 (`b21d236d3` + `f1ddb2e64`). Current ledger count is 41 fixed / 6 not-fixed / 97 unknown.
- Expanded `docs/plan3/PO-CHECK-FULL-INTAKE-UNKNOWN-CLUSTERS-20260729.md` into one PO script per surviving cluster with row-closing counts. Added `docs/plan3/UNKNOWN-RISK-LABELS-20260729.md`: 47 remaining unknowns are canary-blocking and 50 are cosmetic/non-blocking disclosure items.

## 2026-07-29 — Ruling 8ba4d7a8b / Tier review discipline

- TIER-01 compliance acknowledged: D authors bounded packets at tier=mid on gpt-5.5 and escalates money-path review to TOP.
- TIER-02 recorded: budget pressure reduces the number of concurrent TOP reviews and serializes them; reviewer tier is not downgraded to save budget, and manager tier does not drop without Director ruling.
- Standing journal practice: every future TOP review entry needs one clause naming why TOP is required, e.g. money-path orders/positions/balance/SL-TP execution/trade journal, live proxy config adjacent to money-path, or another explicit Director-approved trigger.

## 2026-07-29 — Canary 24h Phase 1 / zero-unknown ledger collapse

- Read binding canary plan `ad40cbc6b` / `docs/plan3/PLAN-CANARY-24H-20260729-2230.md`. D phase: collapse the remaining unknowns from commits and gates, zero PO time.
- No additional commit+gate closures found after `06d9dea90`; therefore every remaining `unknown` row was converted to `not-fixed` / open rather than left ambiguous. Ledger now has 41 fixed / 103 not-fixed / 0 unknown.
- Updated open-row labels in `docs/plan3/UNKNOWN-RISK-LABELS-20260729.md` to cover every `not-fixed` row: 52 canary-blocking, 51 cosmetic/non-blocking disclosure items.

## 2026-07-29 — Director correction / restore three evidence states

- Director correction accepted: absence of a D-tip commit/gate is not evidence that a row is broken. The ledger must distinguish current-stamp failures from unmeasured rows.
- Restored the three states: `fixed` = commit plus gate; `broken` = RED gate or PO failure on today's build; `unverified` = no evidence either way.
- Reclassified the former open rows accordingly: ledger now has 41 fixed / 1 broken / 102 unverified. `M17-DI2 / TAL-01918` is the only broken row because its RED gate fails today. `TAL-01617` and other no-gate rows are unverified, not broken.
- Reworked `docs/plan3/UNKNOWN-RISK-LABELS-20260729.md` into a blast-radius order for the 102 unverified rows: money path / trade state first, data integrity second, replay/session/stability third, severe visual interaction fourth, cosmetic/current-surface disclosure last.

## 2026-07-29 — PO Band 1 / money-path b99 scripts

- Wrote `docs/plan3/PO-BAND1-MONEY-PATH-B99-20260729.md` as the first PO-ready Band 1 packet, not a complete pack. All four scripts are marked `TESTABLE ON b99` and require MEAS-01 build-stamp capture before results.
- Coverage: 18 Band 1 rows across trade-history registration, order-line/drag visibility, stale order-state cancel/clear, and trade-marker projection. Validation found 18 unique row IDs and no duplicates.

## 2026-07-30 — M24 / b103 order-id restore escape

- PO result on b103: trade history count survived refresh, but displayed trade id changed from `#5` to `#942`.
- Root of gate miss: `m24-order-id-allocator.test.mjs` covers `_allocateOrderId()` and split pending allocation against stale counters. It does not cover session hydrate / journal restore where `id` and `tradeId` can disagree and UI display changes from `trade.id` to `trade.tradeId`.
- RED added: `node "chart v 1.4/chart/modules/m24-order-id-restore-stability.red.test.mjs"` fails with `942 !== 5`, proving hydrate can renumber a displayed closed trade row.
- Ledger correction: `TAL-01908`, `TAL-01919`, and `TAL-01924` moved from `fixed` back to `unverified` because the shared M24 gate proves allocation collision avoidance only, not refresh/hydrate trade-id stability.

## 2026-07-29 — PO Band 1 correction / pending protection re-drag and live lots

- Process correction accepted: future PO scripts must compare the row's last-touching commit time against the live build stamp before using `TESTABLE ON <build>`. Rows touched after the stamp are `NEEDS NEW BUILD`.
- tier=mid author model=gpt-5.5; TOP review required before canary because this is money-path pending-order SL/TP and position sizing.
- Script 3 FAIL confirmed as not covered by the TAL-01897 new-draft reset. Working root cause: pending SL/TP delete/clear paths updated in-memory protection values but did not emit a null protection snapshot to peer panels or force a critical runtime-state persist, allowing stale restored/peer pending snapshots to replay deleted protection levels on later redraw. Fix is behind `__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_CLEAR_V1` (default ON).
- Script 2 gap confirmed: the merged preview-SL quantity fix covered new-order preview math, not placed pending-order protection drags. Pending entry/SL drags now recompute risk-sized lots live from immutable `originalRiskAmount` for explicit `risk-usd` / `risk-percent` pending orders, update the entry-line quantity source, suppress mid-drag fills, and feed the existing live pending panel refresh. Fix is behind `__TALARIA_DISABLE_ORDER_PENDING_PROTECTION_LIVE_SIZE_V1` (default ON).
- RED: `TALARIA_TEST_DISABLE_ORDER_PENDING_PROTECTION_CLEAR=1 node "chart v 1.4/chart/modules/order-pending-protection-clear-live-size.test.mjs"` fails because pending clear does not emit/persist null SL/TP snapshots.
- RED: `TALARIA_TEST_DISABLE_ORDER_PENDING_PROTECTION_LIVE_SIZE=1 node "chart v 1.4/chart/modules/order-pending-protection-clear-live-size.test.mjs"` fails because pending lots stay at the placed quantity during protection drag.
- GREEN: canonical and homepage `order-pending-protection-clear-live-size.test.mjs` pass. Adjacent canonical/homepage `order-risk-qty-live-preview-sl.test.mjs` pass.

## 2026-07-30 — WORK-01 Recovery Complete (C-checkout)

- Relocated four hours of uncommitted work from `full-talaria-log--main` (`manager-c/verification-infra`) into this worktree.
- Commits: `2cc949399` (product packets), `6a99b581a` (canary triage/ledger/journal).
- **B:** `manager-d/trade-correctness` tip is ready for train/build pickup. No commit was made in C's checkout; D paths were path-scoped cleaned there after verify.
- Triage counts (committed): (a)=15, (b)=14, (c)=73, total=102.

## 2026-07-30 — Closure pass 12:10 (no bare unverified)

- Bucket (a): 8 fixed (harness H-S18/19/83 + order-line gates); 6 `blocked-on-build` (TAL-01918/01922 + four M25 gates on `diagnostics/v3-qa123-soak-20260727`).
- Bucket (b): money-path first — TAL-01903/01777 reconfirmed; TAL-01802/01886 + TAL-01807b closed with `ab57a5dac` gates; pending SL/TP clear already `2cc949399`; remaining (b) `owner-blocked` on chart.js/replay/layout.
- Reclassified 26 default-(c): cosmetic 6 / superseded 14 / needs-info 6 — zero PO minutes.
- Five PO scripts assembled in `PO-SCRIPTS-NEXT-BUILD-20260730.md`, ordered by rows-closed/PO-minute, each row tagged re-run vs first look.
- Ledger bare `unverified` count: **0**.

## 2026-07-30 — 12:40 measured-clean-bar + po-eyes packs

- Relabeled 6 former scratched/monitor rows → `closed-scratched` per PO 12:40 measured-clean ruling. Ledger status column has zero forbidden known-limitations labels.
- Owner-blocked 13 listed for Director routing — all **A** — `OWNER-BLOCKED-ROUTING-20260730-1240.md`.
- Bucket (a)/(b) reconfirmed GREEN; 6 remain `blocked-on-build`.
- 26 `po-eyes` packed into five efficiency packs + named money Scripts 1–5; all `AWAITING STAMP` until B confirms stamp. No ready-to-run labels before stamp.

## 2026-07-30 — Fixed-column audit (Director 13:20)

- Audited all 51 `fixed` rows for USER-path coverage and GATE-01 reverse→RED.
- **Reopened: 13** → `broken` with RED `fixed-column-audit.red.test.mjs` (not unverified). Fixed remaining: **38**.
- Money decorations: m23 suite stays GREEN under kill (TAL-01937 / Rayan #1/#3/#6b); duration suite under kill (TAL-01896); journal pytest under guard=0 (TAL-01926); TAL-01807b no reverse lever; CODE-PATH-ONLY money helpers TAL-01904/01809/01933/01810; SEL-01 selector-only; TAL-01733 H-S19 bugswitch stays GREEN.
- Survived break attempts (examples): TAL-01908 restore kill → `942 !== 5`; TAL-01903 PnL kill → `12000 !== 10075`.
- Standing by to fold PO answers on 23 decision rows and run five packs when B confirms stamp.

## 2026-07-30 — Director 13:50 money gates + PO fold-in

- User-path GATE-01 restored for TAL-01904/01809/01933/01810/01926/01937 + TAL-01807b reverse lever.
- Rayan #8: gap reconcile + explicit-place audit (skipped ID + self-open). Rayan #2 money half: layout teardown retain gate (lag → A).
- TAL-01941: randomised SL/TP soak 120 cases (`order-sl-tp-trigger-soak.test.mjs`).
- TAL-01677: **reopened broken** — no commit+gate in git/journal (PO memory close rejected).
- TAL-01893: owner-blocked A (`chart.js` Go-To); M22 does not cover.
- TAL-01744: `intended` (PO). TAL-01894: `feature-request`. TAL-01920 / Rayan #7/#10: `verify-gone`.
- TAL-01850: **Manager A** canary blocker (`OWNER-TAL-01850-KEYBOARD-20260730.md`).
- Five PO packs remain AWAITING STAMP.
