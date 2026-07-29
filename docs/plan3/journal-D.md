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
