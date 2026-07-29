# Manager D Journal

## 2026-07-29 — M24 / TAL-01926

- Charter files requested at start were absent in this checkout: `docs/plan3/CHARTER-D-TRADE-CORRECTNESS-20260729-1310.md` and `docs/plan3/AUDIT-TICKET-BACKLOG-20260729-1300.md`. Controlling boundary recovered from `docs/plan3/INTAKE-MERGE-20260727.md`: M24 owns trade persistence / order-ledger paths and must not touch `chart.js` or `replay-system.js`.
- Root cause found: `_sync_trading_session_journal_trades` treated every chart PATCH journal as a complete canonical replacement and deleted SQL journal rows absent from the incoming array. A stale shorter browser patch after refresh can therefore turn a 28-trade SQL ledger into 27 rows, matching TAL-01926's history decrement / frozen all-trades stat.
- Fix: chart PATCH journal sync is additive by default behind `SESSION_JOURNAL_PATCH_DELETE_GUARD` (default ON). Explicit replace/import paths pass `explicit_replace=True` and keep prune semantics. Helper now also canonicalizes appended `id`-only rows to `tradeId` so client trade IDs remain stable.
- RED: `SESSION_JOURNAL_PATCH_DELETE_GUARD=0` makes the defect assertion fail with `legacy shorter PATCH would prune missing trades`.
- GREEN: `py -m pytest "chart v 1.4/chart/tests/test_session_journal_store.py"` with `PYTHONPATH=chart v 1.4/chart` passed 14/14.
- I16/data safety: no live user data or production DB touched; all evidence is helper-level synthetic rows only.
