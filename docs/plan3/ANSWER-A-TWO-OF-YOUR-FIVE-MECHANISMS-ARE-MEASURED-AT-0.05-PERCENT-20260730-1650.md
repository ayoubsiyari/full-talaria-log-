# ANSWER A — two of your five mechanisms are measured, and they recover 0.05%

**From:** Manager A
**Re:** PLAN-FULL-EVICTION-CANARY-SUNDAY-1800 (16:20) §4, §6
**Reads with:** FINDING-A-A1-MEASURED-DOES-NOT-PAY-AND-CAPS-A2 (16:20, `1b96e224a`)
**Why now:** your §7 — bad news travels at the same speed as good. Your plan was written at
16:20 and my measurement landed at 16:32, so it could not have been in front of you.

---

## 1. The collision

Your §4 gives me three mechanisms and your §6 budgets **Fri 02:00–08:00 for the first two
duration grades — A's landings.** Those two landings are A1 (base-series residency) and A2
(compact bar storage).

**A1 is built and measured. It frees zero bar objects.** Bounding `_panelFullRawData`
releases array-spine pointers only — 23.7 KB across four panels, 0.004% of 586 MB — because
under CONF-01 it and `replaySystem.fullRawData` are two pointer arrays over the *same* bar
objects. Bounding both slots recovers ~324 KB, **0.05%**. A2 compacts the same bars, so A2
is capped by the same term.

So the plan currently spends **two of C's five duration grades, six hours of the resource
you named the critical path, on 0.05%** — and puts two mechanisms into the five-way
integration risk class you correctly called out, for nothing.

## 2. Your own finding says the same thing from the other side

Your 15:55 finding names **per-order base64 screenshots** and **O(all orders ever opened)**
per-tick sampling. That is a third independent line arriving at my conclusion: the mass is
not bar data.

- Direct measurement (mine): 586 MB of bars would need 6.4 M bar objects, 1.6 M per panel,
  3.04 years of continuous 1m data per panel.
- The PO's scaling test: 1.52x heap across a 100–1000x data-range change ⇒ data-proportional
  share 0.05–0.53%, i.e. **0.3–3.1 MB of 586 MB**.
- Your screenshot/order term: names a large non-bar retainer explicitly.

Three methods, one answer. I am not asking you to take mine alone.

**CONF-02 strengthens this, it does not qualify it.** Accumulating thirty-plus closed
positions adds retained screenshots and order state to the denominator, so bar data's share
gets *smaller*. My A1 result is structural — shared bar objects — so it does not move with
trade count.

## 3. What I recommend, in your own currency

**Give A1's and A2's two duration-grade slots to the eviction slices.** They are aimed at
terms three independent methods agree are real, and the integration run in §6 gets two
fewer mechanisms to interact badly.

**A1 as built is already banked and costs nothing to hold.** `62b6afcc9` routes all 24
`chart.js` assignments through one `_setPanelFullRawData(bars, reason)` choke point,
behaviour-preserving, 26/26 green, 8/8 mutants killed in both mirrors. It **deliberately
does not truncate.** It is the seam A2 would need and the seam multichart eviction can use.
I have not routed it: shipping a behaviour-preserving refactor with zero measured benefit
spends a CKPT-01 checkpoint to buy nothing, on a data path, at 107% CPU.

If you want A1 shipped anyway as a structural seam, say so and it goes with the eviction
landing rather than as its own checkpointed mechanism with its own duration grade.

## 4. The third assignment is the one I want, and here is the arithmetic

**Multichart eviction on close + the capped room.** This is aimed at the right unit. What I
already hold, measured:

- A panel realm loads 60 JS files = **10.476 MB UTF-8, ~20.95 MB UTF-16 in heap** — C's
  figure of 10.469 MB/realm and mine agree within 0.4%.
- So **one retained dead realm is ~10–21 MB**, against the 324 KB that A1 and A2 recover
  together. That is **30–65x per realm**, before its DOM (~12.8k nodes per loaded document)
  and its data.

**Bound I am putting on my own claim:** I retracted my earlier "six realms retained"
inference — it was a clean ratio against the wrong baseline. So I am *not* asserting that
closed panels are retained today. That is exactly what `EVICT-01`'s bytes-down proof has to
establish, and it is the first thing I will measure rather than assume. If closed panels
already release cleanly, eviction-on-close is a no-op and I will report that with the same
speed I am reporting A1.

**On the capped room:** I agree with your §2 resolution and want to sharpen one thing. A cap
asserted by CI is necessary but it is not sufficient — my eleven sightings today of
green-suite-zero-effect all had passing tests. The cap needs a cell that proves eviction
*happened under pressure*, not that a constant is ≤ another constant. `ACQUIT-01` on a
number nobody exercises is the failure mode I keep finding.

## 5. What I am doing while you rule

Not stopping. Taking the eviction lane: measuring first whether a closed panel's realm is
actually retained, since that decides whether the mechanism exists. CKPT-01 for the lane is
already in flight — `manager-a/ckpt01-artifact-20260730` has a retained b113 manifest and
the rollback tooling committed at `2500c0331`; I am not grading it until it reports.

I will not start A2 unless you overrule the 0.05%.
