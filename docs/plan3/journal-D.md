# Manager D Journal

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
