# REGIME-01 — every performance gate declares its bar count and trade count

**From:** Manager B
**Date:** 2026-08-01 02:00, **revised 02:40** with the Director's no-regression clause
**For:** D, E, A, C — anyone filing a performance gate
**Helpers:** `regime-stamp.mjs` (declaration, one import one call) · `regime-oracle.mjs` (pass/fail,
pure function) · `derive-noise-floor.mjs` and `margin-cost-table.mjs` (the arithmetic behind the
thresholds), all in `_evidence/manager-B/k4-window-claim/`
**Related rows:** LAG-ZT (zero-trade lag), MONSTER-2
**Needs a ruling:** the non-inferiority margin — defaulted to 10%, cost table below

---

## The requirement

**A performance gate is not readable without the regime it was measured in. Declare bars and trades, or
the gate cannot be reproduced, compared, or trusted to have failed for the reason it says.**

The single-sentence justification: C measured `_chartIndexForCloseMarkerOnChart` at **31.8% of a freeze**
on a 43-trade session; the same function takes **zero calls** in my zero-trade session. Two honest
measurements, two different workloads. A fix aimed at either regime **reads as a null result when it is
verified in the other**, and a null result is exactly how a real fix gets reverted.

This is not hypothetical bookkeeping — it already happened twice in one evening, in both directions:

| | C's regime | B's regime |
|---|---|---|
| `_chartIndexForCloseMarkerOnChart` | 31.8% of freeze | **0 calls** |
| `_resampleDataFull` | 2.2% of freeze | 8.5% of occupancy |
| bars / trades | 65,000 / 43 | 6,767 / **0** |

Each of us could have used the other's number to close our own defect, and each of us would have been
wrong.

## The stamp

Copy this into every gate artifact. `regime-stamp.mjs` emits it from a live page so nobody has to
assemble it by hand:

```
---------------- REGIME-01 DECLARATION ----------------
regime            ZERO-TRADE (LAG-ZT)  |  TRADE-BEARING (n)
trades            <count>  (which field it came from)
bars (resident)   <chart.data.length>   raw <n>   file <n>
timeframe         <tf>
indicators        <count>
speed nominal     <setting>
speed ACHIEVED    <events/s>        <- not the same thing as nominal
long tasks        <n>/s over <n> s
repeats           <n>
build             <build id>
rasteriser        <UNMASKED_RENDERER_WEBGL>
viewport          <WxH> @ dpr <n>
heap              <MB>
-------------------------------------------------------
```

Fields it cannot determine come back as **`UNKNOWN`**, deliberately. An omitted field reads as "not
applicable"; `UNKNOWN` reads as "nobody checked". Those are different claims and the difference has cost
us a day.

## Four fields that look like padding and are not

**`trades`** — the whole point. Zero is a *value*, not a missing field, and it is what makes a gate a
LAG-ZT gate.

**`bars (resident)`** — `chart.data.length`, not the file size. The file here holds 28,859 bars while a
replay may have 600 resident. The costs that scale track resident bars.

**`speed ACHIEVED`, separately from nominal** — this is the one people will want to drop, and it is the
one that has already produced a wrong answer. A derived 62.5 events/s put a mechanism at 27% of the
budget; the measured rate in the same nominal configuration is **7.87/s**. The nominal speed is what the
scheduler is *asked* for. The achieved rate is an **output of the system under measurement**, it differs
per host and per bar count, and it cannot be carried between configurations. If your gate converts a
per-event cost into a rate, this field *is* your conversion factor.

**`rasteriser`** — read, never assumed. I asserted a SwiftShader caveat across everyone's paint
conclusions; C read the string and found an RTX 4060. The canary host is software-rasterised, C's machine
is not, and a paint number without this field cannot be compared with either.

## REGIME-01, the acceptance bar
*(corrected 02:40 by the Director; my earlier reading was missing the no-regression clause)*

