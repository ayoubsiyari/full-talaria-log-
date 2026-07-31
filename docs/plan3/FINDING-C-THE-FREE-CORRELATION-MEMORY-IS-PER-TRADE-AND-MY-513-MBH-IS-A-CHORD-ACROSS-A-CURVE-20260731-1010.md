# FINDING — the free correlation: memory is per-trade, and my published 513 MB/h is a chord across a curve

**2026-07-31 10:10** · Manager C · tier=mid model=claude-opus-5-thinking-high
**Ruling** cbfdb81f4 item 2 · **Rules applied** `UNIT-01`, `FIT-01`
**Instrument** `SOAK-TRADE-CORRELATION-V1` · **Artifact** `_evidence\manager-C\SOAK-TRADE-CORRELATION-20260731.json`
**Cost** zero machine time. 58 samples already on disk, no new run, nothing queued behind it.

## Verdict first

**Memory growth is driven by closed trades, not by the clock**, and the evidence is the residual
structure rather than a coefficient. Memory is *linear* in closed trades and *curved* in wall time,
and the trade rate itself fell by half during the soak — a quantity that is straight in trades and
bent in time, where trades themselves bend in time, is a quantity driven by trades.

**And a correction to my own headline: +513.3 MB/h CI[494,532] is a chord across a curve and must not
be extrapolated.** `FIT-01` caught it on its first application.

## UNIT-01 restatement

| unit | figure | quality |
|---|---|---|
| **per closed trade** | **+31.06 MB** univariate, **+16.61 MB CI[11.81, 21.42]** with hours held in the model | the driver's own units |
| per thousand bars | **not derivable from this soak** | resident bar count is non-monotonic here (panels re-seeked and shed bars), so a regression on it returns a negative slope that is an artifact, not a rate |
| per hour | +513.3 MB/h | **only** against the declared configuration: 20.88 closes/hour averaged, selected speed 60x, four panels, four symbols |

The advisor predicted ~23 MB per closed trade. Measured range **16.6 to 31.1 MB** brackets it, and
brackets both bitmap references — a 1920×1080 RGBA bitmap at 8.3 MB and the same at
`devicePixelRatio` 2 at 33 MB. The screenshot-per-trade hypothesis is now supported by an
independent route rather than by arithmetic alone.

## FIT-01 residual structure, which is where the real finding is

| fit | rSquared | runs z | lag-1 | quadratic gain | curvature |
|---|---|---|---|---|---|
| footprint vs **hours** | 0.9810 | −6.57 | 0.778 | **0.7644** | **CONCAVE** |
| footprint vs **closed trades** | 0.9829 | −5.79 | 0.643 | 0.0417 | none |
| elements vs closed trades | 0.9532 | −5.20 | 0.676 | 0.0083 | none |
| footprint vs resident bars | 0.7988 | −4.03 | 0.297 | 0.0000 | none |

Both headline fits have rSquared above 0.98 and they are **not** equally good. Against hours, adding a
quadratic term explains a further **76%** of the residual variance and the quadratic coefficient is
**−62.9**: the curve is concave. Against closed trades the same test buys **4%**. This is precisely
the failure mode `FIT-01` was promoted to catch — a knee hiding inside a clean linear fit — and it was
hiding inside mine.

Every fit here also has lag-1 autocorrelation between 0.30 and 0.78, so consecutive samples are not
independent and **every CI I have published from this soak is optimistically narrow**, including the
ones I quoted last night as an improvement on the dead partial's CI[30, 1432]. The point estimates
stand; the intervals should be read as lower bounds on the true width.

## The trap in the concavity, and it points the wrong way from how it reads

Concave growth looks like good news — a system approaching a plateau. **It is not that.** The trade
rate fell from **32.9 closes/hour** in the first third to **14.9** and **15.0** in the second and
third. Memory is linear in closes; closes bent in time; so memory bent in time. The flattening is a
property of **my workload**, not of the product.

The consequence for tonight's ten-hour soak is the opposite of reassuring: a session that sustains
20+ closes/hour for ten hours has no reason to flatten at all. Nobody should read the concavity as
evidence of a bound, and I would have done exactly that if `FIT-01` had not forced the residuals into
the open.

## What died

**"The 730 MB/h, then 513 MB/h, is the memory rate."** Dead as a rate. It is one chord across one
curve at one trade rate, and the units were wrong. It survives only as "what this configuration did
over this span", which is not what a headline is for.

## What the step test could not do, stated plainly

The clean model-free test — compare intervals containing no trade close against intervals containing
one or more — **had no leverage: all 57 intervals contained at least one close.** The soak closed
trades too steadily for the test to bite. That is why this verdict rests on residual shape, and I am
naming the weaker instrument rather than presenting the conclusion as stronger than its evidence.

What would settle it outright is a run that **varies trade rate at fixed speed**, including a stretch
with zero closes. That is cheap and I am adding it to my queue rather than asking for it.

## Also fixed in my own instrument

The first version of this analysis reported "memory growth concentrates in intervals containing trade
closes" — from a step test with **zero** dead intervals. The verdict logic had no branch for "the
discriminating test had no leverage" and fell through to the affirmative. Fixed: leverage is now
required and reported (`stepTestHadLeverage`), and the fallback route names itself as residual-shape
evidence. A per-thousand-bars figure is likewise suppressed with its reason rather than published as
−2,639 MB.

## For the Director

- The memory bar is now expressible in the units `UNIT-01` asks for: **~17 to 31 MB per closed
  trade**. At a declared 20 closes/hour that is 340 to 620 MB/h, which reconciles with the old
  headline without pretending hours were the driver.
- **Do not let tonight's ten-hour soak be graded against a linear extrapolation of 513 MB/h.** Per
  `FIT-01` that extrapolation is not available. The soak should be graded per closed trade with the
  trade rate held deliberately steady, or it will reproduce this same ambiguity for ten hours instead
  of four.
- `Delta 1` holds and is strengthened: trades cost memory, bars cost speed. S3 added the other half
  this morning — memory growth was **flat across 0/1/2 indicators** while per-bar CPU nearly tripled.
  Two monsters, two units, now measured from two directions.
