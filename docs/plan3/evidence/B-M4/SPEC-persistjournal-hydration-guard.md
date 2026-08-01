# SPEC — `persistJournal` must not durably replace a journal it cannot vouch for

**Row:** trade-loss on the state-PATCH path (see `ESCALATION-trade-loss-orphan-sweep.md`).
**Territory:** `order-manager.js` — **Manager B's.** This is the narrowest fix that breaks the chain, and it does not depend on the backend or `chart.js` changes landing.
**Status:** specified, not yet implemented. `order-manager.js` is currently held by another packet; implementation is queued behind it.

---

## 1. The chain this breaks

A failed `GET /state` leaves `tradeJournal` empty, the client marks the session hydrated anyway, and the next trade close durably PATCHes a one-element journal. The server's replace semantics then delete every other row. Full chain and citations in the escalation.

**The client is the last place that can know the array is incomplete.** The server cannot: a one-trade journal from a user who has one trade and a one-trade journal from a user whose hydration failed are byte-identical.

## 2. The precedent — this guard already exists in this file

This is not a new idea. `persistJournal` already refuses a durable write it cannot vouch for, for a different reason:

```7196:7201:chart v 1.4/chart/modules/order-manager.js
            const rowsHaveRefs = this._m20A1RowsHaveScreenshotRefs(durableJournal);
            // M20-A1 runtime-kill transition: kill flipped AFTER rows were
            // externalized. Durable must NEVER replace the server journal
            // with ref-only/null-blob rows (fail closed, keep last durable
            // state); the explicit one-time transition below re-embeds the
            // live rows from IndexedDB, then re-runs the exact legacy path.
```

*"Durable must NEVER replace the server journal with \[untrustworthy\] rows — fail closed, keep last durable state."* That is precisely the rule needed here, applied to a different cause. The comment at `:7168` confirms the semantics are understood: *"Critical path: unmarked full durable clone (B-era replace/clear semantics on server)."*

**So the fix is idiomatic: extend an existing, accepted invariant to a second way the array can be untrustworthy.** That materially lowers its risk — it is not new machinery on the durable path.

## 3. The rule

> A durable journal write may only proceed if the in-memory journal is **known complete**: either it was successfully hydrated from the server this page-load, or this client created every trade in it.

Never infer completeness from the array being non-empty. One trade after a failed hydration looks exactly like a genuine single trade.

## 4. Implementation

**4.1 Track provenance, not emptiness.** Add an explicit tri-state on the OrderManager, e.g. `_journalProvenance`:

- `'hydrated'` — a `GET /state` journal load completed successfully this page-load. Set only on success.
- `'unhydrated'` — initial value, and the value after a failed or skipped load.
- `'locally-authored'` — no server journal existed and every row was created by this client this session.

**Default must be `'unhydrated'`.** The whole defect is a system that treats "we do not know" as "there is nothing", so the default must fail closed.

**4.2 Guard the durable path only.** In `persistJournal`, alongside the existing `rowsHaveRefs` check:

- `'hydrated'` or `'locally-authored'` → proceed unchanged.
- `'unhydrated'` → **skip the durable write**, keep the last durable state, and log loudly and distinctly.

**Do not guard the hot autosave path.** It is not the destructive one, and suppressing it would lose in-session state for no safety gain. Only `queueCriticalSessionStateSave` carries replace semantics.

**4.3 Loud, specific logging.** The most damaging property today is silence. The log must name the cause and the consequence, e.g. *"durable journal write suppressed: session journal was never hydrated from the server; the in-memory journal may be incomplete and writing it would delete server-side trades."* Not a generic warning.

**4.4 Recovery.** If a later hydration succeeds, set `'hydrated'` and allow durable writes again. A user who reloads on a working connection recovers with no intervention.

## 5. What this does and does not fix

**Fixes:** the reachable, confirmed path — trades destroyed after a transient `GET /state` failure. Full loss becomes suppressed-write-plus-log.

**Does not fix:**
- The **backend replace semantics**. Any other client, or a future one, can still wipe a session. The durable fix is the server's.
- The **`chart.js` decision** to mark a failed hydration as hydrated (`:11698-11709`) and the journal-patch whitelist (`:12363-12366`). Those conflate "no trades" with "could not find out", and that is Manager A's.
- The **latent alias trap** in `_sync` — currently unreachable, still worth closing.
- **In-session durability while unhydrated.** After suppression, new trades persist only via hot autosave. That is a deliberate trade: possibly losing the newest trade on a crash is strictly better than certainly deleting every older one.

## 6. Acceptance

RED before GREEN, and per GUARD-01 the guard must be proven to reject the exact triggering state as a named cell:

1. **The defect cell.** Hydration fails, one trade is closed, durable write attempted → **suppressed**, pre-existing server rows intact. Must fail against current source.
2. `'unhydrated'` is the **default** before any load — assert directly; a wrong default silently disables the guard.
3. Successful hydration then a trade close → durable write **proceeds** (guard must not block the normal path).
4. Genuinely empty session, locally authored → durable write **proceeds** (a real journal clear must still work).
5. Hydration fails, then a later hydration succeeds → durable writes **resume**.
6. Hot autosave is **unaffected** in every case.
7. Absence class: `tradeJournal` null/undefined; provenance unset; `chart` absent.

Mutation set must include: default flipped to `'hydrated'`; guard applied to the hot path instead of the durable one; guard checking `length > 0` instead of provenance (the tempting wrong fix — it passes the defect cell only by accident and fails cell 4).

Declare `N designed / M survived` before any verdict.