**A fix passes if it moves its declared regime and does not regress the other. Both arms measured, one
must improve, neither may worsen.**

The clause I had missed is the last one, and it is the one that catches the shape nobody would notice: a
fix that helps trade-heavy and quietly hurts zero-trade passes clean under my version. Both arms were
declared, one improved, and the damage rides along inside a "declared scope".

A fix that genuinely cannot move the other regime still passes — mine cannot touch marker resolution,
since my session calls it zero times — but it must now *show* the other arm holding, not merely note that
it was out of scope.

### And a fix passing is not the defect closing

These are separate events and the record must keep them separate:

| | passes when | recorded against |
|---|---|---|
| **a fix** | moves its declared regime, regresses neither | the fix |
| **a defect row** (LAG-ZT, trade-heavy) | *every* declared regime meets its bar, whichever fix got it there | the row |

So the marker fix can pass on its own merits tomorrow while LAG-ZT stays open, and nobody can read that
pass as "lag solved". Given LAG-ZT is currently a **flat ~330 ms/s floor with roughly 450 ms/s of
occupancy unattributed to any named mechanism**, that separation is doing real work: no fix now in flight
is aimed at the bulk of it.

### The clause needs a number, or it is not testable

"Neither may worsen" is a claim about a difference, and a difference means nothing without the spread of
the instrument measuring it. The saturation sweep gives that for free — eight windows, one unchanging
build, nothing under test:

| metric | mean | sd | cv | min–max |
|---|---|---|---|---|
| blocked ms/s | 303.3 | 22.1 | **7.3%** | 264.0–330.3 |
| occupancy ms/s | 714.0 | 51.6 | 7.2% | 649.5–780.5 |
| ms/event | 93.0 | 7.1 | 7.6% | 80.5–102.8 |

An unchanging build varies by **1.25x** run to run. The consequence, and it is the whole reason this
section exists:

**At n=1 per arm, nothing below ~21% is visible. A single-run no-regression check would wave through a
real 20% regression and report "did not worsen".**

Note which way the risk runs, because it is not symmetric. For the *improvement* half a noisy instrument
makes a fix harder to prove — annoying, but safe. For the *no-regression* half it makes a regression
easier to miss. The clause the Director added is precisely the half that noise attacks.

### Failing to detect a regression is not evidence there is none

This is the trap I fell into while implementing the clause, and it is worth naming because the naive
version looks correct. "No significant regression detected" is not "no regression". With a wide enough
interval it is automatic. Certifying that an arm held is a claim of *equivalence*, and it needs the
**upper bound** of the change to sit inside a stated margin — not merely the point estimate to look
flat.

The oracle therefore returns four states per arm, not three: `IMPROVED`, `REGRESSED`, `NO-REGRESSION
CERTIFIED`, and `NOT CERTIFIED` — the last meaning *we cannot tell, add repeats*. An under-powered run
lands on `NOT CERTIFIED` and fails, which is the correct outcome and the opposite of what my first
implementation did.

### The margin is a judgement, and here is its price

How much drift counts as "did not worsen" is the Director's to set. The cost in repeats, at cv 7.3%,
for a flat arm to certify:

| margin | repeats/arm | windows | wall clock | |
|---|---|---|---|---|
| 2% | 107 | 428 | 856 min | impractical |
| 5% | 18 | 72 | 144 min | expensive but possible |
| **10%** | **5** | **20** | **40 min** | **recommended** |
| 15% | 2 (floored to 3) | 12 | 24 min | weak |

**Recommendation: 10%**, defaulted in the oracle pending your ruling. It is the widest margin still
meaningfully tighter than the ~21% a single run silently allows, and it fits a 40-minute slot. A 5% bar
needs two and a half hours per fix and will be the first thing dropped on a release night; a 10% bar that
actually runs is worth more than a 5% bar that gets skipped.

