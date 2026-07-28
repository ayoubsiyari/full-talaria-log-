# INCIDENT — trade-loss path confirmed present on the publicly served build

**Opened:** 2026-07-28 12:56 by Director, on Manager B's B-0108.
**Status:** OPEN. **Canary hard stop.** Outranks Priority Zero (CPU) and every ship gate.
**Evidence:** `journal/MANAGER-B.md` B-0108, verified by B in its own worktree per TREE-02, no harness, source-read end to end.

---

## 1. The finding, in one paragraph

**A user's entire trade journal can be silently deleted when the backend state fetch fails or is merely slow.** The client, on a failed `GET /api/sessions/{id}/state`, marks the session as *hydrated with an empty journal*. That marking opens the persist guards, an empty array is then written to the durable path, and the backend's replace semantics delete every row not present in the incoming array. **The deletion is not logged.** The path has been present on the build served at `talaria-log.com` since **2026-07-03 — 25 days — and ~100 testers have been on it.**

## 2. Chain, as verified in shipping source

| # | Location | Behaviour |
|---|---|---|
| 1 | `chart.js:11900-11903` | `!res.ok` → `_applyTradingSessionFromLocalBackupOnly()` → return |
| 2 | `chart.js:11701-11708` | `!backup \|\| !om` → sets `_sessionStateLoadedFor = sessionId`, **marking the session hydrated-and-empty** |
| 3 | `chart.js:12586, 12796, 12817` | pre-hydrate persist guards now pass, because the flag they test is set |
| 4 | `order-manager.js:7256` | `journal: durableJournal` → `[]`. No emptiness guard |
| 5 | `order-manager.js:7172-7188` | M20-A1 rescue cannot fire: its condition is `rowsHaveRefs` and **an empty array has no refs** |
| 6 | backend | replace semantics delete every row absent from the incoming array (B-0100) |

**Step 2 is deliberate and commented.** The comment explains it marks the session hydrated-empty so later saves are not dropped by the pre-hydrate guard. It was written to fix a real bug — a guard that otherwise stays shut forever and nothing persists across refresh. **The fix it chose conflates "brand-new session" with "the backend is unreachable" and resolves both as "there is nothing here."** That is the whole defect: a system treating *we do not know* as *there is nothing*, on a durable path.

## 3. Three things that make this worse than first briefed

1. **The trigger is not exotic.** The condition is `!backup || !om`. The `!om` arm is a **timing** condition — `_waitForOrderManagerForSession(80, 50)` waits ~4s and on timeout merely logs a warning and continues. **A slow load reaches the deletion branch with local storage perfectly intact.** This is not confined to users who cleared their browser data. Firing frequency is unmeasured.

2. **We cannot tell whether it has fired, and may never be able to.** B answered Q3 as **CANNOT DETERMINE**, correctly and without guessing: no production database, log or host access, and — decisively — **the deletion is not logged**, so even with database access the event leaves no trace beyond a lower row count with no record of what was removed. **Absence of evidence is close to uninformative here.** Determining it requires per-session row-count history or a user report.

3. **We cannot name what is live.** There is no deployment manifest, build-id record or release tag pinning the served artifact. B bounded it instead: introduced in `410ccf877` (3 July), durable-write half last touched `c9700ebc8` (23 July), so **any build cut since 3 July carries it.** *The inability to say what is in production is itself a governance defect and is logged separately below.*

## 4. Director rulings

**I-1. B-2 (the tri-state hydration guard) is now the highest-priority engineering item in Plan 3, above CPU.** Priority Zero is demoted to second. A performance ceiling is a disclosure; silently eating a user's trade history is not shippable at any speed.

**I-2. Logging the deletion is required and ships independently of the guard.** Even a correct guard leaves us unable to answer "did this already happen." A durable delete that records nothing is unacceptable on a money path regardless of this incident. **Cheap, isolated, and it converts a permanently unanswerable question into an answerable one.** Backend owns it.

**I-3. `length > 0` remains an instant-reject fix.** It passes the defect cell by accident and breaks a legitimate journal clear. The tri-state flag defaulting to `'unhydrated'` is the accepted shape.

**I-4. No deploy of anything else until the guard is in the same train.** We are not shipping a CPU improvement to a surface that can delete journals.

**I-5. New row — DEPLOY-01: no build ships without a recorded build id and commit.** B could not answer "what is live" from the repository. That must never be true again, and it blocks canary sequencing independently of this incident.

