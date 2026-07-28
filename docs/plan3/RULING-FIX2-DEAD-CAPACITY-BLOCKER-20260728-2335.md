# RULING — FIX 2 is correctly dead and my allocation-churn hypothesis is refuted with numbers. A's self-reported sweep gap does not hold the train but the false-pass contradiction must be reconciled. Top-tier review is rate-limited and FIX 1 cannot merge, so we route around it: A already owns the instrument that decides whether FIX 1 is even the right fix, and it needs no review capacity to run.

**2026-07-28 23:35. Four decisions. The capacity one is the only genuine threat to the PO's lag ruling.**

---

## 1. FIX 2 dead, and the refuted premise was mine

**A measured the real replay path at product pacing, deterministic across repeats on all six scenarios:**

| scenario | idle | **GC self** | tick path |
|---|---|---|---|
| 1m @ 60x, paced 250ms | 97.13% | **0.258%** | 0.02% |
| 1m @ 100x, paced 300ms | 97.70% | **0.128%** | 0.01% |

**Garbage collection is a quarter of one percent at worst, and that figure is an upper bound on product** because paint, indicators, orders and panel sync were stubbed. **Per-tick allocation reuse cannot pay for itself.**

**The premise was mine.** I wrote it into `FINDING-COMPILED-CODE-AND-CHURN-20260728.md` from the 15.9 MB/s allocation rate in the PO's heap snapshots, reasoning that churn produces GC pressure and GC pressure is felt as stutter. **The allocation rate was real and the inference from it was wrong.** A high allocation rate with cheap collection costs nothing, and I never measured the collection.

**Fourth dead premise today, and the cheapest of the four** — one measurement instead of an authored packet.

**A also produced the replay path's actual cost, which I am recording because it is the first real answer to "what does replay spend time on":** `normalizeTimestampMs` 1.04%, `findGoToTargetIndex` 0.64%, `_prepareBarsForResampling` 0.41%, `_resampleDataFull` 0.07%. **All in `chart.js`, none in `replay-system.js`, together about 2% — eight times larger than GC and still small.**

## 2. The tick-rate saturation, which is the most consequential measurement of the night

**`tickIntervalMs` floors at 250–300ms, so ticks per second cap at about 4 and never rise.** Above roughly 15x the multiplier buys no extra ticks; it only enlarges the jump per tick. **Identical on 1m and 1D at every speed**, reproducing A's earlier single-chart cap from a different instrument.

**Two consequences.**

**First, for the release notes: true speed saturates near 100x.** 300x, 1000x and 3600x all deliver the same candles per second as 100x. **We must not describe them as distinct speeds.** The PO's 10x cap makes this unreachable in the product, so it is a disclosure item rather than a defect.

**Second, and this is why it matters tonight: A's instrument measures achieved ticks per second, which is exactly the throughput half of the question I sent to C two hours ago.** The PO could not tell me whether "50% slower" meant a slow clock or a jerky picture. **A can measure it.** Run the same cadence measurement in four-panel multichart with content: **if ticks per second falls from 4 toward 2, it is the clock. If it holds at 4 while the picture stutters, it is paint.**

**Ordered: C does not build the throughput half of its benchmark. A's instrument already does it.** C keeps frame timing and long-task counting, which A's harness does not cover. **Told to both, to prevent a duplicate build.**

## 3. A's sweep coverage gap — the train is not held, and here is the reasoning

**A self-reported that its sweep round-tripped every switch `absent → true → absent` from an already-booted page and never tested booting with the flag already on**, so the nine PASS verdicts cover flip-after-boot rather than boot-under-flag-on, **and the one stranded switch it caught was caught by accident.** Reporting this against its own accepted result is the behaviour I want and it is the second time tonight A has weakened its own claim unprompted.

**But it does not hold the train, and the reason is directional.**

**In an incident we flip a switch to turn something OFF.** A guard sampled at init, booting with the flag already on, **does not install the feature — which is the outcome we wanted.** The stranding A describes fails in the *restore* direction: after booting flag-on, deleting the flag does not bring the feature back. **Restoration is served by deploying without the flag and letting pages load fresh.**

**So the untested shape is a recovery-path defect, not a rollback-path defect, and rollback is what the canary needs.**

**Two things this does not excuse.** `FLAG-02` demands a flip-back without reload, so **the realm mechanism must satisfy both directions** — it is being built now and this is a requirement on it, not on the train. And **a sweep whose PASS verdicts we cannot trust is a defective instrument regardless of product risk.**

**Required: reconcile the R3-P4 contradiction explicitly.** A's triage reads the module-presence tripwire as sampled once at IIFE evaluation; A's sweep passed it; A added lazy republication for precisely that shape. **Either the remediation works and the triage is wrong, or the sweep issued a false pass.** Both cannot stand, and **the module-presence tripwire is the capability-loss detector — the one component whose silent absence is the entire Plan 3 defect class.** Same for R1-P5, where A suspects the M23 shape in its own packet behind the `_mcDiagUpdateChartDataWrapped` latch.

## 4. A money-path switch that does not exist — routed to B

**`__TALARIA_DISABLE_M20_Q4_TRAIL_SL_PATH_CAP_V1` exists only as a `killSwitchProposed` string, with the trail-SL push sites in `order-manager.js` ungated.**

**So there is a documented kill-switch for a money path with no implementation behind it.** The hazard is not the missing gate; it is that **an operator in an incident may believe a lever exists and pull it.**

**B owns `order-manager.js` in this train. Minimum action: the canary runbook states plainly that this switch does not exist.** Implementing it is out of scope tonight.

## 5. The capacity blocker, and the decision I am taking rather than escalating

**All three of A's subagents died on `API usage limit reached`. Top tier is rate-limited.** A's standing rule permits author downgrades but never reviewer downgrades, so **anything touching `chart.js` shared paths can be authored but not merged — and FIX 1 is in that class.** FIX 1 is now the **only** remaining lag fix.

**I am not asking the PO to weaken review tier, and I am not waiting.**

**FIX 1's premise is unmeasured.** It proposes reducing render cadence for non-focused panels, which attacks contention — **the paint half.** If the lag is the clock rather than the paint, **FIX 1 is the wrong fix and burning scarce top-tier review on it would be the most expensive error available to us tonight.**

**Ordered: before FIX 1 is authored further, run the cadence measurement in four-panel multichart with content.** Measurement needs no merge, no `chart.js` change and no top-tier review, so **it proceeds at full speed while review capacity is unavailable.** It either validates FIX 1 or kills it as cheaply as FIX 2 died.

**If it validates FIX 1, we will have a measured target and a queued merge, and the capacity question becomes a real PO decision with evidence behind it. If it kills FIX 1, the capacity blocker evaporates and we stop needing the review at all.**

**Either way we learn tonight, at author tier, with no waiting.**
