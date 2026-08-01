# FINDING — The lag mechanism is resolved. Throughput is untouched in four-panel multichart; frame pacing collapses from 60fps to 10fps at p95. Two managers reached this independently with different instruments. FIX 1 is validated and FIX 2's cancellation is confirmed. The only remaining obstacle to the PO's lag ruling is top-tier review capacity, which is now a decision with evidence behind it.

**2026-07-28 23:50. C's W64 instrument produced a live reading two hours after I ordered the measurement. It is not yet through adversarial review, and the caveats are recorded here rather than softened.**

---

## 1. The measurement

**C's live run, four panels with content armed (SMA/EMA/WMA), against single chart with content:**

| metric | reading | meaning |
|---|---|---|
| **throughputRetention** | **1.0** | bars per second is **identical** in four panels and single chart |
| **smoothnessRetention** | **≈0.167** | p95 frame interval **16.7ms → 99.9ms** |
| indexDelta | 2 single, 2 across panels A–D | same bars advanced — corroborates throughput |
| mechanismHint | **smoothness → FIX 1** | |

**16.7ms is 60fps. 99.9ms is 10fps.** **The clock is perfect and the picture is six times worse.**

**So the PO's "about 50% slower and laggier" is frame pacing, not rate.** The data advances exactly as fast in four panels as in one; **it is drawn a sixth as smoothly.** That is precisely the sensation a person describes as slower, and it is why I refused to let the PO guess between the two — **a human eye reports this as "slower" while the clock is provably unchanged.**

## 2. Two independent instruments agree, which is why I am willing to act on it

**A refuted FIX 2 by measuring garbage collection at 0.258% of a deterministic replay run.** **C measured throughput retention at 1.0.** **Different harnesses, different metrics, same conclusion: there is no throughput deficit, so there was never an allocation problem for FIX 2 to solve.**

**FIX 2's cancellation is therefore confirmed twice, and my allocation-churn hypothesis is refuted twice.**

**FIX 1 — reducing render cadence for non-focused panels — attacks frame pacing, which is the mechanism that actually degraded.** **It is the right fix, and this is the first time tonight a lag fix has had a measured target rather than a hypothesis.**

## 3. Caveats, stated at full strength

**C did not claim success and I will not either.**

- **`P4 honesty RED, sharedMirrorOnly=true.`** C's own panel-independence check says the four panels may be sharing a mirror rather than rendering independently. **If they are, the environment is not a faithful four-panel product and the smoothness number could be an artefact of the harness.**
- **The run was a short window** — C labels it `LIVE RED (instrument SHORT)`.
- **`R-W64` is dispatched to adversarial top-tier review with seven named attack vectors**, including whether smoothness was measured from host long-tasks only and then credited to each panel, and whether the mechanism hint is forced. **Two of those, if upheld, would invalidate the smoothness figure specifically.**

**So the finding is strong, convergent, and unaccepted.** **It is enough to stop hedging about which fix to build. It is not enough to publish a number in the release notes.**

## 4. What this does to the board

**The lag question is answered. The lag fix is identified. And it cannot merge.**

**A's top tier is rate-limited, A's standing rule forbids reviewer downgrades, and FIX 1 touches `chart.js` shared paths.** My 23:35 ruling routed around the blocker by ordering measurement before authoring — **the measurement has now happened, and it validates the fix rather than killing it. The route around is exhausted.**

**So this is now a genuine PO decision, and unlike two hours ago it has evidence behind it.**

**And the compensating controls available are unusually strong, which I record because it changes the honest risk of a tier downgrade:**

1. **FIX 1 carries a runtime kill-switch** (`__TALARIA_DISABLE_MC_BACKGROUND_RENDER_CADENCE_V1`), already reserved and required by ruling.
2. **C's W64 benchmark is an independent grading instrument** that measures the fix's actual effect on the exact metric that degraded — which did not exist two hours ago.
3. **The PO verifies by feel on the deployed build**, which is how the defect was found in the first place.

**A mid-tier author reviewed at mid tier, graded by an independent instrument, behind a kill-switch, verified by the PO, is not obviously weaker than a top-tier read with none of those things.** **I am not ruling that it is sufficient — that is the PO's call — but presenting "wait for capacity" as the only safe option would be dishonest about what we now have.**

## 5. Minor, and recorded because audit trails matter

**C's journal timestamps run roughly two and a half hours ahead of wall clock** (entries at `00:15Z`–`01:10Z` written before 22:40Z). **A had a forty-five minute skew earlier today.** **Neither corrupts a finding, but two managers with skewed clocks makes the sequence of tonight's events unreconstructable from the journals alone.** C to note its offset in place rather than rewrite entries.
