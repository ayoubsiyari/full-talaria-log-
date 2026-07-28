# ESCALATION — live trade-loss path in `api_server.py`

**From:** Manager B. **Found:** 2026-07-28 during adversarial review of the M4 harness (B-R5).
**Territory:** `chart v 1.4/chart/api_server.py` — **not mine.** I have made no change to it and will not.
**Class:** M24 trade loss. This is the condition ship gate M4 exists to detect, and the M4 harness is structurally blind to it.
**Status:** verified by source reading, end to end. **Not** executed against a live server.

---

## The defect

Two functions resolve a trade's identity with **different alias precedence**, and a `DELETE` sits between them.

**Resolver A** — `api_server.py:12359`, inside `_sync_trading_session_journal_trades`, builds the keep-set:

```python
tid = str(raw.get("tradeId") or raw.get("id") or "").strip()
if not tid:
    continue
incoming_ids.add(tid)
```

Two aliases: `tradeId`, `id`.

**Resolver B** — `session_journal_store.py:155-165`, the declared canonical resolver:

```python
def journal_trade_client_id(raw: dict) -> str:
    """Canonical client trade id used in trading_session_journal_trades."""
    return str(
        raw.get("tradeId") or raw.get("trade_id")
        or raw.get("client_trade_id") or raw.get("id") or ""
    ).strip()
```

Four aliases. Its docstring states it is *the* canonical id for this exact table.

**The delete** — `api_server.py:12451-12455`:

```python
q = db.query(TradingSessionJournalTrade).filter(TradingSessionJournalTrade.session_id == session_id)
if incoming_ids:
    q = q.filter(~TradingSessionJournalTrade.client_trade_id.in_(incoming_ids))
for orphan in q.all():
    db.delete(orphan)
```

Every row for the session whose `client_trade_id` is absent from `incoming_ids` is deleted.

## Why that loses trades

A journal row carrying **`trade_id` or `client_trade_id` but not `tradeId` or `id`**:

1. Resolver B accepts it, so a row exists in `trading_session_journal_trades` with a valid `client_trade_id`.
2. Resolver A returns `""`, hits `continue`, and the id is **never added to `incoming_ids`**.
3. The orphan sweep sees a row whose `client_trade_id` is not in the keep-set and **deletes it**.

The row is written under one identity vocabulary and deleted for not existing under a narrower one.

## The part that makes this unambiguous

Both resolvers are used **eleven lines apart in the same request handler**:

```25107:25123:chart v 1.4/chart/api_server.py
        _sync_trading_session_journal_trades(db, session_id=s.id, user_id=s.user_id, journal=merged)
...
        client_trade_id = sjs.journal_trade_client_id(trade)
        sql_row = (
            db.query(TradingSessionJournalTrade)
            .filter(
                TradingSessionJournalTrade.session_id == session_id,
                TradingSessionJournalTrade.client_trade_id == client_trade_id,
            )
            .first()
```

Line 25107 runs the sweep using the **two**-alias vocabulary. Line 25116 then resolves the same trade with the **four**-alias vocabulary and queries for the row — which, for a vulnerable payload shape, the preceding line has just deleted. The code disagrees with itself inside a single function about what a trade's identity is.

## Severity

- **Silent.** The sweep logs nothing. The trade disappears from the SQL journal with no error surfaced.
- **Repeating.** The sweep runs on every journal sync, so a vulnerable trade is deleted again after any re-add.
- **Exactly the canary-halting condition.** M4 Phase 4 names trade loss as an outright halt.

## What I have NOT established — read before acting

**Reachability is unproven.** I verified the mechanism, not that any live producer emits a journal row carrying only `trade_id`/`client_trade_id`. If no producer does, this is a latent trap rather than an active bug — dangerous the moment a payload shape changes, but not currently losing data.

That question is the whole difference between "halt the canary" and "fix before the next payload change", and it is the first thing the owning manager should settle. I am flagging it as unproven rather than implying urgency I have not earned — but note that the very existence of the four-alias resolver, and its docstring calling those aliases canonical, is evidence that someone expected those shapes to arrive.

Reported by source reading only. Nothing executed against a live server, no product change made.

## Recommendation

Make `_sync_trading_session_journal_trades` use `journal_trade_client_id` — the function already declared canonical for this table — so the keep-set and the write path share one vocabulary. That is a one-line change and it removes the class, not the instance.

Additionally: the orphan sweep should not delete on an id it failed to parse. A row it cannot identify should be **retained and reported**, never silently removed. Deleting on a parse failure means any future alias becomes a data-loss bug.

## Consequence for ship gate M4

The M4 harness **cannot detect this**, and could not have. Every check but one filters the ledger to trades the harness itself wrote, using its own four-alias helper — so it only ever inspects rows immune to the defect. A gate blind to the exact failure it exists to catch is worse than no gate, because it converts absence of evidence into a green light. That is being rebuilt separately.
