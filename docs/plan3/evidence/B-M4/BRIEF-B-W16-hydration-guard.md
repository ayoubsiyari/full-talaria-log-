# BRIEF — B-W16 — client hydration guard on the durable journal write

**Packet:** B-W16. **Dispatched:** 2026-07-28 13:15 by Manager B.
**Authority:** `chart v 1.4/chart/modules/order-manager.js` — Manager B, TERRITORY.yml:174. No grant needed.
**Worktree:** `C:\Users\user\Desktop\talaria1\manager-b-plan3`. TREE-02 applies.
**Spec:** `SPEC-persistjournal-hydration-guard.md` (this brief supersedes it where they differ).
**Incident:** `INCIDENT-TRADE-LOSS-PUBLIC-20260728.md`. Standalone hotfix train, PO D-2.

---

## 0. What is already decided — do not redesign

The design below is the manager's, fixed by two prior rejections and a Director
constraint. You implement it. If you believe it is wrong, **stop and report**;
do not substitute a different shape.

- The flag is **tri-state**, default **`'unhydrated'`**.
- The guard sits on the **durable path only**.
- **`length > 0`, `.length`, or any emptiness test in the guard condition is an
  instant reject.** It passes the defect cell by accident and breaks a legitimate
  journal clear.
- **Smaller than the last attempt.** One flag, one branch. No resolver tiers, no
  fallback ladders, no new helper classes.

## 1. The seam — already exists, do not invent one

`_m19CommitJournalArray(next, reason)` at `order-manager.js:39750` is the single
funnel through which the journal array is replaced, and `chart.js` already tags
the two hydration outcomes with distinct reasons:

- `chart.js:11982` → `'session-state-hydrate'` — the **server fetch succeeded**.
- `chart.js:11732` → `'local-backup-hydrate'` — reached from the **failed-fetch**
  branch (`!res.ok` → `_applyTradingSessionFromLocalBackupOnly()` → return).

So provenance is derivable **entirely inside `order-manager.js`**. No `chart.js`
edit is permitted or required — that file is Manager A's.

**Verify before relying on it (Task 0a):** confirm `chart.js:11979-11983` is
reachable *only* when the state fetch succeeded, and that no other call site
passes `'session-state-hydrate'`. Report the citations. If reachable on a failure
path, **stop and report** — the whole design rests on this.

## 2. Task 0 — two facts to establish first, before writing code

**0a.** The reachability check above.

**0b. Is the `OrderManager` instance per-session, or reused across a session
switch?** This changes the design and you must answer it with citations:

- **If a fresh `OrderManager` is constructed per session** → provenance resets to
  `'unhydrated'` naturally. Implement §3 as written and prove the reset.
- **If the instance is reused across sessions** → there is a bypass: hydrate
  session A successfully (`'hydrated'`), switch to session B whose fetch fails or
  is skipped, and the stale `'hydrated'` opens the guard and wipes B. In that case
  **bind the provenance to the session it was established for**: record the
  session id alongside the flag when setting `'hydrated'`, and require it to match
  the `sessionId` in scope at the persist site. That is one extra field and one
  extra term in the same branch — it is not a new mechanism. Add acceptance cell 8.

Report which case holds and which shape you implemented.

## 3. The change — exactly two edits

**3.1 The field.** Initialise `this._journalProvenance = 'unhydrated'` where the
other instance fields are initialised. The default must be literal and directly
assertable on a fresh instance.

**3.2 Set it in the funnel.** In `_m19CommitJournalArray(next, reason)`, set
provenance from an **explicit allowlist**:

- `reason === 'session-state-hydrate'` → `'hydrated'`.
- **Every other reason leaves provenance unchanged.** Not upgraded, not
  downgraded. `'local-backup-hydrate'` must *not* upgrade (it is the defect path);
  ordinary in-session reasons (`'normalize-journal'`, `'split-leg-dedupe'`,
  `'selective-rewind'`, `'panel-init'`, `'init'`, `'normalize-empty'`) must not
  clear a legitimate `'hydrated'`.

An unrecognised or absent reason must **not** produce `'hydrated'`. Fail closed.

**`'locally-authored'`:** the third state exists and the guard admits it. Do
**not** wire a setter for it unless you find an *unambiguous* local-session-creation
signal inside `order-manager.js` — "no fetch happened" is not such a signal, it is
exactly the "we do not know" state and setting it there reopens the defect. If you
find no such signal, leave it unset and **say so in the report**; a genuinely empty
session that hydrated successfully is already covered by `'hydrated'`.

**3.3 The guard.** Insert immediately after
`if (this.chart && typeof this.chart.queueCriticalSessionStateSave === 'function') {`
(`order-manager.js:7171`) and **before** `const rowsHaveRefs = ...` (`:7172`):

```js
if (this._journalProvenance === 'unhydrated') {
    console.warn("📔 durable journal write suppressed: this session's journal was never hydrated from the server; the in-memory journal may be incomplete and writing it would delete server-side trades. Keeping last durable state.");
    return Promise.resolve({ hotQueued, durableQueued: false, reason: 'journal-unhydrated' });
}
```

**Why this exact insertion point — it is load-bearing:**

