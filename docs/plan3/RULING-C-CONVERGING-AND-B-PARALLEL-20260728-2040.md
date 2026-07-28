# RULING — C is converging, not looping, and the evidence is unambiguous. But C escalated at 18:35 and I have not answered for two hours. Answering now. Plus B's parallel work, led by a census the b12/b50 discovery demands.

**2026-07-28 20:40. PO asked whether C is stuck in a loop. It is not, and here is the proof.**

---

## 1. C is converging. Three tests distinguish it from the earlier loop.

**Test one — each rejection closes the previous round's findings.** The reviewer's own words:

> R-W57d: *"NC orphan live-proven; per-channel + identity + soak **closed**. OPEN: INSTRUMENTED proves install not observe…"*
> R-W57e: *"Timer/rAF liveness **closed live**. OPEN: wrapper identity omits Worker/MessageChannel/BroadcastChannel/addEventListener…"*

**A loop repeats. This closes and advances.**

**Test two — defect scope narrows each round.** Round one was *"census has no liveness self-proof"*, which is fundamental. Round four is *"wrapper identity omits four specific channel types"*, which is a named list. **Narrowing scope is what convergence looks like.**

**Test three — three packets ACCEPTED today.** `R-W59 ACCEPT` at 18:04 (the hidden-tab gate for A's FIX 3), `R-W58d ACCEPT` at 18:35, `R-W62c ACCEPT` at 19:35. **The process demonstrably terminates.** Test counts rise with each round: 14/14 → 20/20 → 26/26.

**Contrast with the genuine loop I broke this afternoon:** eight consecutive M6 rejections each adding another syntactic pattern, with no finding ever closed and no narrowing. **That was a loop. This is not, and I am not intervening.**

**Expected completion for W57: one to two more rounds, so roughly thirty to sixty minutes.** W57f is authored and awaiting review now.

## 2. C's escalation, unanswered since 18:35 — ruled now

**C wrote:** *"PO-CPU-AB instrument honest but acceptance never GREEN live: playhead advances while workRatio delta stays ~0.01 vs pinned 0.03. Need Director/PO: recalibrate margin against real tab CPU protocol, or accept RED-as-instrument on unfixed product with separate ship criterion."*

**Two hours of silence on a direct escalation. That is the same failure that cost us the T+6h milestone, repeated in the same day.**

**Ruling: accept RED-as-instrument. Do not touch the margin.**

**The reasoning is C's own rule turned on itself.** `GATE-01` requires a gate to be shown RED on a known-defective input before it is trusted. **The product is defective — FIX 1 and FIX 2 are not built. A gate reading RED on it is the gate working, not the gate failing.** A green reading today would be the alarming outcome.

**C's reviewer already anticipated the wrong answer and warned against it:** *"do not lower margin to soft-pass."* **The reviewer is right and the margin stays pinned at 0.03.**

**Separating the two things C conflated:** the gate being accepted as an *instrument* depends only on whether it measures honestly and can be shown to move. **The gate reading GREEN is not a ship precondition — it is the precondition for claiming the CPU work succeeded.** Those are different gates and C should record them as such. **Ship criterion stays as written in `CANARY-GATE-20260728-2020.md`; the CPU gate turns green when the product improves or it never turns green and we disclose that.**

## 3. C's second residual is more dangerous than the first, and it needs priority

**From R-W62c: *"even with dynamic grid P4 playing=1/4 advanced=0"*.** The four-panel harness can only get one panel of four actually replaying.

**That harness is gate 11 — the benchmark that grades FIX 1 and FIX 2.** **If it cannot drive four panels, we have no way to measure the two fixes that the PO ruled into canary scope.** W62d is on it, and it should outrank the remaining W57 rounds if C has to choose.

**Naming the risk plainly: we could finish both lag fixes and have no instrument capable of telling us whether they worked.** That would leave us disclosing a performance ceiling we had possibly already fixed — the same trap I flagged for the idle-CPU disclosure.

## 4. B's parallel work — five items, none waiting on A

**B is blocked on A's four items and has said it will re-verify the tip when they land. Correct, but it is idle time and B's charter forbids it.**

**1. A build-stamp census of every servable route. This is the highest-value item and it exists because of an accident.** The P6 probe found `/chart/talaria-design/live/` serving **b12 and b50 against a current b81**. **We found that by aiming a probe at a different question. There is no reason to believe it is the only such route.** Enumerate every servable path and report the build stamp each one returns. **Any route serving below current is a live hole through which today's fixes — including the trade-loss guard — leak away.**

**2. Build the P6 remedy now rather than after A restores the file.** The requirement is that the route stops delivering stale code. **If a redirect to the canonical shell is cheaper than making the twin current, prepare it now so A's restore and your remedy land together.**

**3. Pre-clear FIX 1 and FIX 2 delivery paths**, exactly as you did for FIX 3. A will need them and getting in front worked last time.

**4. Close the remaining open paths on your own fourteen-item list** — Cloudflare warm cache, ordinary auto-increment behind live, PO browser and service-worker residual.

**5. Write the post-push verification runbook** so the push and its verification are one motion rather than two, including the edge-cache check and the build-badge confirmation the PO will use.

**Item 1 first. It generalises a defect we found by luck, and finding the rest on purpose is precisely what your charter asks for.**