**I-6. Retracted on the record:** the "session that has already lost 49 trades" line in B-0103 was **hypothetical**, a critique of the M4 gate's blindness. It is **not** a report of observed loss and must not be cited as a confirmed incident. I circulated that concern; B confirmed it; it is closed.

## 5. PO decisions — TAKEN 2026-07-28 12:58

**D-1. Testers are told NOW, before anything ships.** An export taken today is worthless for data already gone, so every hour of delay is unrecoverable for anyone the path has already hit. Notice text at §7.

**D-2. Standalone hotfix train.** The guard plus delete-logging ship on their own, as soon as they pass — **not** inside the canary train. Smaller to review, faster to users, and it does not wait on unrelated ship gates. Everything else stays behind it per I-4.

### 5.1 Consequent grant — backend is UNOWNED and that is why this rotted

`TERRITORY.yml:295` records `journal-backend`, `deploy`, `homepage` outside chart, and shared paths as **RED for every manager by fail-closed default.** So when B escalated the `api_server.py` orphan-sweep deletion, **there was nobody who could act on it.** The escalation was correct and it went into a void. That is a structural failure of my territory design, not of B's judgement.

**Ruling I-7: Manager B is granted scoped ownership of `journal-backend/` for the duration of this incident only.** Two changes permitted, nothing else:

1. **Log every durable journal deletion** — session id, row count before and after, and the resolver that produced the id. Per I-2 this ships even though it fixes nothing, because it converts a permanently unanswerable question into an answerable one.
2. **A sweep must never delete on an id it failed to parse.** B's own rule from B-0088: an unidentifiable row is retained and reported, never removed. Otherwise every future alias becomes a data-loss bug.

**Replace semantics themselves are out of scope for this train.** They are the deeper defect and they are not a 48-hour change. The client guard makes them survivable; changing them under deadline is how we produce a third rejected packet.

**The grant expires when the hotfix train ships.** It does not become standing ownership, and B does not touch backend paths outside these two changes.

### 5.2 Ownership of the `chart.js` half

Step 2 — the decision to mark a failed hydration as hydrated — sits in `chart.js` and is therefore **A's** territory, and A is on Priority Zero. **A is not being pulled off CPU for it.** B's guard sits on the durable path, which is the correct layer to stop a bad write regardless of who mislabelled upstream. **The guard alone stops the data loss; A's fix is the correctness repair and it can follow the hotfix train.** Logged as a follow-up against A, not a blocker.

## 6. Credit where due

B answered a question I had asked three times, in minutes, without building the harness it would normally reach for, and **self-corrected mid-answer**: it began auditing `homepage/public/chart/**`, the committed mirror, then discovered `homepage/Dockerfile` overwrites that mirror from `chart v 1.4/chart` at build time. **Had it answered off the mirror it would have answered about a file the build discards** — and it would have been a plausible-looking wrong answer, which is the most expensive kind. It also declined to guess on Q3 where guessing would have been easy and reassuring.

---

## 7. Tester notice — text as approved for sending (D-1)

Send to all testers on the public build. Plain, no jargon, no minimising.

> **Please export your trade journal today**
>
> We have found a bug in Talaria that can wipe a backtesting session's trade
> history. It happens when the app cannot reach our server, or sometimes just when
> the server responds slowly: the app mistakenly concludes the session has no
> trades, and then saves that empty state over your real one.
>
> **What we need you to do now:** open each backtesting session that matters to you
> and use Export to save a copy of its journal. Do that before your next reload.
>
> **One thing to watch for:** if you open a session and the Journal tab looks empty
> or noticeably shorter than you remember, **stop and do not place, close, or modify
> any trade, and do not reload.** Acting in that state is what makes the loss
> permanent. Tell us instead and we will look at it with you.
>
> **Being straight with you about what we don't know:** the bug has been present
> since 3 July. It does not record anything when it happens, so we cannot tell from
> our side whether it has already affected you. That is why we are asking everyone
> to export rather than telling you who is affected — and we are fixing the missing
> record at the same time as the bug, so this can never again be a question we
> cannot answer.
>
> A fix is being prepared and shipped on its own, ahead of everything else we are
> working on. We are sorry — this one is ours, and it should not have taken 25 days
> to find.

### Notes for whoever sends it

- **Do not soften "wipe" or "empty".** Testers who have already lost trades need to recognise their own experience in this text.
- **The stop-and-do-not-reload instruction is the operationally important sentence.** B established that a reload after failed hydration is the action that makes loss durable. It matters more than the export request, because it is what prevents *new* loss over the next few hours.
- **Do not claim we will restore lost data.** We have no evidence trail to restore from.
