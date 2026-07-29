# Manager D Journal

## 2026-07-29 — M24 / TAL-01926

- Charter files requested at start were absent in the original checkout: `docs/plan3/CHARTER-D-TRADE-CORRECTNESS-20260729-1310.md` and `docs/plan3/AUDIT-TICKET-BACKLOG-20260729-1300.md`. Controlling boundary recovered from `docs/plan3/INTAKE-MERGE-20260727.md`, then superseded by Director instruction: `session_journal_store.py` is Manager D scope; `api_server.py` belongs to Manager B.
- Root cause found: `_sync_trading_session_journal_trades` in Manager B's `api_server.py` treats chart PATCH journals as complete replacement authority and deletes SQL rows absent from an incoming browser array. A stale shorter patch after refresh can therefore turn a 28-trade SQL ledger into 27 rows, matching TAL-01926's history decrement / frozen all-trades stat.
- Manager D fix in owned file: `session_journal_store.py` now exposes `should_prune_absent_journal_trades(explicit_replace=...)`, guarded by `SESSION_JOURNAL_PATCH_DELETE_GUARD` (default ON). Chart PATCH should be additive by omission; explicit replace/import paths may still prune.
- Manager B request written at `docs/plan3/PATCH-REQUEST-B-M24-API-SERVER-20260729.md`; no Manager D edit to `api_server.py`.
- RED: `SESSION_JOURNAL_PATCH_DELETE_GUARD=0` makes the defect assertion fail with `legacy shorter PATCH would prune missing trades`.
- GREEN: `py -m pytest "chart v 1.4/chart/tests/test_session_journal_store.py"` with `PYTHONPATH=chart v 1.4/chart` passed 14/14.
- I16/data safety: no live user data or production DB touched; all evidence is helper-level synthetic rows only.