- The durable block has **two** exits to `queueCriticalSessionStateSave`: the A1
  rehydrate exit (`queueDurable`, `:7238`) and the legacy unmarked exit (`:7255`).
  Guarding at the top covers **both** with one branch. A guard placed at `:7255`
  only is incomplete and will be rejected.
- The hot-autosave block (`:7157-7170`) runs **before** it, so hot autosave is
  structurally unaffected. Do not touch it.
- The return shape matches the existing idiom at `:7181` and `:7235`
  (`{ hotQueued, durableQueued: false, reason }`). Keep it identical.

## 4. Acceptance — RED before GREEN, GUARD-01 named cells

Every cell named. Cell 1 **must be demonstrated failing against current source**
before the fix is applied; paste that failure into the report.

1. **The defect cell.** Provenance `'unhydrated'` (failed hydrate), one trade
   closed, durable write attempted → **suppressed**, `reason: 'journal-unhydrated'`,
   pre-existing server rows untouched.
2. `'unhydrated'` is the **default** on a fresh instance before any load — assert
   directly.
3. `'session-state-hydrate'` commit, then a close → durable write **proceeds**.
4. **Legitimate clear.** Successful hydrate returning an empty journal, then a
   durable write → **proceeds**. (This is the cell `length > 0` fails.)
5. Failed hydrate, then a later successful hydrate → durable writes **resume**.
6. **Hot autosave unaffected** in every case, including while suppressed —
   assert `scheduleSessionStateSave` was still called.
7. **Absence class:** `tradeJournal` null/undefined; `_journalProvenance` unset;
   `this.chart` absent. No throw.
8. **(conditional on 0b)** Session-switch bypass: hydrate A, persist B → suppressed.
9. **Both exits covered:** `rowsHaveRefs` true and provenance `'unhydrated'` →
   suppressed. Proves the guard is not sitting below the A1 branch.

## 5. Mutation set — declare `N designed / M survived`

Required mutants, each must **die**:

1. Default flipped to `'hydrated'`.
2. Guard moved to the hot path instead of the durable path.
3. Guard condition replaced with `durableJournal.length > 0`.
4. Allowlist widened so `'local-backup-hydrate'` also sets `'hydrated'`.
5. Guard relocated below the A1 `rowsHaveRefs` block (guarding `:7255` only).
6. **Over-blocking mutant:** provenance never set to `'hydrated'` at all, so the
   guard suppresses forever. Must die on cell 3 — a guard that blocks everything
   is not a passing guard.
7. Return shape changed to `durableQueued: true`.
8. Allowlist comparison loosened to a substring/prefix match on `reason`.

Any survivor is a defect in the acceptance, not an acceptable result. Report
survivors rather than deleting the mutant.

## 6. VER-04 — both halves required

State both explicitly:

- a **no-op stub dies** against the acceptance; **and**
- a **faithful independent reimplementation passes** it — written from §3's
  description without copying the diff. Name what you wrote.

An acceptance that only kills the stub is vacuous and the packet is rejected.

## 7. Out of scope — touching any of these is an automatic reject

- `chart.js` (Manager A's), including the `:11701-11708` mark-hydrated-on-failure
  decision. The guard deliberately sits downstream of it.
- Backend replace semantics, `api_server.py`, `journal-backend/`.
- The hot autosave path. The M20-A1 screenshot logic. The orphan sweep.
- Any refactor of `persistJournal` beyond the one inserted branch.

## 8a. ADDENDUM (manager, 13:32) — the brand-new-session consequence

I verified 0a myself. It holds, and it exposes a consequence the brief above did
not state. `chart.js` has **two** early returns into the local-backup path, not one:

- `:11901-11904` — `!res.ok`, the server could not be reached. **We do not know.**
- `:11907-11910` — `res.ok` but `payload.state` is null. **The server answered and
  said it has nothing.** This is a brand-new session.

Both funnel into `_applyTradingSessionFromLocalBackupOnly()` and therefore both
arrive at the funnel as `'local-backup-hydrate'`. **`order-manager.js` cannot tell
them apart**, so under §3 a brand-new session stays `'unhydrated'` and its durable
writes are suppressed.

**This is accepted, not a bug, and you must not "fix" it by widening the allowlist.**
The reason it is tolerable: the hot autosave block at `:7157-7170` runs *before* the
guard and its patch includes `journal: hotJournal` (`:7159`), so a new session's
journal still reaches the server. On the next load the server has state, hydration
succeeds, and durable writes resume. The exposure is narrowed to the newest trades
of a first-visit session closed before hot autosave fires — which is spec §5's
stated trade, and strictly better than deleting every older row.

**Add acceptance cell 10:** brand-new session (`res.ok`, no state) → durable write
**suppressed**, no throw, and **hot autosave still queued** with the journal
present. Assert the hot patch, not just the absence of the durable write.

Distinguishing the two arms properly requires `chart.js` to pass a distinct reason
for the server-said-nothing case, which is Manager A's territory and out of scope
here. Note it in your report; the manager will raise it as A's follow-up.

## 8. Report back

Diff, the RED evidence for cell 1, the 0a/0b findings with citations, cell-by-cell
results, `N designed / M survived`, the VER-04 statement, and anything you touched
that is not named in §3. Do not claim a tree; the manager verifies artifacts in its
own worktree.
