# HEARTBEAT A — A1 pays, and I can finally size it. Plus one RED gate.

**From:** Manager A
**Status:** A1 mechanism BUILT and bounding both slots. 19/24 green. **5 RED, all diagnosed, none a price divergence.**
**Supersedes:** every ceiling I have put on A1 today. Both of them were wrong, in the same direction.

---

## 1. The number

A1's value is **entirely** a function of how large the base master has grown. Using the
shipped window arithmetic — `windowBars = clamp((visibleBuckets*2 + 2) * perBucket, …, 20000)`
plus a 6,000-bar forward runway — across the four CONF-01 panels:

| master per panel | bar objects evicted | MB freed | share of 586 MB |
|---|---|---|---|
| 2,000 (fresh boot) | **0** | 0.00 | **0.00%** |
| 20,000 | 36,918 | 8.53 | 1.46% |
| **70,989 — the master I actually measured in production** | **240,398** | **55.53** | **9.48%** |
| 200,000 (the copy limit) | 756,398 | 174.73 | 29.82% |

**At the master size I have myself observed on the deployed build — 70,989 bars, from the
playback allocation profile — A1 frees 55.5 MB, 9.5% of the measured heap.**

That is roughly **170x** the 0.05% I reported at 16:20. My error was worse than the snapshot
admission I already made: I measured at 1,440 bars, which is *below the threshold where any
bar is evictable at all*, so I was measuring a structural zero and calling it a ceiling. The
correction stands entirely against me and this is the third time today I have had to move my
own number on this packet. The mechanism was never the problem; my instrument was pointed at
an empty configuration.

## 2. The binding constraint, priced

**The forward runway is what stops A1 evicting more.**
`_independentMasterCoversReplayTimestamp` returns false unless the master reaches
`playhead + 6000*tfMs`, and when it goes false the code refetches in a way its own comment
says "would wipe the chart and show loading". So 6,000 base bars must stay resident:

- **1.39 MB per panel, 5.54 MB across four, that A1 cannot touch** without changing that
  predicate's semantics — which is a separate packet, not something to slip into A1.
- Consequence: the **coarse** panel needs a master above **20,520 bars** before it can evict
  anything, because at 1h each display bucket costs 60 base bars, so one screen plus runway
  already exceeds 20,000.

This is why cell 13 ("keeps `_independentMasterCoversReplayTimestamp` on its unbounded
answer") is GREEN and cell 14, the deliberate reversal control, correctly goes RED. `GATE-01`
is satisfied: the oracle was shown RED on a faithful reversal before its GREEN was trusted.

## 3. The five RED cells — what they are, and what they are not

**None of them is a price divergence.** Cell 7 is a bar *count* disagreement (expected 8,241,
actual 6,242 — and 6,242 is exactly the 1m panel's correct retained figure, 242 + 6,000), so
it is the test's expectation formula disagreeing with the implementation's, not corrupted
data. Cell 8, the field-exactness cell over every bucket the bound still covers, is GREEN.

Three of the five — 11, 12 and 21 — fail on **the same root cause, and it is the test scene,
not the fix**: all three fail their *positive control* with "something was actually evicted",
on USDJPY, the 1h panel. `BASE_BAR_COUNT` is 20,000, which is **520 bars below** the 20,520 at
which a 1h panel becomes evictable. Nothing was evicted because nothing *could* be. The
controls did their job — they refused to let three cells pass vacuously on a panel where the
mechanism had not run. That is the opposite of the failure mode I have been finding all day.

Cell 19 is a genuine harness defect: `Array buffer allocation failed`, an OOM building four
20,000-bar scenes. It needs the scene built cheaply, which is awkward, because building bar
data cheaply is exactly what A2 does.

## 4. What this means for the plan

- **A1 is worth building and is nearly built.** Both slots bound with one allocation (cell 9),
  retained bar objects fall de-duplicated by identity (cell 10), the master is never mutated
  in place (cell 6), and the kill-switch truthy-disables and leaves the master unbounded
  through the real write path (cells 15, 16).
- **A1's win scales with the growth path**, which is the uncapped
  `_mergeIntoPanelFullRawData` on `_ensureIndependentPanelCoversPlayhead` — the play path, on
  the independent path. Your "their heap falls when playing while ours triples" remains the
  best corroboration that this growth is real, and the fitted slope is the one number still
  outstanding.
- **A2 gets a stronger case, not a weaker one.** At 70,989 bars the four masters hold ~284,000
  bar objects; A1 evicts 240,398 of them and A2 compacts whatever remains resident. They
  compose at the seam A1 built, exactly as scoped, and still on separate flags.

## 5. Next, without stopping

Fixing the three positive-control failures by making the scene production-faithful at the
70,989-bar master I measured rather than an arbitrary 20,000, resolving cell 7's expectation
formula against the shipped arithmetic, and rebuilding the scene cheaply to clear the OOM.
Then the growth slope, then the realm-eviction grading, then A2.

**Disclosure on process:** four dispatched packets stalled without reporting (A1 truncation,
CKPT-01 rollback, realm-eviction grading, retention census) and the A1 work was sitting
uncommitted through the crash. It survived byte-identical and is now secured as `c97b06421`,
explicitly labelled unverified. I am doing this work directly rather than re-dispatching it.
I also called the slow suite a "hang" — it terminates in 114 seconds; the earlier 17- and
81-minute runs were both suites at once.
