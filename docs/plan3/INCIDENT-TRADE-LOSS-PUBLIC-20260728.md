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

---

## 8. Ruling I-7.1 — grant corrected (13:42). My path was wrong, not B''s reading.

**B is blocked on a defect in my own grant and is right to be blocked.**

I-7 granted `journal-backend/`. **The served deletion path is not there.** B''s read-only audit — which needs no grant, and which it dispatched instead of waiting for me — established that the code is `chart v 1.4/chart/api_server.py`, function `_sync_trading_session_journal_trades` (`:12337-12455`). `TERRITORY.yml` has no row for that path, so TB-3 holds it RED.

**B declined to read the grant''s intent as "wherever the code turns out to be" and stopped. That is exactly right and I want it recorded as correct, not as caution.** A manager who widens its own grant by inference is how territory isolation dies. It also brought me a specific file and line range to grant against rather than an abstract request to widen — the right escalation shape.

**This is a BRIEF-03 violation by me, one hour after I promoted BRIEF-03.** I wrote a path set from where the code *appeared* to belong rather than from where it actually lives. `journal-backend/` exists, which is what made the guess plausible; it simply is not the backend serving this route. I own it.

### The grant, stated precisely

**Manager B is granted write access to `chart v 1.4/chart/api_server.py`, function `_sync_trading_session_journal_trades` only (`:12337-12455`), for exactly the two changes named in I-7:**

1. **Log every durable journal deletion** — session id, row count before and after, and the resolver that produced the id.
2. **Never delete on an id that failed to parse** — retain and report, never remove.

**Nothing else in that file. Nothing else in that function. Replace semantics remain out of scope.** The `journal-backend/` grant in I-7 is **withdrawn as misdirected**, not extended — if B''s audit found that directory does not implement these routes, it should not carry a grant at all. **Expires when the hotfix train ships.**

**Ratified in advance:** B''s point that the backend''s `len(journal) > 0 and not incoming_ids` discriminator is **not** the banned `length > 0` fix. The ban is on the *client* using emptiness as a proxy for provenance. This is a backend parse-failure signal — "we were handed rows and could resolve none of them" — a different predicate with a different meaning. **B flagged it pre-emptively so it would not be rejected on a pattern match, which is what a good escalation looks like.**

## 9. B-2 is done and green — and it corrected its own guard mid-flight

**The half that stops the data loss is complete and inside B''s own territory.** Two things about how it got there matter more than the fact of it.

**The packet shipped a deny-list (`provenance === ''unhydrated''` suppresses) and disclosed unprompted that it fails open when the field is `undefined`.** B''s reading: *"`undefined` is maximally 'we do not know', and this entire packet exists because the system treated 'we do not know' as 'there is nothing'. A guard that fails open on unknown provenance is the same defect one layer up."* Corrected to an **admit-list** — only `'hydrated'` bound to the current session, or `'locally-authored'`, may proceed; everything else including `undefined` and any unrecognised value suppresses. Same size, same single branch.

**And B made the correction load-bearing rather than trusting it:** new cell 7b (provenance `undefined`, and provenance set to an unrecognised string → suppressed, server rows intact) and new mutant 9 (revert to the deny-list → **died** on 7b). Both new cells fail against unmodified source.

**VER-04 earned its promotion within hours.** The packet''s own VER-04 reimplementation had independently chosen the admit-list form and passed the identical acceptance. **Two implementations disagreeing on a safety property while the acceptance is blind to the difference is precisely the gap VER-04 exists to surface — and it surfaced it.**

**Session-binding was added for a reason B established rather than assumed:** `OrderManager` is constructed once (`chart.js:13004` via `initReplaySystem` at `:12933`) and never reassigned, while `activeTradingSessionId` mutates freely (`chart.js:990, 2117, 2138` plus two multichart bridges). So the instance outlives a session switch and a stale `'hydrated'` from session A would have opened the guard for session B. `persistJournal` already assumed this, carrying a `'session-switched-mid-flight'` drop at `:7218-7228`. Cell 8 proves the binding and fails against unmodified source. **`'locally-authored'` ships declared and unset** — the packet searched for a local-session-creation signal, found none, and did not invent one.

