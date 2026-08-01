# FINDING — Hot autosave bypasses the B-W16 hydration guard and still reaches the journal wipe

**2026-07-28 · Manager B · SAFE-01 / never-idle #3 · Escalation under charter conditions 3 and 4**

---

## Claim

**The D-2 client guard does not stop the trade-loss path.** It stops one of two writers. The other writer — hot autosave — still delivers an empty (or unhydrated) `journal` array to `PATCH /api/sessions/{id}/state`, which still calls `_sync_trading_session_journal_trades`, which still deletes every row not in `incoming_ids`. An empty array produces an empty `incoming_ids`, the B-W17 parse guard does not fire (`unresolved_incoming == 0`), and the sweep deletes the session.

## Evidence (read from the tree, not inferred)

1. **`persistJournal` queues hot before the guard runs.**
   `order-manager.js` `:7184–7196` calls `scheduleSessionStateSave({ journal: hotJournal, … })`.
   The B-W16 admit-list guard sits at `:7211`, inside the durable branch only.
   When the guard suppresses, it returns `{ hotQueued, durableQueued: false }` — hot has already been queued.

2. **Acceptance encodes the hole.**
   `b-w16-hydration-guard.test.mjs` cell 6 asserts `hot-runs-while-suppressed` and
   `hot-carries-journal-while-suppressed`. Mutant 2 of the B-W16 harness kills a change
   that moves the guard onto the hot path *instead of* the durable path. The ratified
   brief said "durable path ONLY."

3. **Hot and durable share the delete sink.**
   Both eventually `PATCH /api/sessions/{id}/state`. That handler, at `api_server.py`
   `:25273–25284`, calls `_sync_trading_session_journal_trades` whenever
   `payload.journal is not None` — including slim/hot-marked patches
   (`prefer_richer_heavy=slim_marked`).

4. **`prefer_richer_heavy` does not skip the sweep.**
   It only changes how an *existing* row's payload is merged (`:12382–12390`).
   The orphan sweep at `:12496–12505` runs either way.

5. **Empty journal defeats B-W17.**
   For `journal=[]`: the upsert loop never runs → `unresolved_incoming=0`,
   `incoming_ids=∅` → parse guard does not refuse → `if incoming_ids:` is false →
   the query is every row for the session → all deleted. This is the original wipe,
   reached through the hot door.

6. **chart.js's own pre-hydrate gate allows journal patches.**
   `_sessionStatePatchAllowedBeforeHydrate` (`chart.js` `:12364–12366`) returns
   `true` for journal-related patches. So `scheduleSessionStateSave` does not
   refuse an unhydrated journal write at the chart layer either.

## Severity

**Real hazard. Same user-visible loss as the incident.** The backend half of D-2
(B-W17) still protects the *unparseable-id* trigger; it does not protect the
*empty-array* trigger. The client half (B-W16) protects the durable writer only.

## What the PO / Director has been told

That B-1 + B-2 + B-W17 "are the whole of PO decision D-2. The fix is done."
(`DIRECTOR-DISPATCH-BC-20260728-1425.md`). That statement is true of the durable
path and false of the loss path as a whole.

## Territory

- Extending the client guard onto the hot path: **my territory** (`order-manager.js`),
  but it **contradicts the ratified B-W16 brief** (durable only; cell 6; mutant 2).
- Refusing the empty-incoming sweep in `_sync_trading_session_journal_trades`:
  **inside the I-7.1 grant** (same function), but **replace semantics were ruled out
  of scope** for the train — and empty-array wipe *is* replace semantics operating
  as designed.
- Closing `chart.js`'s pre-hydrate allow-list for journal: **Manager A's / shared
  chart.js territory**, not mine.

## Escalation (charter § standing authority)

I am **not** widening the guard against the brief, and I am **not** changing replace
semantics under the expired-looking I-7.1 shape without a fresh ruling.

**I need one of:**

1. **A ships distinct hydrate reasons** for "unreachable / !ok" vs "server said
   nothing (brand-new)", and B gates hot journal writes only on the unreachable arm
   (same admit-list / kill-switch). Brief §8a already named this as A's follow-up; or
2. **An explicit residual-risk acceptance** that failed-GET can still wipe via hot
   through canary — written down, not inferred.

**Withdrawn as Director options:**

- Refusing the sweep on empty `incoming_ids` — B-W17 cell 3 requires empty journal
  to remain a legitimate clear.
- Blanket-blocking every hot journal write — B-W16 brief §8a **accepts** that
  brand-new sessions stay `'unhydrated'` and rely on hot autosave for the first
  journal. Closing all hot writes would break that ratified trade. The wipe and the
  brand-new path are the same door until `chart.js` distinguishes the arms.

Until one of those three, **the train must not be described as closing the trade-loss
incident.** Assembly can continue for other items; the release note cannot say the
loss path is closed.

## SAFE-01 reading

The hydration guard is a correct predicate in the wrong place relative to the
*loss*, even though it is in the right place relative to the *durable writer*.
SAFE-01 says ordering is part of the guarantee. Guarding one of two doors that
lead to the same room is not a guard on the room.
