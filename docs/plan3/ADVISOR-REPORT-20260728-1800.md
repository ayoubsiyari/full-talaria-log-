# Advisor Report — Plan 3, T+8h45m of 48h

**2026-07-28 18:00. Prepared for the advisor at the PO's request. Canary posture per PO ruling: ship honest and stable, disclose the performance ceiling.**

**Overall completion: ~55%. Roughly 39 hours remain; remaining work is estimated at ~22 hours on the critical path. The schedule risk is not the known work — it is the rate at which we are still discovering new defects. We found a significant one 25 minutes before writing this.**

---

## 1. Headline: what changed today

**We stopped theorising about CPU and memory and started getting evidence, and the evidence overturned three of our own conclusions.** The most consequential finding arrived at 17:35 and is the kind that is embarrassing precisely because it is simple.

**The replay engine has no concept of page visibility.** `replay-system.js` contains **zero** occurrences of `visibilitychange`, `document.hidden` or `visibilityState`, and playback is driven by `setInterval` at `:4548`. **Backgrounding the window does not stop replay.** It continues advancing candles, allocating per tick, and rendering into a canvas nobody can see, indefinitely.

**PO evidence: a single chart, no multichart, left in a background window untouched.**

| Measurement | Value |
|---|---|
| Tab memory footprint | **1.24 GB** |
| Tab CPU while backgrounded | **18.8%**, later 9.5% |
| `Detached <div>` | **81,423**, up from 65,036 |
| `(compiled code)` | ×498,323, 112,920 kB retained — **22% of heap** |
| Main-thread busy over 33.3 s | **13.3%** |
| Busy time `[unattributed]` | **3,875 ms of 4,442 ms — 87%** |

This is a **single-chart** leak, independent of the multichart orphan leak, and it closes an item we had flagged as unexplained: the ~19,800 detached divs that existed *before* any multichart was opened. That baseline was replay accumulating, not a mystery.

## 2. Established with evidence

**(a) Trade-loss defect — highest severity, non-performance.** Live on the public deployment since 3 July, roughly 100 testers exposed. Chain: a failed or **slow** backend state fetch causes the client to mark the session hydrated-empty, persist an empty journal, and the backend's replace semantics deletes all rows — **unlogged**. The trigger condition (`!backup || !om`) is broader than first believed because it includes slow loads, not only failures. **Fixed:** client-side tri-state admit-list guard plus backend delete logging, in the hotfix train. Because the deployment model is a single push at the end (PO ruling D-5), a tester notice was the only available mitigation for already-exposed users.

**(b) Orphaned replay engines — multichart memory.** `M20Q6ReplaySystem` instances go **4 → 17 after five open/close cycles**, over 80 MB retained. **`destroy()` is called** — lifecycle state reads "destroyed" — but it neither nulls `fullData` (~7.2 MB per instance) nor removes the instance from a strong `Map` that holds it **as a key**. Fifteen detached `HTMLDocument`s persist. `(compiled code)` triples from 45 MB to 137 MB, attributed to leaked panel documents each retaining a bundle.

**(c) Lag is concurrent, not residual — this reversed our working theory.** The PO compared single-chart replay before and after five multichart cycles and reported them **identical**. So orphaned engines consume memory but **do not cause felt lag**. The ~50% degradation occurs *during* four-panel operation. We retargeted the lag work at per-tick allocation churn — the four-panel session showed a 954 MB JS heap **growing at 15.9 MB/s** — and at background-panel render cadence.

**(d) The competitive CPU gap is fixed overhead, not a per-tick multiplier.** Roughly **33–36 percentage points, near-constant across replay speeds**, which refutes a per-tick amplification model in favour of a fixed cost per wall-clock second. **Storage was refuted as the memory cause:** Talaria uses 582 kB of client storage against TradeZella's 4.3 MB — **7× less**. TradeZella persists candles to IndexedDB; we hold them in RAM.

**(e) Our idle-CPU work is now in doubt, and we should say so plainly.** We spent most of the day on a ~13% busy floor. We found an unconditional 60fps rAF loop, but ablation recovered only **1.3–3.4 percentage points**, and **6.3 points of the measured 13.12% turned out to be profiler overhead**. Today's trace shows **13.3% busy on a backgrounded tab with replay still running**, with periodic 2–4 second humps consistent with a throttled background timer rather than a smooth render loop, and 87% of busy time unattributed to any named function. **Hypothesis, not fact: a substantial part of the "idle floor" was replay running unpaused.** Two consequences: cancelling the rAF guard looks correct for a reason we did not possess at the time, and **M7 must not disclose an idle-CPU architectural limitation until this is settled — we may otherwise disclose as permanent something we have actually fixed.**

