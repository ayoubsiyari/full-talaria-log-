# Patch Request To Manager B — M24 Ledger Integrity

Owner requested: Manager B (`api_server.py`)
Requester: Manager D (`session_journal_store.py`)
Date: 2026-07-29

## Finding

TAL-01926 maps to a destructive backend edge: chart state PATCH can send a stale shorter `journal` array after refresh, and the current `_sync_trading_session_journal_trades(...)` path in `api_server.py` treats that array as complete replacement authority. That lets an autosave delete SQL journal trades absent from the incoming browser array, matching the reported all-trades/history decrement.

## Requested API Change

Please update `_sync_trading_session_journal_trades(...)` in `chart v 1.4/chart/api_server.py` to accept an explicit replacement flag, then only delete absent SQL rows when that flag is true.

Suggested shape:

```python
def _sync_trading_session_journal_trades(
    db,
    session_id: int,
    user_id: int,
    journal: list,
    *,
    prefer_richer_heavy: bool = False,
    explicit_replace: bool = False,
) -> None:
    ...
    if sjs.should_prune_absent_journal_trades(explicit_replace=explicit_replace):
        q = db.query(TradingSessionJournalTrade).filter(
            TradingSessionJournalTrade.session_id == session_id
        )
        if incoming_ids:
            q = q.filter(~TradingSessionJournalTrade.client_trade_id.in_(incoming_ids))
        for orphan in q.all():
            db.delete(orphan)
```

Call-site intent:
- `/api/sessions/{session_id}/state` chart PATCH: leave `explicit_replace` omitted/false.
- CSV import `mode=replace`: pass `explicit_replace=True`; append stays false.
- Seed demo trades `mode=replace`: pass `explicit_replace=True`; append stays false.
- Manual journal upsert that merges against the resolved full journal may pass true if it continues to submit the full merged set.

## Guard Already Added In Manager D Scope

`session_journal_store.py` now exposes:

```python
SESSION_JOURNAL_PATCH_DELETE_GUARD=true
sjs.should_prune_absent_journal_trades(explicit_replace=False) == False
sjs.should_prune_absent_journal_trades(explicit_replace=True) == True
```

Kill-switch:
- `SESSION_JOURNAL_PATCH_DELETE_GUARD=0` restores legacy prune-on-chart-PATCH behavior for emergency rollback.

## Evidence

RED discriminator:

```powershell
py -c "import os, sys; sys.path.insert(0, r'chart v 1.4/chart'); os.environ['SESSION_JOURNAL_PATCH_DELETE_GUARD']='0'; import session_journal_store as sjs; assert not sjs.should_prune_absent_journal_trades(explicit_replace=False), 'legacy shorter PATCH would prune missing trades'"
```

GREEN gate:

```powershell
$env:PYTHONPATH='chart v 1.4/chart'; py -m pytest "chart v 1.4/chart/tests/test_session_journal_store.py"
```

No real user data or production DB access is required.
