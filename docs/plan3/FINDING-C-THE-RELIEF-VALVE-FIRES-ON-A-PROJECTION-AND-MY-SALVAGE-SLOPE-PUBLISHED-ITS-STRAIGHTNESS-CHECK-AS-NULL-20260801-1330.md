# FINDING — the relief valve fires on a projection, and my salvage slope published its straightness check as null

**C, 2026-08-01 13:30.** Two deliverables, one correction to my own published work found while building
the first.

---

## 1. RELIEF-01 would-fire analysis

`scripts/relief01-would-fire.mjs`. Post-hoc query, no machine time — the sealed soak already samples
cross-frame footprint every three minutes and records it per sample, so this is arithmetic over an
artifact.

The Director's correction is adopted exactly: fire on **projected breach**, not instantaneous level. An
85%-of-budget instantaneous trigger cannot coexist with "zero firings" as a pass condition, because a
build that exactly meets a 1,024 MB bar reaches 870 MB at hour 8.5 and every passing build fires.

### The correction underneath the correction

Firing on a projection means choosing which slope projects. The obvious choice — fit the run so far — is
wrong here, and I have already withdrawn a headline for the reason. Growth in **time** is concave on this
product: my +513.3 MB/h carried r² 0.981 **and** runs z −6.57, and a quadratic bought 76% more. It was a
chord across a curve. The bar delivery rate decays within a run (20.6 → 9.19 bars/s), which bends the
time axis while growth per bar stays comparatively straight.

A chord over-projects. Over-projection in a pressure valve means **firing on builds that pass** — the
Director's failure, reappearing one level down. So the firing statistic is the **settled trailing slope**
over the last 45 minutes, projected across the remaining hours from where the run currently stands. The
chord is computed and reported beside it so the gap is visible, and never used to fire.

On B6 the gap is real: chord 513.3 MB/h, settled 458.4 MB/h.

### The guard the controls forced me to add

A trailing slope that is **itself still falling** is not yet an estimate. A synthetic build landing at
1,000 MB — comfortably passing — projects ~2,000 MB at hour 2 off its own trailing slope, purely because
the slope has not settled. The valve fires on a passing build.

So firing additionally requires the trailing slope to hold ≥85% of its value window-on-window. While it is
still decaying, the answer is HELD with the reason recorded. The exception is a projection ≥4× budget,
where no plausible continued decay rescues the build and waiting only makes relief more expensive.

### Controls — because a valve that only ever fires is not a valve

`scripts/relief01-controls.mjs`, six synthetic series with known answers, run through the real CLI and the
real loader rather than a restatement of the logic. **6/6.**

| Control | Expected | Result |
|---|---|---|
| Tracks to 1,020 MB, linear | silent | no fire |
| Tracks to 1,500 MB, linear | fires early | FIRE at h=1.55 |
| **Concave, lands ~1,000 MB, early slope looks catastrophic** | **silent** | **no fire** |
| Concave, lands ~2,600 MB | fires | FIRE at h=1.55 |
| Lands exactly on 1,024 MB | silent | no fire |
| 8 samples, unfittable | must not pass quietly | VOID |

The first run of that suite scored **3/6** and every failure was a real defect:

- The stability guard was **inoperative at the first sample that could fire**, because no prior window
  existed yet and I treated "cannot establish stability" as trustworthy. The concave passing build fired.
- A build sitting exactly on its bar was a **coin flip** against noise. Firing now requires a 5% margin;
  a build inside measurement noise of the bar is not failed by a lucky draw.
- An unfittable series reported a quiet "would not fire" — **a silent pass**. It now VOIDs.

That last one was the second time in this file. The *first* version of the query passed `{x, y}` to a
fitter that consumes `{hours, value}`, so every projection was null, and it printed **"WOULD NOT FIRE"**
for a build that grew 2,154 MB in 3.78 hours. A pressure valve that fails open is worse than no valve.
It now VOIDs when it cannot compute, and VOID is not a pass.

### Against the one real failing build I have

B6, 58 samples, 3.78 h, 1,427.9 → 3,581.8 MB. **WOULD FIRE at hour 1.58**, projecting 6,153 MB at ten
hours against a 1,024 MB budget, lower bound 5,568 MB.

The query independently reproduces three numbers computed by a different tool on this series — chord
513.3 MB/h, runs z −6.57, quadratic gain 76% — which is the reason I trust the new statistic.

Note honestly: B6 had already consumed 118% of a ten-hour budget when it fired at 1.58 h. The valve fires
as early as its guards permit; B6 is simply a build that burns a ten-hour allowance inside ninety minutes.

---

## 2. CORRECTION — my salvage slope published its straightness check as null

Found while wiring the concavity test: `fitTrend` **never returned a runs statistic at all**.
`soak-salvage.mjs` reads `fit.runsZScore`, with a comment asserting the library publishes it. It does not.
Both salvage segments therefore published `runsZ: null` and `straightEnough: null` beside an r² — a fit
quoted without the check that decides whether it may be extrapolated.

With the statistic actually computed:

| Segment | MB/kbar (fit) | r² | runs z | straight? |
|---|---|---|---|---|
| 1 (clean, 4.0 h) | 25.35 CI[24.52, 26.17] | 0.981 | **−4.85** | **no** |
| 2 (contended) | 34.36 CI[31.05, 37.66] | 0.956 | **−3.04** | **no** |

**r² 0.981 with runs z −4.85 is the same signature as the +513.3 MB/h I withdrew** — which also read
r² 0.981. Both salvage segments are curved on the **bar** axis, so each fitted slope describes its own
window and must not be projected forward.

The magnitude agreement I published survives: 25.35 still sits beside 23.98 and 24.55, three measurements
around one number. What does not survive is the implication that all three are equally extrapolable. Only
the zero-trade monotonic run carries a straightness check it **passes** (runs z −0.04), and it is the one
to extrapolate from. The salvage figures are window-descriptive.

### Why only this caller was affected

`monotonic-bars-gate.mjs` and `soak-trade-correlation.mjs` each compute the runs test **inline** and were
never affected. Only the caller that trusted the shared library got nulls. Two of three consumers had
independently reimplemented around a gap in the common code, which is why the gap survived — the shared
library was the weakest link and the two loudest tools were routing past it. `fitTrend` now returns
`runsZScore`, `straightEnough`, `quadraticGain` and `extrapolable`; the fix is additive, and every existing
caller that already asked for the field now receives it.

---

## 3. For the record — the second primitive this week to pass review around its own core

The Director asked this be noted. `launchDetached` had a self-test covering `openRun`, fsync, heartbeat,
torn-line resume and segment boundaries — everything except **the launch**. It had never once worked.

The same shape appeared twice more today. `fitTrend` was tested and used everywhere, and never returned
the statistic two of its callers asked it for. And the first RELIEF-01 query ran end to end, wrote a
well-formed artifact, and printed a verdict computed entirely from nulls.

The common factor is not missing tests. It is tests that surround a function instead of interrogating its
output, and callers that read a field name without ever asserting the field exists. The countermeasure
that actually worked in all three cases was the same one: **feed it an input whose answer is known, and
require the answer.** The controls that caught three RELIEF-01 defects cost one file and five minutes.
