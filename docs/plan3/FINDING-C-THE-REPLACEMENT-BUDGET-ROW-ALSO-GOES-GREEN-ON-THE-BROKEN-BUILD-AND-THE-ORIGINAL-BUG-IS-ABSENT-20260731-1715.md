# FINDING C — Both gauges built and run. The original bug is absent. But the replacement `BUDGET-01` row goes green on the broken build too, for the same reason the first one did.

**2026-07-31 17:15** · Manager C · build **b120** · `PERM-GAUGES-20260731.json` (signature `PERM-GAUGES-V1`, filename checked)
**bfcache state: ENABLED (Chrome default), not under test in either gauge, declared per `RESET-01`.**

Two gauges ordered before the ten hours. Both are built, both ran, and both are in the permanent set under
`PERM-01`. One of them came back with a result about the budget row itself.

## Gauge 2 first, because it is clean: the original bug is absent

Panned the **1h** panel with a synthetic canvas drag and read the **1m** peer's price axis before and after.

| check | reading |
| --- | --- |
| realms with charts | 4, timeframes **1h / 15m / 5m / 1m** |
| the pan actually moved the 1h panel | **true** — verified, not assumed |
| peer price fields changed | **none** |
| grading applied | chosen by whether the peer's own window moved |

**GREEN. The original bug is not back.**

Two details that decide whether this gate means anything:

**It verifies the pan happened.** `panActuallyMovedHigherTf` is recorded, and if the drag had not moved the
1h panel the gate returns **VOID, not green**. A regression test that passes because the action silently
failed is worse than no test, and this defect shipped once already.

**It picks its grading from the data rather than assuming one.** `engine-api-guards.js` already handles the
subtlety that after a legitimate visible-range sync a peer re-fits its *own* price axis, so min/max may drift
but `autoScale` must stay TRUE. Whether that allowance applies depends on whether the peer's window actually
moved. So the gauge reads the peer's `visibleStartIndex` and chooses: **if the peer never moved it grades
strictly**, because a peer with no newly-visible candles has nothing to legitimately re-fit to and any price
change is contamination. It ran twice and hit both cases — first run the 1m peer held at 1958–2033 and was
graded strictly, second run its window moved and it was graded under `visibleRange` semantics. **Clean under
both.**

I did not reinvent this check. The field names and the mode distinction are lifted from the shipped
`engine-api-guards.js`, per the 14:25 ruling.

## Gauge 1: the number is real, host-dominated, and it is **zero** on a static dataset

Host-realm paints/sec at 1x, replay armed and **paused**, dataset confirmed static (zero panels advanced):

| condition | host paints/sec | host share of all painting |
| --- | ---: | ---: |
| **1x, static dataset** | **0.0** across 4 windows / 24 s | — (nothing painted anywhere) |
| **1x, playing** | **140.8** | **95.9%** |

The playing arm reproduces S1's 141.7/s and 92% host share on an independently written counter. **So the
141 is real and it is ~96% host-side, exactly as the 14:00 ruling concluded.**

### The counter is validated, and that is why the zero is a finding rather than a silence

My first negative control forced `chart.render()` and watched the counter rise. **That is circular** — it
proves my wrapper increments, not that the counter sees the product's own loop. A gauge that reads zero
because it is attached to the wrong function is indistinguishable from a healthy product, which is the
failure `VER-07` exists to prevent.

So the real control is the playing arm: **the same counter, same wrapper, same realm, reads 140.8/s the
moment playback resumes.** The instrument sees the natural loop. **The zero is a measurement of the product.**

## The consequence, and it is the reason I am writing this before the soak finishes

`BUDGET-01` now carries **"Host-realm paints/sec at 1x, static dataset — measured ~131 — ceiling: paints only
on change."**

**The measured value and the stated condition come from different runs.** The ~131 was measured at 1x *while
playing*. Under the condition the row actually states, **the unfixed build scores 0.0 and the row goes
GREEN.**

That is the same failure that retired the paints-per-candle row, arriving from the other direction. The first
row was gameable because the product controlled its *denominator*; this one is gameable because the product
already satisfies its *condition*. In both cases a broken build passes without a fix.

**The defect lives in the playing path.** The host does not paint at frame rate when idle — pausing takes it
to exactly zero. It paints ~141 times a second *while replaying at one candle per second*, which is still
more than twice what a 60 Hz display can show, and it is still ~96% host-side and still decoupled from bar
advance. That is the defect, and it is untouched by Phase 4 because the host survives the realm collapse.

### The row I recommend

| gauge | measured on b120 | ceiling |
| --- | --- | --- |
| **Host-realm paints/sec at 1x while PLAYING** | **140.8** (96% host share) | **paints only on change** |
| Host-realm paints/sec at 1x, static dataset | **0.0** | **lock at 0** |

Two rows, not one. The playing row is where the defect is and it cannot be gamed by running faster, because
the speed is pinned at 1x by the gate. The static row is already healthy, and per the Director's own
principle that a budget watching only what is currently broken will not notice healthy things breaking, it
gets **locked** rather than dropped.

**One consequence for A:** `L1` opened at 19:00 as "host paints/sec at 1x on a static dataset". Aimed at the
static condition it is already green and there is nothing to fix. The live target is the playing path.

## Also corrected in place

`FINDING-C-THE-SPEED-CURVE...-1140.md` finding 3 no longer leads with paints-per-candle. The withdrawal, the
arithmetic showing the ratio collapses to the paint rate, the agreement with A's harness figure at 60x, and
the restatement in host paints/sec are written into the document, along with the withdrawal of my own
suggested fix — "cap paints to one per advanced bar" aimed at the per-bar render path, which A's coalescing
through `_scheduleCandlePlaybackPaint` already handles correctly and which must not be touched.

## Status of the ten hours

Launched 17:14 on b120, ten-hour budget, with the four RESET-01 exit runs appended (reload, logout in both
bfcache arms, tab close). It runs in **segments**: the browser has died three times today near 1.38 GB with
exit code 1, and that is what ended the previous ten-hour attempt at ten minutes. Each death is recorded and
a fresh segment starts. **The restart count is a headline about the ceiling, not an embarrassment to hide**,
and the summary declares the longest *continuous* stretch separately from accumulated time, because `DUR-01`
is satisfied by the former and not the latter.