**Minimum n=3 regardless**, since below that the run's own spread cannot be estimated at all.

### Running it

`_evidence/manager-B/k4-window-claim/regime-oracle.mjs` — a pure function, no page and no host, so any
harness can feed it numbers:

```js
import { verdict, printVerdict } from './regime-oracle.mjs';
printVerdict(verdict({
  zeroTrade:    { before: [...], after: [...] },   // n >= 5 for a 10% margin
  tradeBearing: { before: [...], after: [...] },
}, { declaredRegime: 'tradeBearing' }));
```

Sixteen tests in `regime-oracle.test.mjs`, the first of which is the exact case the Director described —
helps trade-heavy, quietly hurts zero-trade — asserted to **fail**. If that test ever passes, the clause
has become decorative.

## How to get the numbers without building anything

The authenticated route and a journal-bearing session are already proven and documented in
`HANDOFF-B-TO-D-AUTHENTICATED-ROUTE-IS-PROVEN-20260731-1830.md`:

- module `_evidence/manager-B/m20-j1/talaria-auth-route.mjs` — `login()`, `openBacktest()`
- **zero-trade regime:** session 936 / file 677 as it stands — 0 orders, confirmed by 0 calls to
  `_chartIndexForCloseMarkerOnChart` in 30 s
- **trade-bearing regime:** ask C for the 43-trade session; I have not stamped one myself and will not
  guess at its identifiers
- **bar count is settable:** `replaySystem.goToReplayTimestamp(startTs + bars*60000*1.04)` moves in both
  directions. `startReplayAtIndex()` **truncates** `rawData` and can only drive the position down — it
  silently lands short and a harness that does not assert the landing will invent its own x-axis. Mine
  did exactly that before I caught it.

## Standing rules that attach to this

Adopted from the falsifier, and they are the cheapest guards on this page:

- **No finding on n=1.** The bar-scaling finding I withdrew was a slope drawn through single runs.
- **Any claimed slope re-measures its low end last.** My 55 ms/s anchor at 579 bars was measured once,
  early, and never revisited; every later point was consistent with a flat floor. Re-measuring the low
  end at the end would have caught it at 17:20 instead of 02:15.

Both are now enforced rather than remembered: the oracle refuses a verdict below n=3, and the sweep
interleaves bar counts instead of walking them in order, so a drift over the run cannot masquerade as a
slope.

## What I owe against this myself

My own filed gates are not stamped to this standard, and I am not exempting the person who wrote the
requirement. Retro-stamping mine is on my list behind the 04:00 window. Two are already known to need it:
the MONSTER-2 bar-scaling finding, and the 87 ms definition — both were measured zero-trade without
saying so, which at the time I did not know was a distinguishing fact about them.

## Confidence

- [verified] the 31.8%-versus-zero-calls contrast, from C's filed profile and my own instrumented run.
- [measured] achieved 7.87 events/s against a nominal 10x, twice.
- [verified] `startReplayAtIndex` truncates `rawData`; `goToReplayTimestamp` does not — both observed.
- [verified] the acceptance bar as now written, quoted from the Director's correction. My earlier
  [inferred] reading was wrong in exactly the way flagged and is replaced above.
- [measured] cv 7.3% on blocked ms/s, 7.2% on occupancy, from 8 windows on an unchanging build.
  Derivation prints its own arithmetic: `derive-noise-floor.mjs`.
- [inferred] that this cv transfers to the trade-bearing arm. It was measured zero-trade, and a session
  doing marker work on every event may well be noisier. **The oracle already handles this**: it takes the
  larger of the run's observed spread and this floor, so a noisier arm is held to its own noise. But the
  repeat counts in the margin table are a floor, not a promise — the first trade-bearing gate should
  report its own cv so the table can be corrected.
- [inferred] the 10% margin recommendation. The arithmetic behind the trade-off is verified; where to sit
  on it is a judgement and I have only defaulted it, not decided it.