## 3. Open, unresolved, or at risk

**CPU spikes to 120% have never been reproduced.** Two recordings of 33 s and 60 s show no spikes. Current suspicion is the orphaned engines retaining live listeners, which would mean the memory fix kills them incidentally. **That is a hope, not a plan.**

**Four accumulating `rn` collections, unidentified.** ~63,000 objects and ~6.6 MB retained each. The count grew from three to four, and **the two oldest are byte-identical across snapshots taken hours apart** — so something creates a new one periodically and never releases the old. Assigned, not yet diagnosed.

**Build attribution is absent and it endangers the verification round.** `/chart/index.html`, the shell the PO actually opens, **carries no build ID**. Every measurement in this report is therefore untied to a commit. When the PO retests after the fixes land, we will not be able to distinguish a wrong fix from a fix absent from the served bytes from a fix served stale. **We were bitten by the latter two separately today** — a mirror-staleness question, and `order-manager.js` changing while its `?v=` cache stamp did not move. A third occurrence during final verification is the most expensive failure available to us at this deadline. This is now B's top priority.

**Our memory gate does not detect the leak.** C's M-6 gate reads GREEN on the exact code the PO measured leaking 4 → 17. It is being hardened to the PO's real conditions with inverted acceptance: it must FAIL on today's code before it is trusted.

**The memory fix is merged as "code-correct, effect not demonstrated."** A's harness could not reproduce the leak the PO found. We merged rather than held, and designated C's browser-based gate as the demonstration instrument rather than rebuilding A's harness.

## 4. Process failures — the part most useful for advisor scrutiny

**These cost more hours today than any single technical defect, and all of them were mine.**

**Single-manager routing.** Every performance finding landed on Manager A because I treated performance as A's territory without asking whether the *diagnostic* half could go elsewhere. A queued deep while B and C ran dry. Corrected by cutting three items from A and moving diagnostic work to C.

**Inbox flooding.** Four of my messages sat unread in A's inbox simultaneously and **contradicted each other** — one claimed to supersede A's queue while later ones added to it, and A would have authored ~56 code writes on an item I had already cancelled. Ruled as DISP-01: a manager's inbox holds at most one pending Director message; a new finding means rewriting the pending message, not appending.

**Silence.** A 4.5-hour delay answering an A escalation caused the T+6h milestone miss. **Together with the flooding above, both directions of Director throughput failure occurred within one day.**

**An adversarial loop.** Manager C rejected eight consecutive revisions of one gate, each attempting to detect object mutation statically. It resolved only when I changed the mechanism to runtime enforcement via `Object.freeze()`, converting an unbounded static-analysis problem into a bounded behavioural test.

**A recurring defect class: tests that pass without demonstrating capability.** This appeared often enough to generate standing rules — most importantly **GATE-01** (a gate must be shown to go RED on a known-defective input before it is trusted) and **VER-04** (a suite that a no-op stub can satisfy is vacuous). One harness was destroying real trades while printing PASS.

**Operating posture changed on PO instruction** from *diagnose, confirm, then fix* to *fix on suspicion behind kill-switches, and let measurement grade the fix rather than authorise it.* The PO's judgement was that the former was burning the schedule in analysis. **I accepted this fully and it is now in force.**

## 5. Questions where advisor input would change what we do

1. **Given §2(e), is it worth re-establishing any CPU baseline before canary at all?** The measurement noise between two idle recordings was 4.5 percentage points — larger than the effect of the fix we ablated. The alternative is to ship with CPU disclosed as not precisely measured.
2. **Compiled code at 22–30% of heap.** Is per-panel iframe bundling the architectural error here, and is there a bounded mitigation short of a renderer rewrite that we cannot afford in this window?
3. **Is "fix on suspicion behind kill-switches" the right posture at T-39h,** or does it risk shipping a stack of flags whose interactions nobody has verified? If the latter, what is the right cap on unverified flags in one train?
4. **How should we treat the spikes if they are never reproduced** — disclose and ship, or treat as a canary blocker?
5. **Review capacity is our actual bottleneck.** Authoring is cheap and parallelises; review does not, and same-packet author/reviewer must stay serial. Is there a safe way to widen review throughput without weakening it?

## 6. Honest summary

**Four of five performance and integrity defects are identified with mechanisms named in code rather than hypothesised.** The trade-loss defect is fixed. The two memory leaks have exact mechanisms and small, well-bounded fixes. The lag has two candidate fixes in build. **The spikes remain unexplained and I will not claim otherwise.**

**The largest risk to the deadline is neither the fixes nor the managers. It is that we are still finding defects that were present all along** — the visibility defect had been there the entire time and we walked past it for a full day while measuring its symptoms.
