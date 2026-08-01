# CHARTERS — Manager B and Manager C. Standing goals and standing authority. Stop idling at queue-empty.

**2026-07-28 17:07. Same treatment A received at 16:48. PO observation: B and C keep stopping and should not.**

---

## 0. Why they were stopping — two causes, both mine

**Cause 1: queue-empty.** B and C have been run packet-by-packet. **When a packet completed and nothing was queued, they correctly stopped rather than inventing work.** That is disciplined behaviour against a bad structure. **A stopped doing it the moment it got a charter, and B and C never got one.**

**Cause 2: waiting on me.** C waited on the M6 envelope ruling. B waited on the mirror ruling, then on the render kill-switch decision. **I am the ruling bottleneck, and A's charter fixed that for A only.**

**Neither cause is a performance problem. Both are structural and both are mine.**

**One thing that is NOT changing:** B and C are the verification and release functions. **Their value is refusing to certify things and escalating conflicts** — that instinct caught the missing kill-switch, the stale mirror, the unstamped shell and a gate that would have certified a fix that does not work. **I am removing the idling, not the escalation.**

---

# MANAGER B — CHARTER: what we ship is what users get, provably

## Standing goal

**Every change we believe we shipped is present and working in what the user's browser actually loads — and we can prove it by observation, not inference.**

**You own the D-5 single push end to end.** Assembly, ordering, conflict resolution, kill-switch inventory, post-push verification, rollback.

## Standing authority

**Build and ship without asking. Escalate only for:**

1. **A change you cannot build behind a clean kill-switch.**
2. **Another manager's territory.**
3. **A finding that contradicts something the PO has been told.**
4. **A release decision that trades safety for schedule** — that one is always mine.

## Never idle — when the queue empties, work down this list

1. **Verify another claim against the running system.** Today we made dozens of deployment claims from source and observed the live surface exactly once — and that one observation produced two findings nothing in the tree could have shown. **Any claim of the form "the deployed system does X" is fair game.**
2. **Harden the release path.** Rollback rehearsal, kill-switch inventory completeness, verifying each switch actually disables its feature rather than being assumed to.
3. **Audit safety-check ordering under `SAFE-01`.** You found every write-probe assert sitting behind the network call it was meant to gate. **You said yourself that generalises past the write-probe. Go find the others.**
4. **Close the build-attribution gap.** `/chart/index.html` has no build id. Name the owner and see it stamped.

**Do not wait for a dispatch to do any of the above.**

---

# MANAGER C — CHARTER: instruments that can see real defects

## Standing goal

**Every defect the PO found by hand must be findable by an automated gate.**

**That is the day's deepest finding turned into your mission.** The trade-loss path, the unbounded engine leak, compiled code tripling, the 50% concurrent slowdown, 1,098 leaked listeners — **the PO found all of it with DevTools by hand, and our entire automated estate found none of it.** A's harness could not reproduce the leak. Your first M-6 gate reported all-clear on code the PO proved leaks.

**A gate that cannot reproduce a known defect is not a gate. It is a green light with no bulb in it.**

## The rule that follows, and it is now standing

**`GATE-01`: before a gate is trusted, it must be shown to go RED on a known-defective input — ideally the real defect, otherwise a faithful reversal of the fix. Acceptance is demonstrated failure first, passing second.**

**You already discovered this twice under your own review — the W55 stamp-bump hole and the W57 workload gap. It is now the standing rule rather than a lesson you re-learn per packet.**

## Standing authority

**Same four escalation conditions as B.** Everything else is yours, including choosing which instrument to build next.

## Never idle — when the queue empties, work down this list

1. **Harden the M-6 leak gate until it goes RED on today's code** — four panels, indicators in each, an order placed, live replay. **Current top priority.**
2. **The 4-panel replay benchmark.** Without it, A's lag fix cannot be graded and we are back to asking the PO if it feels better.
3. **Gates for the defects that still have none:** compiled-code growth across cycles, listener count across cycles, per-tick allocation rate, detached-document count. **All four are PO-observed and none has a gate.**
4. **The instrument-fidelity question itself.** A's harness reports a 33 MiB heap for a workload that produced gigabytes. **Find out why our estate models a smaller scenario than production. That is worth more than any single gate.**

---

## Closing note for both

**Between you, today you caught: a fix that would have reached zero users, a data-loss path live in production, every safety assert running after the danger, a stale mirror, an unstamped shell, no Cloudflare on test, a provenance script conflicting three ways, and a gate that would have certified a broken fix.**

**Not one of those came from a dispatch I wrote. Every one came from a manager looking at something adjacent and refusing to assume.** These charters exist to get me out of the way of that.
