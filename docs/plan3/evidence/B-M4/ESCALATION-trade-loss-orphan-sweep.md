# ESCALATION — silent, permanent journal loss on the state-PATCH path

**From:** Manager B. Raised 2026-07-28 10:2x, **substantially rewritten 11:35** after reachability triage (B-A7).
**Verdict: REACHABLE in normal product use, by an authenticated ordinary paid user, with no malicious input.**
**Territory:** `api_server.py` and `chart.js` — **neither is mine.** No change made to either.

> **This document replaces an earlier version. Two things I previously reported were wrong, and both are corrected below in §5. The mechanism I originally escalated is real but NOT the reachable one.**

---

## 1. The reachable defect, in one paragraph

The client's in-memory `tradeJournal` is populated **only** by `GET /state`. If that GET fails once, there is **no retry**, and the client **deliberately marks the session hydrated with an empty journal** so that later saves are not dropped. The next trade close then PATCHes a `journal` array containing only that one trade. The server treats a `journal` PATCH as an authoritative **replace**, so every other row in the session is deleted — silently, permanently, in one committed transaction.

**A user with 50 trades can lose 49 of them because one HTTP request returned 503.**

## 2. The chain, with citations

| # | Step | Location |
|---|---|---|
| 1 | `tradeJournal` starts empty; loaded only from the API, never localStorage | `order-manager.js:8182-8183` |
| 2 | `GET /state` failure has three entries into local-backup-only mode: non-2xx, missing `state`, or any throw | `chart.js:11901-11903`, `:11907-11909`, `:12267-12269` |
| 3 | **No retry.** `loadTradingSessionStateIfNeeded` early-returns forever after | `chart.js:11876` |
| 4 | With no local backup, the client **deliberately** marks the session hydrated while the journal is empty — the comment says so: *"Mark the session as hydrated (empty) anyway so later order saves are NOT dropped by the pre-hydrate guard."* | `chart.js:11698-11709` |
| 5 | The pre-hydrate guard would not have helped: it **explicitly whitelists journal patches**, and `patch.journal != null` is true for `[]` | `chart.js:12363-12366`, `:12353` |
| 6 | The durable path has **no hydrate guard at all** | `chart.js:12635-12651` |
| 7 | Next trade close PATCHes the whole in-memory array — now one trade | `order-manager.js:7133`, bodies `:7159`, `:7239`, `:7256` |
| 8 | Server accepts, builds a one-element keep-set, sweeps the rest | `api_server.py:25207`, `:12451-12455` |

Confirmed by execution against a model mirroring `TradingSessionJournalTrade`: with rows `a`, `b`, `vuln-9` and a keep-set of `{a}`, the query selects `b` and `vuln-9` for deletion.

## 3. The user sequence — nothing unusual in it

1. A session holds 50 trades.
2. The user opens the chart where **no local backup exists** — a second machine, a cleared or incognito profile, or after a `QuotaExceededError` forced a `minimal` backup that omits the journal (`chart.js:11388-11397`, `:11490-11492`).
3. `GET /state` returns 502/503/504 or 429 **once**. Not speculative: the client carries dedicated backoff handling for exactly these statuses on this endpoint (`chart.js:12684-12699`).
4. Session is silently marked hydrated with an empty journal. The Journal tab shows nothing. No retry will occur for the life of the page.
5. The user places and closes one trade.
6. All 50 prior rows are deleted in one committed transaction.

## 4. Blast radius and detectability

- **One session per incident, one account.** The sweep filters on `session_id` only, and access is strictly owner-only (`_can_access_trading_session`, `api_server.py:11883`). **No cross-tenant exposure.** But the trigger is per-page-load, so a user opening several sessions in one bad window can lose each in turn.
- **Four of the twelve call sites can delete**: CSV import (`:24780`), demo seeding (`:24910`), dashboard upsert (`:25107`), state PATCH (`:25212`). All gate on `_require_paid_journal_user` — **none requires admin.** The other seven reach `_sync` only via backfill, which runs only when SQL is empty, so the sweep always operates on an empty table.
- **No feature flag, no row-count floor, no soft delete, no shadow table.** Deletes commit with the state write in one transaction — no partial corruption, but no partial survival either.
- **Nothing is logged.** No logger or audit call anywhere in `12337-12455`. The loss is entirely silent server-side; the user just sees a short journal.

## 5. CORRECTIONS to my earlier reports — read these

**Correction 1: the `if incoming_ids:` guard is NOT a bug, and I should not have reported it as one.** I claimed that an empty keep-set skips the exclusion filter and therefore wipes the session as a distinct second defect. Behaviourally the wipe is real, but the guard is not the cause: SQLAlchemy renders an empty `IN` as a false expression, so `~client_trade_id.in_(set())` matches every row anyway. Verified by execution — with and without the guard, the same three rows are selected. Delete-all-on-empty is simply the **"replace" semantics the docstring describes** (`:12340-12343`), and it is what makes a legitimate journal clear work. Withdrawn as a separate finding.

**Correction 2: the alias-vocabulary divergence is a latent trap, NOT the active fire.** My original escalation centred on `_sync` building its keep-set from `tradeId or id` (two aliases) while `journal_trade_client_id` resolves four. That divergence is real and execution-confirmed — `{trade_id}` and `{client_trade_id}` resolve under the canonical helper but yield `''` in the sweep. **But no current writer produces such a row.** Every producer was checked: the dashboard/manual normalizer sets all four aliases (`session_journal_store.py:257-260`); the CSV importer always emits `tradeId` with a `csv-N` fallback (`csv_journal.py:763`, `:797`); the read-then-write cycle I flagged as the classic source is safe, because rows store the originating ids inside `payload_json` and the read-back only adds keys without renaming; the backfill script skips empty journals.

So the vulnerable-row deletion I reproduced this morning required a **planted** row. It remains worth fixing as a trap for the next writer, but **it is not what is losing data today**, and I would rather correct that now than have the canary decision rest on it.

## 6. Recommendation, split by owner

**The root cause is that nothing anywhere asserts a `journal` array is complete.** The severity comes from that absence, not from any single line.

**Backend owner — the durable fix.** A `journal` PATCH should not be an unconditional authoritative replace. Either require an explicit intent flag for destructive replacement, or refuse a sync whose incoming set is drastically smaller than the stored set without that flag. **At minimum, log the deletion with the before/after counts** — today the single most damaging property is that this is invisible.

**Manager A (`chart.js`).** Step 4 is the decision that arms the whole chain: marking a session hydrated with an empty journal after a *failed* load conflates "this session has no trades" with "we could not find out". Those need to be distinguishable, and the journal-patch whitelist at `:12363-12366` should not apply when hydration failed.

**Manager B (me), in territory.** `persistJournal()` in `order-manager.js` should refuse to send a journal array it cannot vouch for. I am authoring that guard: it is the narrowest fix that breaks the chain, and it does not depend on either of the above landing.

**Also fix the latent trap** (§5, correction 2): have `_sync` use `journal_trade_client_id`, the helper already declared canonical for this table, so the keep-set and the write path share one vocabulary. And a sweep should never delete on an id it failed to parse — an unidentifiable row should be retained and reported.
