# DISPATCH A — the P6 condition you were waiting on resolved 45 minutes ago and nobody told you. But read §2 first: B's redirect probably makes your restore unnecessary. And §3 is the important one — you have found three stranded switches today, and our entire rollback plan rests on switches working.

**2026-07-28 21:05. `homepage/public/chart/talaria-design/live/` is still absent from your tip. It is the last blocker on the push.**

---

## 1. The handoff gap, which is mine

**Your journal records the conditional correctly:** *"Nothing requests the route → proceed; anything does → restore… and the deletion moves to a later train."*

**The condition resolved at 20:18.** B probed the host: both `/chart/talaria-design/live/` and its `index.html` return **HTTP 200**, nginx `try_files` under `/chart/`. **Route has consumers. P6 does not clear.** I ratified it at 20:30.

**You have been waiting on a verdict that was published 45 minutes ago.** B wrote it, I ratified it, and nothing carried it to you. **That is the second routing failure of mine today on this exact pair of managers, and it is now the sole thing holding the push.**

## 2. Before you restore anything — the redirect may already solve it

**B has prepared an nginx `302` for `^~ /chart/talaria-design/live` pointing at `/chart/dist-v9/index.html`.**

**A `return 302` on a prefix match never consults the filesystem.** So if that config ships, the deleted file cannot produce a 404 — **the route stops serving stale bytes and stops 404ing, by the same change, and your restore becomes unnecessary.**

**Ordered: ask B one question — does the nginx config ship inside this train, or is it applied separately?**

- **If it ships with the train: do not restore. P6 clears on B's redirect alone.** Record it and move to §4.
- **If it is applied separately, or if you do not have a clear answer within fifteen minutes: restore the file anyway, stamped current.** **A redundant file costs nothing. A 404 on a live route costs us the one push we have.** Do not spend longer than fifteen minutes resolving this — the asymmetry decides it.

**Do not restore the file at its old content.** The census found that route serving `b12`/`b50` against a field `b75`. **Restoring stale bytes would satisfy P6 while preserving a hole that leaks every fix in this train, including the trade-loss guard.**

## 3. Your three-in-one-day finding is the most important thing in your journal, and it changes what must happen before the push

**Your words:** *"This defect has now appeared three times in one day in three different disguises — M28 stranded OFF→ON, Q9 stranded ON→OFF by self-uninstall, P4 stranded ON→OFF by init-time sampling. **It is a family, not three incidents.**"*

**Ratified, and I want to state the consequence you stopped short of.**

**Our entire safety strategy for this release is kill-switches.** The PO directed us to fix on suspicion and rely on switches to revert. I ruled that no render-behaviour change ships without one. **The train now contains at least six switches added in the last hour.**

**And the switch mechanism itself has failed three times today, in three different ways, all found by you.** **A stranded switch is worse than no switch**, because it makes us believe we can revert when we cannot — and under a single-push deployment, a false belief in revertibility is the difference between a bad hour and a bad release.

**Ordered: before the push, every switch in the train is verified for in-page round trip — OFF → ON → observe → OFF → observe — with the ABSENT-property default as the starting state per FLAG-01.** Not the switches you happen to doubt. **All of them.** If that is more work than time allows, tell me and I will decide what ships rather than have you guess.

**This outranks FIX 2 and FIX 1.** A train of switches we cannot trust is not safer than a train with none; it is the same risk wearing a badge.

## 4. Your queue after that

**FIX 2, per-tick allocation reuse, then FIX 1, background-panel render cadence** — both still unbuilt, both authored concurrently in separate worktrees per the 18:21 unserialisation, and FIX 1's switch named `__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1` as reserved.

**C's four-panel benchmark was accepted at 20:49, so the instrument that grades these two exists now.** That was the gap I was most worried about and it closed while you were working.

## 5. Two things you got right that I want on the record

**You escalated P6 rather than inventing a flag for a deleted file.** A less careful manager would have shipped something flag-shaped and we would have discovered the 404 in production.

**You corrected my item-1 count from one to six.** I described a single render fix; you enumerated and found six unflagged changes. **Four of those six are now closed by R1, R2 and R3 in under an hour.** That correction is the reason the train is honest.
