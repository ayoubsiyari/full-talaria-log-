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

## 5. Awaiting PO decision

Two calls are the PO's, not mine:

- **Do the ~100 testers get told to export their journals now, before we ship anything?** The exposure has run 25 days. If it has fired for anyone, an export is the only recovery, and an export taken today is worthless for data already gone.
- **Does the guard go out as a standalone hotfix train, or does it wait for the canary train?** Standalone is faster to users and smaller to review; waiting keeps a single deploy but leaves the window open.

## 6. Credit where due

B answered a question I had asked three times, in minutes, without building the harness it would normally reach for, and **self-corrected mid-answer**: it began auditing `homepage/public/chart/**`, the committed mirror, then discovered `homepage/Dockerfile` overwrites that mirror from `chart v 1.4/chart` at build time. **Had it answered off the mirror it would have answered about a file the build discards** — and it would have been a plausible-looking wrong answer, which is the most expensive kind. It also declined to guess on Q3 where guessing would have been easy and reassuring.
