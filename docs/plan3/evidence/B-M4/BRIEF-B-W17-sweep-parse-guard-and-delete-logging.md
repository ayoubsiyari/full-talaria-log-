# BRIEF — B-W17 — never delete on an unparsed id, and log every durable journal deletion

**Packet:** B-W17. **Dispatched:** 2026-07-28 13:52 by Manager B.
**Authority:** Director ruling **I-7.1**. Scoped write grant, expires when the hotfix train ships.
**Worktree:** `C:\Users\user\Desktop\talaria1\manager-b-plan3`. TREE-02 applies.
**Incident:** `INCIDENT-TRADE-LOSS-PUBLIC-20260728.md`. Standalone hotfix train (PO D-2).

---

## 0. The grant — read this before you touch anything

**You may modify exactly one function:**

`chart v 1.4/chart/api_server.py` → `_sync_trading_session_journal_trades` (`:12337-12455`).

**Nothing else in that file. Nothing else in that function beyond the two changes
below.** This file is 27,112 lines and is otherwise RED. The `journal-backend/`
grant was withdrawn as misdirected — **do not touch `journal-backend/` at all.**

**Out of scope, explicitly:**

- **Replace semantics themselves.** Not this train. Do not redesign the upsert, do
  not change the `NOT IN` strategy, do not add versioning or soft-delete.
- The PATCH handler at `:25146`, the GET at `:24620`, `_purge_trading_session_rows`,
  the `DELETE /api/sessions/{id}` route, CSV import, and every other caller.
- `session_journal_store.py` — **read it, do not edit it.**
- Any client-side file.

If a change seems to require editing outside `:12337-12455`, **stop and report**.

## 1. Why this exists — the two defects, both verified in shipping source

**Defect 1 — the sweep degrades to delete-everything.**

```12451:12455:chart v 1.4/chart/api_server.py
    q = db.query(TradingSessionJournalTrade).filter(TradingSessionJournalTrade.session_id == session_id)
    if incoming_ids:
        q = q.filter(~TradingSessionJournalTrade.client_trade_id.in_(incoming_ids))
    for orphan in q.all():
        db.delete(orphan)
```

When `incoming_ids` is empty the `NOT IN` narrowing is **skipped**, so the query is
*every row for the session* and all of them are deleted. The empty case does not
delete "rows missing from the array" — it deletes everything.

**Defect 2 — two id resolvers in one codebase disagree, on a delete path.**

The sweep's inline parse accepts **two** keys:

```12359:chart v 1.4/chart/api_server.py
        tid = str(raw.get("tradeId") or raw.get("id") or "").strip()
```

`session_journal_store.journal_trade_client_id` — docstring **"Canonical client
trade id"** — accepts **four** (`tradeId`, `trade_id`, `client_trade_id`, `id`), and
is live at `api_server.py:25116` and `session_journal_store.py:65, :253, :565, :570`.

So a row keyed `trade_id` is canonical by the codebase's own definition and
**invisible to the sweep**: it is absent from `incoming_ids`, so its existing DB row
matches `NOT IN` and is **deleted while present in the payload**. If every row uses
the alias keys, `incoming_ids` is empty and Defect 1 fires — **the whole session is
deleted while the payload is full of trades.**

## 2. Change (b) — never delete on an id that failed to parse

**The rule (Director I-7, from B-0088):** an unidentifiable row is retained and
reported, never removed.

**Implementation — one counter, one branch.** In the existing loop at `:12356-12362`,
count entries whose id does not resolve; then refuse to sweep if the count is
non-zero.

```python
    incoming_ids: set[str] = set()
    unresolved_incoming = 0
    for raw in journal:
        if not isinstance(raw, dict):
            unresolved_incoming += 1
            continue
        tid = str(raw.get("tradeId") or raw.get("id") or "").strip()
        if not tid:
            unresolved_incoming += 1
            continue
        incoming_ids.add(tid)
```

and at the sweep:

```python
    if unresolved_incoming:
        # Fail closed: we cannot say which stored rows these entries correspond
        # to, so we cannot say which are orphans. Retain everything and report.
        print(... , flush=True)   # see §4
        return
```

**Why refusing the entire sweep is the only sound implementation, and not
over-caution:** an incoming entry whose id will not parse cannot be matched to a
stored row *by construction* — that is what failing to parse means. So there is no
way to exempt "just that row" from the sweep. Retaining rows is recoverable; a
delete on this path is not. State this reasoning in your report.

**The legitimate clear must still work.** `journal == []` gives
`unresolved_incoming == 0` and `incoming_ids == set()`, so the sweep proceeds and
correctly deletes all rows. **Do not break this** — it is a real user action.

Note this single counter also subsumes Defect 1's dangerous case: if the journal is
non-empty but nothing resolved, every entry failed, so the counter is non-zero and
the sweep is skipped.

**PRE-RATIFIED BY THE DIRECTOR — do not "fix" this and do not flag it as the banned
pattern.** A `len(journal) > 0 and not incoming_ids` style discriminator here is
**not** the forbidden `length > 0` fix. That ban is on the *client* using emptiness
as a proxy for provenance. This is a backend **parse-failure** signal — "we were
handed rows and could resolve none of them" — a different predicate with a
different meaning. Ruled on in incident §8.

