# First-paint allowance — a method, and a refusal to name a value tonight

**C, 2026-08-03 21:45+01:00.** For PO ratification as a number in its own right, per the 21:26 ruling.
Companion to `C-BASIS-OF-THE-1024-BAR-20260803.md`.

---

## 1. I am not proposing a number, and the reason is a defect in the only measurement of it

The obvious proposal is "1,342.9 plus headroom". You already named why that is a ratification rather
than an allowance. **What I found when I went to derive it properly is worse: the measurement it would
rest on is not sound.**

`CONF01-BASELINE-GATE-20260731.json`, b120, five reps, is the only per-process measurement of the boot
transient we have. Three things about it:

**1. Its "post-GC" reading is `HeapProfiler.collectGarbage` followed by a 3-second sleep.** Not a
settled reading. My own pass-3 floor work put the gap between a short reading and a settled floor at
**108.2 MB**, and even at 600-second rungs the boot curve graded `NOT_IDLE`. So `1,159.7 MB` is a
3-second number, and the bar now binds at settled post-GC. **No published figure is currently a
settled post-GC reading**, other than the b126 canonical floor at 674.9 MB, which is COV-01-blocked.

**2. The JS heap reads HIGHER after collection in four of the five reps.**

| rep | JS heap live | JS heap "post-GC" |
|---|---|---|
| 1 | 279.7 | 234.1 |
| 2 | 284.0 | **357.1** |
| 3 | 135.3 | **318.7** |
| 4 | 250.4 | **340.6** |
| 5 | 324.4 | **330.6** |

Rep 3 more than doubles. A heap that grows across a forced collection means the page was still
allocating: the 3-second window was not quiescent, so this is not a floor reading of any kind.

**3. The released figure spans 125.7–261.0 MB across five reps of one configuration** — a **135 MB
spread**, 74% of its own mean of 183.2. An allowance derived from that would carry an uncertainty
larger than most of the fixes we are arguing about.

Proposing a value on this basis would be the third instance today of using evidence without reading
it. I would rather owe you the number.

---

## 2. The method I propose instead

**allowance = settled bar + Σ (attributed, structurally unavoidable construction transients)**

with one rule that does the real work:

> **Unattributed transient does not enter the allowance.** Anything measured but not named must be
> fixed, or waived by name and by a person. The allowance covers construction costs we can explain,
> not whatever the boot happens to cost.

That rule is the whole difference between an allowance and a ratification. It also means the allowance
can only shrink as attribution improves, which is the right direction for a budget to move.

### The components to measure, and what each predicts

| component | why it is structurally unavoidable | how it should scale |
|---|---|---|
| bundle parse and compile | the code must exist before it can run | flat — independent of bars and panels |
| dataset decode | JSON→objects for the initial history creates transient garbage by construction | **linear in resident bars × panels** |
| initial raster and layer construction | first paint must build every layer once | **linear in panel count**, mostly GPU-side |

### Falsifier, stated before the measurement

> **If the boot transient does not scale with resident bars and panel count — if booting at 1,000 bars
> costs substantially the same transient as booting at 7,400 — then it is not construction cost.** It
> is either a fixed allocation that belongs in the settled floor, or a leak. In that case there is no
> case for a first-paint allowance above the bar at all, and the right answer is that first paint must
> meet the same 1,024 MB and we have a defect to fix instead of a budget to grant.

I am recording that in advance because it is the outcome that costs me the most: it would mean the
allowance I have been asked to propose should not exist.

### Second falsifier, on the attribution rule

> If the three named components account for **less than 70%** of the measured transient, the method
> fails and the remainder is a finding rather than a rounding error. I will report the shortfall
> rather than widening the allowance to cover it.

---

## 3. What it costs to produce the number

**One first-paint settle curve.** The floor re-take instrument already implements settle curves with
600-second rungs, forced collection at each rung, and per-process capture; it currently walks two
curves (boot, post-play). This adds a third at first paint, plus two boot variants to get the scaling
term:

1. first paint at the standard 4 panels / ~7,400 bars — the transient itself;
2. first paint at 4 panels / ~1,000 bars — separates the dataset-decode term;
3. first paint at 1 panel / ~7,400 bars — separates the per-panel raster term.

Three boots and three settle curves, roughly **90 minutes on an exclusive box**, and it produces the
allowance, its scaling law, and the COV-01 detailed dumps at the same four moments.

**It is the same run as the floor re-take, extended.** It does not need its own slot.

---

## 4. Interim position

Until that measurement exists:

- **there is no first-paint allowance**, and first paint is reported as a three-row figure with no
  pass/fail attached — `BAR_NOT_APPLICABLE_UNSETTLED` in `bar-basis.mjs`;
- **1,122.1 MB is retired** wherever it appears: it is b116, it pre-dates the per-process census, and
  its like-for-like successor is 1,159.7 MB post-GC on b120 — which is itself a 3-second reading and
  is not the settled number the bar now binds on;
- the only settled figure we have is **674.9 MB (b126)**, and it is not quotable until COV-01 clears.
