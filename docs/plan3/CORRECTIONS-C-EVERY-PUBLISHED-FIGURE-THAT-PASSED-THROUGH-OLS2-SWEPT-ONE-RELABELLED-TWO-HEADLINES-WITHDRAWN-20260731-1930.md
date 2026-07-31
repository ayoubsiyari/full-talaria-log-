# CORRECTIONS C — every published figure that passed through `ols2`, swept. **Nine numbers checked: seven stand unchanged, one artifact field is mislabelled and will be relabelled offline, and two MB/h headlines are withdrawn as unit-unsafe.** No number I have published is numerically wrong.

**2026-07-31 19:30** · Manager C · ordered by the Director at 19:14, ahead of everything else because it is upstream of published numbers
**Method: every `ols2` call site read, its actual predictors identified, and every figure I published from it traced back to which coefficient it used.**

## The defect, stated precisely

`ols2(y, x1, x2)` returned its coefficients under the names **`perHour`** and **`perClosedTrade`** — the predictors of the *first* caller, baked into a shared library. The function cannot know what it was passed. **So a caller passing bars as `x1` reads a per-bar coefficient from a field called `perHour`.**

**The important distinction for this sweep: this is a naming hazard, not an arithmetic one.** `b1` is always the coefficient of whatever `x1` was. So the risk is entirely in **labelling** — a right number under a wrong unit — which is why every published figure needed its predictors traced rather than its arithmetic rechecked.

## All five call sites, with what they actually pass

| site | `x1` | `x2` | field read | correct? |
| --- | --- | --- | --- | --- |
| `soak-trade-correlation.mjs:207` footprint | hours | closed trades | `perHour`, `perClosedTrade` | **yes** — names match predictors |
| `:208` renderer | hours | closed trades | same | **yes** |
| `:209` elements | hours | closed trades | same | **yes** |
| `:61` quadratic | x | **x²** | `perClosedTrade` as the x² term | **value yes, name no** — documented in a comment at `:68`, and only its SIGN is used |
| `bend-soak.mjs:418` | **thousands of bars** | closed trades | `perHour` labelled "MB per thousand bars" in the prose | **prose yes, artifact field no** |
| `soak-per-kbar-grade.mjs:70` | thousands of bars | closed trades | `perX1`/`perX2` | **yes** — written after the fix |

## The nine published figures, one by one

| # | figure | provenance | verdict |
| --- | --- | --- | --- |
| 1 | **+16.61 MB per closed trade**, CI [11.81, 21.42], hours held | `ols2(foot, hours, closed)` → `b2` | **STANDS** — `x2` genuinely was closed trades |
| 2 | The companion per-hour term from that same fit | same fit → `b1` | **STANDS** — `x1` genuinely was hours |
| 3 | **+27.79 elements per closed trade**, CI [26.1, 29.4] | `ols2(elems, hours, closed)` → `b2` | **STANDS** |
| 4 | Renderer two-driver fit | `ols2(rend, hours, closed)` | **STANDS** |
| 5 | **CONCAVE** verdict on +513.3 MB/h, "a quadratic buys 76% more" | `quadGain` from residual sums; direction from the x² coefficient read via `perClosedTrade` | **STANDS** — the extraction was correct and deliberate, with a comment saying so. Only the sign was used, never the magnitude, and it was never published as a per-trade quantity |
| 6 | **+1,392 excursion samples per closed trade**, CI [1335, 1450] | `conf01-duration-gate.mjs`, single-predictor — **never touched `ols2`** | **OUT OF SCOPE, STANDS.** Still open on me for the 4.4× reconciliation against ~318, which is a separate question |
| 7 | **24.55 MB per thousand resident bars**, CI [22.25, 27.50] | single-predictor OLS in `soak-per-kbar-grade.mjs` | **STANDS** |
| 8 | **−49.7 MB per closed trade** | `ols2` with bars as `x1` | **ALREADY SUPPRESSED** before publication, at variance inflation 60.9 |
| 9 | Arm 1's forthcoming `twoDriverFit` block | `bend-soak.mjs:418` | **WILL BE MISLABELLED IN THE ARTIFACT** — see below |

**Nothing I have published is numerically wrong, and nothing needs retracting for arithmetic.** The reason is narrow and worth stating rather than taking credit for: every published two-driver figure came from the one call site whose predictors happened to match the library's field names.

## The one live exposure, and it is in a file being written right now

`bend-soak.mjs:418` passes **thousands of bars** as `x1`. Its prose label is correct — the reading string says "MB per thousand bars" — but the **artifact field is called `perHour`**. Arm 1 is running the pre-fix code, so **when it ends at ~04:15 its artifact will contain `twoDriverFit.perHour` holding a per-thousand-bars coefficient.** Anyone reading that JSON without the prose would read a per-bar cost as an hourly rate.

**Two actions, both taken:**

1. **The code is fixed for arm 2**: the fit now publishes `perThousandBars` and `perClosedTradeMB` with an explicit `predictorNames` block, and `perHour` is deleted from the output so it cannot be read at all. The same edit adds the variance-inflation suppression, so arm 2 cannot publish an unidentified split the way arm 1 would have.
2. **Arm 1's artifact will be relabelled offline the moment it closes**, with the correction noted in the artifact itself. It is on my queue and it is not optional.

## Two MB/h headlines withdrawn, which is the deeper half of the Director's point

The Director's concern was the *class* of error, and the class is larger than `ols2`. **A rate quoted per hour is per-bar cost times whatever bar rate the engine delivered** — and delivered rate is not a constant, falling from 20.6 to 9.19 bars/sec as bars accumulate.

| figure | status |
| --- | --- |
| **+513.3 MB/h**, CI [494, 532] | **WITHDRAWN AS A HEADLINE.** Already caveated as a chord across a concave curve; now also unit-unsafe. Its run's bar axis was non-monotonic, so it **cannot be converted** to per-thousand-bars — it is not recoverable, only replaceable. The clean replacements exist: **23.98 MB/kbar** (zero trades) and **24.55** (with trades) |
| **1,084 MB/h from bars vs 332 MB/h from trades** | **RATIO STANDS, MB/h FORM WITHDRAWN.** It was derived as 23.98 × 45.2 kbar/h and 16.61 × 20 closes/h with both rates declared, so it never breached `UNIT-01` — but the ~3:1 conclusion should be quoted from the per-unit figures, because the MB/h pair moves with a bar rate the product controls |
| **54 MB/min** (S3) vs **8.6 MB/min** (B6) | Already flagged as one curve read at two windows. **Now resolved into the driver's unit** rather than left as a warning |

## What is now enforced in the tool rather than in a rule

- `ols2` exposes **`perX1`/`perX2`** with the legacy names retained for its three existing callers, and a comment naming the hazard at the return statement.
- `bend-soak` publishes `perThousandBars`/`perClosedTradeMB` plus `predictorNames`, and **deletes** `perHour` from its output.
- Every hourly bucket now carries `barsDelivered`, `deliveredBarsPerSec` and `localMBPerThousandBars`, so **an MB/h figure cannot be lifted out of my artifacts without the rate that produced it.**

The general lesson, which is not really about statistics: **a shared library that names its outputs after its first caller's variables will silently mislabel every later caller.** The fix is that a function which does not know its inputs must not name its outputs.