**Do not** widen the inline parse to the four-key resolver as part of this packet.
Making the two resolvers agree changes which rows are considered present and is a
behaviour change on a delete path; it belongs to the replace-semantics work that is
out of scope. **Report the divergence, do not repair it here.**

## 3. Change (a) — log every durable journal deletion

**Per Director I-2 this ships even though it fixes nothing**, because it converts a
permanently unanswerable question — *has this already destroyed a user's trades?* —
into an answerable one. Today the deletion is completely silent.

**Required fields, all of them:**

1. **Session id.**
2. **Row count before and row count after.**
3. **The resolver that produced the id** — name it explicitly. The sweep's inline
   two-key parse is *not* the canonical four-key
   `session_journal_store.journal_trade_client_id`, and naming the resolver in the
   log is what makes Defect 2 visible in production. Use a stable literal such as
   `resolver=api_server._sync_trading_session_journal_trades.inline(tradeId|id)`.
4. **The `client_trade_id`s actually deleted.** Cap the list (e.g. first 50 plus a
   total) so a large delete cannot produce an unbounded log line.

**Log on every sweep that deletes at least one row.** Also log, distinctly, the
refusal case from §2 — a suppressed sweep is exactly as informative as a performed
one, and per the incident the absence of a record is the whole problem.

**Do not log trade payloads, prices, or anything beyond ids and counts.**

**Match the file's existing convention:** `api_server.py` has no logger; it uses
`print(f"...", flush=True)` (see `:2181`, `:2718`). Use that. **Do not introduce
`logging`, a new handler, or a dependency.**

**The log must not be able to break the write path.** If building the message can
raise (it should not, but ids come from user data), wrap it so a logging failure
cannot abort or roll back the transaction. A logging bug must never become a new
data-loss path — that would be this packet causing the class of defect it exists
to fix.

## 4. Acceptance — RED before GREEN, GUARD-01 named cells

Tests go in `chart v 1.4/chart/tests/` with the existing `pytest` convention
(`conftest.py` and `test_session_journal_store.py` are the models to follow). Use a
real SQLite-backed session if the existing fixtures allow it; otherwise a fake `db`
exposing `query/filter/all/add/delete` is acceptable — **say which you used.**

Cells 1, 2 and 5 **must be demonstrated failing against current source** before the
fix. Paste that output verbatim.

1. **The alias-wipe cell.** Session has 3 stored rows. PATCH arrives with 3 entries
   keyed `trade_id` only (canonical per `journal_trade_client_id`, unparseable by
   the sweep) → **nothing is deleted**, all 3 stored rows survive. Fails today: all
   3 are deleted.
2. **The mixed cell.** 3 stored rows; payload has 2 parseable entries and 1
   unparseable → **nothing is deleted.** Fails today: the third row is swept.
3. **Legitimate clear.** `journal == []` → all rows deleted, sweep proceeds. Must
   still pass — this is the cell an over-eager guard breaks.
4. **Normal orphan removal.** 3 stored rows, payload has 2 of them, all parseable →
   exactly the 1 absent row is deleted. The feature still works.
5. **Deletion is logged.** Cell 4's deletion emits a record containing the session
   id, before and after counts, the resolver name, and the deleted id. Assert on
   the captured output (`capsys`). Fails today: nothing is emitted.
6. **Refusal is logged.** Cell 1 emits a distinct record naming the unresolved
   count.
7. **Absence class:** `journal` not a list (early return, unchanged); `journal`
   containing non-dict entries; an entry whose id is whitespace only; an entry whose
   id is `0` or `False`. No exception, and no deletion where an id failed to parse.
8. **Logging cannot break the write.** Force the log emission to raise and assert
   the sweep's transactional outcome is unchanged.

## 5. Mutation set — declare `N designed / M survived`

Each must **die**:

1. `unresolved_incoming` never incremented for the non-dict branch.
2. `unresolved_incoming` never incremented for the empty-`tid` branch.
3. Refusal branch inverted (`if not unresolved_incoming:`).
4. Refusal branch removed entirely (current behaviour).
5. Refusal weakened to `if unresolved_incoming > 1:`.
6. Refusal moved *after* the delete loop, so it logs but still deletes.
7. Legitimate-clear path also refused (guard applied when `journal == []`) — must
   die on cell 3. **The over-blocking mutant: a sweep that never deletes is not a
   passing guard.**
8. Log line drops the session id.
9. Log line drops the before/after counts.
10. Log line drops the resolver name.
11. Log emitted only when zero rows are deleted.

Report survivors; do not delete or weaken a mutant to make it die.

## 6. VER-04 — both halves required

State explicitly that **a no-op stub dies** against your acceptance, **and** that a
**faithful independent reimplementation** — written from §2 and §3's prose, not
copied from your diff — **passes** it. Name what you wrote. An acceptance that only
kills the stub is vacuous and the packet is rejected.

## 7. Report back

The diff; verbatim RED for cells 1, 2 and 5 against unmodified source; cell-by-cell
results; `N designed / M survived` naming each mutant; the VER-04 statement; which
db fixture you used; and anything you touched outside `:12337-12455` (which should
be nothing but the new test file). Do not claim a tree — the manager verifies
artifacts in its own worktree.
