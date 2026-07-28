# FINDING — Test 5. The biggest single consumer is COMPILED CODE, not DOM. And multichart allocates ~15.9 MB/s, which is a new and better lag candidate.

**2026-07-28 16:07. PO heap snapshots, `sessionId=889`, three snapshots across single-chart → 4-panel multichart → five cycles. Same tab throughout.**

---

## 1. The headline numbers

**Live heap, from the VM instance selector:**

| State | Main | Workers | Total JS heap | Growth rate |
|---|---|---|---|---|
| Single chart, 4 indicators | **497 MB** | 24.9 MB (×1) | ~522 MB | — |
| **4-panel multichart** | **915 MB** | 11.8 + 6.0 + 13.5 + 7.5 MB (×4) | **954 MB** | **+15.9 MB/s** |

**Opening a four-panel multichart nearly doubles the main-thread heap, from 497 MB to 915 MB.**

**The four indicator workers are NOT the problem** — 6 to 13.5 MB each, one per panel, entirely reasonable. **The cost is all on the main thread.**

## 2. Compiled code is the largest consumer and it triples

Across the three snapshots:

| Metric | Snap 1 (single) | Snap 2 (multichart) | Snap 3 (after 5 cycles) |
|---|---|---|---|
| **`(compiled code)` objects** | ×461,087 | ×482,888 | **×1,098,064** |
| **`(compiled code)` shallow** | 45,046 kB | 64,986 kB | **136,987 kB** |
| **`(compiled code)` retained** | 78,930 kB | 99,164 kB | **172,018 kB — 30% of heap** |
| `Function` objects | ×167,376 | — | **×305,884** |
| `(number)` | ×3,011,590 | ×3,178,147 | ×5,003,311 |
| `{t, o, h, l, c, v}` | ×612,000 | ×701,527 | ×963,214 |

**Compiled code tripled in object count and grew from 45 MB to 137 MB shallow, ending as 24% of shallow heap and 30% of retained heap — the single largest line item in the snapshot.** `Function` objects doubled.

**This is the same root leak as Test 4, showing its real cost.** Each panel iframe loads and compiles the entire chart bundle. **Fifteen-plus leaked panel documents keep fifteen-plus compiled copies of that bundle alive.** The DOM nodes were the visible symptom; **the compiled code is where the megabytes actually are.**

**Consequence for the fix's value:** releasing the leaked documents reclaims compiled code first and detached DOM second. **That makes A's teardown fix worth substantially more than the ~80 MB of orphaned engines suggested at 15:54.**

## 3. Detached divs are flat here, and that is a measurement artefact, not good news

`Detached <div>`: 65,305 → 65,499 → 65,036. **Essentially flat.**

**Do not read this as the leak having stopped.** This session **began** at 65,305 detached divs — it is the same browser tab continued from Test 4, which ended at 44,953 and had climbed further before Snapshot 1 was taken. **Test 5 was specified as a fresh tab and was run on an accumulated one.**

**The div population appears saturated or dominated by earlier cycles, so this session cannot measure per-cycle div growth.** Test 4's monotonic 19,852 → 21,097 → 22,151 → 44,953 on a cleaner session remains the evidence for growth. **Flagging this so nobody later cites Test 5's flat divs as a contradiction of Test 4.**

## 4. NEW — the ~15.9 MB/s allocation rate is the best lag candidate we have

**With multichart open, DevTools reports total JS heap growing at 15.9 MB/s, with the main instance at 14.7 MB/s and each of the four workers at 128 kB/s to 1.6 MB/s.**

**That rate cannot be pure retention** — 15.9 MB/s sustained would be roughly 1 GB per minute, which the session does not reach. **So it is overwhelmingly allocation *churn*: objects created and collected continuously.**

**Churn at that rate means frequent garbage collection, and GC pauses on the main thread are felt as exactly the kind of stutter the PO has described from the beginning.**

**And it explains the shape of the original complaint better than anything to date.** The PO's report has always been that replay lags *only* with drawings, orders or indicators present — **all three of which increase per-tick allocation.** More objects allocated per tick, more GC, more stutter. **Retention explains the memory monster; churn explains the lag monster.**

**Labelled as hypothesis per BRIEF-02.** The rate is measured; the causal link to felt lag is not. **It is directly testable: a Performance recording with multichart open will show GC in the flame chart if this is right.**

## 5. What Test 5 did NOT deliver, and it was the point of the test

**Test 5 was specified to return two subjective lag impressions — replay smoothness before multichart cycles and after — to decide whether the memory monster and the lag monster are one monster or two.** The PO returned heap snapshots instead. **That question is still open.**

**The impressions are still needed and they are cheap.** They remain the only thing that closes the one-monster-or-two question, and §4 raises the stakes: **if churn is the lag mechanism, then the teardown fix may reduce memory without fixing the lag at all**, because churn during operation is a separate defect from retention after teardown.

## 6. Dispatch

**Manager A, added to the top-priority teardown work:**

1. **Include compiled code in the acceptance.** M-6 currently counts engines and detached divs. **Add `(compiled code)` retained size**, since it is 30% of heap and the largest thing the fix should reclaim.
2. **Separately, measure allocation churn with multichart open** — a Performance recording showing GC frequency and the top allocation sites. **If churn is confirmed as the lag mechanism it is a distinct defect from the teardown leak, and conflating them will produce a memory fix that the PO experiences as no improvement.**
3. **Note that the four indicator workers are exonerated** — 6 to 13.5 MB each. Do not spend time there.

**PO: the two lag impressions from Test 5, on a fresh tab.**