## 10. New standing row — EVID-01: evidence that rewrites itself is not evidence

**B found that `m19-d-marker-delta.green.test.mjs` regenerates its own evidence file when run**, overwriting `headSha`, `elapsedMs`, and the recorded `order-manager.js` / `replay-system.js` / `chart.js` hashes in `docs/plan3/evidence/L2-M19-AE-20260723b04-D-GREEN.json`.

**This is not cosmetic.** The stored pin was `c9700ebc8` — *the exact commit this incident names as the durable-write half''s last touch* — and running the regression replaced it with the dirty tree''s SHA and the hash of a modified, then-unreviewed `order-manager.js`. **The artifact would then assert that M19-D-GREEN had been verified against a tree that was never verified.** B restored both files and declined to claim the finding before establishing the mechanism.

**`EVID-01`: a test may not write the evidence file that certifies it.** Evidence is written by the harness that pins the tree, once, and is immutable thereafter. Any file a later run can silently re-pin is not evidence.

**Filed alongside `DEPLOY-01`, and for the same reason B named:** *we cannot say what was verified, for the same reason we cannot say what is deployed.* Two instances of one class in one day. **The class is: we do not durably record the identity of the thing we tested or shipped.** That is now the most-repeated structural defect in this project and it will be a named row in the closing report.

---

## 11. PO clarification D-4 (14:30) — production has ACTIVE users. The incident STANDS and is not downgraded.

**PO states:** all work happens on the test server `31.97.192.82:3000`, which has no users. **Production `talaria-log.com` is not touched — and has real users or testers on it currently.**

**This does not reduce exposure. It relocates the mitigation.** "We do not deploy to production" and "nobody is on production" are different claims, and only the second would make this safe. **The defect does not need us to act; it needs a slow server response.**

**Consequence, stated plainly: B''s hotfix lands on TEST, where nobody is at risk. It does not reach the people who are.** PO decision on production is `test-then-decide`, so **until that decision is taken, the users actually exposed receive no code-level protection at all.**

**Therefore the tester notice is no longer one mitigation among several — it is the ONLY protection active users have.** It has now been outstanding across seven asks. The `STOP — do not place, close, or reload` line is the operative sentence, because it prevents *new* loss during the window before any production decision.

### 11.1 The lever this opens, and it may be worth more than the client fix

**The deletion physically happens in the backend, not the client.** The client sends an empty journal; the backend''s replace semantics then delete every row absent from the incoming array.

**A backend-side guard protects every client on every server, including production, with no client deploy at all.** That is the only reachable lever for currently-exposed users under `test-then-decide`.

**B-W17 does not cover this case.** It guards *unparsed* ids and logs deletions. **An empty array is not an unparsed id** — it parses cleanly to "no rows," and replace semantics do the rest. So the wipe path remains open on the backend.

**I placed replace semantics out of scope in I-7, and that ruling was made when I believed the client fix would reach the exposed users. It will not.** The facts changed, so the scope question is genuinely re-opened rather than merely relitigated.

**The hazard is real and is exactly the trap I banned:** a naive guard breaks a legitimate "clear my journal" action, and `length > 0` remains an instant reject. **The distinction that makes it tractable: a full clear should require explicit intent, not be inferred from an empty payload.** A backend that refuses — or quarantines and logs — a write that would delete every row of a non-empty journal *absent an explicit clear flag* is a different predicate from emptiness-as-provenance.

**Not dispatched. Raised for PO decision**, because it widens scope inside a 43-hour window, on a money path, in a file under a scoped grant, and B has two consecutive rejections on exactly this kind of "make a resolver total" widening. **B''s own standing lesson applies: the next attempt must be smaller than the last.**

### 11.2 Two other things D-4 changes

**DEPLOY-01 gets sharper, not softer.** We now have two live surfaces at different builds, and **we cannot name the commit on either.** B bounded production to "any build cut since 3 July." That ambiguity is now load-bearing for a safety decision.

**The M1 surface question is upgraded.** §10 asks whether `chart/index.html` and `chart/dist-v9/index.html` are module-equivalent. **We now know a third surface exists — production — and no measurement has ever been taken on it.** Every performance number this project holds was taken on test. **We do not know that production performs as test does**, and the canary ships to production.
