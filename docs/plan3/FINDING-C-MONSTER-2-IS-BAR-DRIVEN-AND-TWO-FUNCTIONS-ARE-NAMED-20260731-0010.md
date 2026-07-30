# FINDING (C) — Monster 2 is bar-driven, and the profile diff names two functions

**2026-07-31 00:10** · Manager C · answers the dispatch in `RULING-PO-ZERO-TRADE-RUN-PROVES-A-SECOND-MONSTER-AND-OUR-BEST-CUTS-ARE-INERT-20260730-2325.md` (ccfb4b6b8)
**tier=mid** · instrument `REPLAY-DECAY-HUNT-V1` + `DECAY-REGRADE-V1` · build read off the running page: **20260730b114**

## The answer to the one question

> Is per-tick cost flat, or does it grow with the number of bars already played?

**It grows.** Measured, not inferred:

| gauge | first five windows | last five windows | change | slope per 1,000 bars played | verdict |
| --- | --- | --- | --- | --- | --- |
| renderer CPU-ms per bar | 75.64 | 113.90 | **+50.6%** | **+3.46** CI [2.76, 4.16] | **CLIMBS** |
| throughput (bars/s, four panels) | 13.16 | 8.73 | **−33.7%** | −0.415 CI [−0.515, −0.314] | **FALLS** |
| renderer CPU supply | 99.42% | 99.32% | flat | — | BOUNDED |
| long-task ms per window | ~45,000 | ~50,000–65,000 | rising | +2,203 | CLIMBS |

The third row is what makes the first two mean something. **CPU supply was pinned at
99.4% for the entire run**, so falling throughput cannot be "less CPU was given to it" —
at fixed supply, fewer bars per second is arithmetically more cost per bar, with no
assumption about where the work happens. 38 windows across 7,377 → 19,059 bars (summed
over four panels). Confidence intervals exclude zero on both.

## The run reproduced the PO's configuration, including the zero-trade control

b114, four panels, four different symbols, four different timeframes, **two indicators
each** (not the harness's usual four), 60x, 20 minutes, and **zero trades** — the harness
was explicitly told not to place its usual order, and the control was then confirmed from
product state rather than from my own intent: `{open: 0, closed: 0, journal: 0}`.
All four panels advanced for the whole run (`advancing=4/4` in all 40 samples).

## The two named culprits

CPU profiles in the first two minutes and the last two minutes, diffed by **self** time
(1 kHz sampling, page main thread, 37,016 and 37,185 samples):

| function | first 2 min | last 2 min | change |
| --- | --- | --- | --- |
| `_m19iB62WindowFp` @ `chart-indicators-full.js` | 15.72% | **29.26%** | **+13.54 pp** |
| `m20Q6CapturedClear` @ `replay-system.js:9421` | 0.82% | **10.40%** | **+9.58 pp** (12.7x) |
| `(garbage collector)` | 1.64% | 3.33% | +1.69 pp |
| `_resampleDataFull` @ `chart.js:26503` | 2.04% | 3.33% | +1.29 pp |

Those two functions together went from **16.5% to 39.7%** of JS self time in twenty
minutes, in a session with no trades and no interaction. Both mechanisms are read from
the **deployed** files, and both are confirmed present in b114 by fetching them over
HTTP — not from my checkout, which differs by 5,335 bytes.

### Culprit 1 — the freshness fingerprint hashes the entire replayed history, on every paint

`drawIndicatorsOptimized()` → `_m19iExactTailPaint()` → `_m19iExactTailPaintFp()` →
`_m19iB62WindowFp(data, 0, totalLen)`.

`_m19iB62WindowFp` is an FNV-1a hash that, for every bar in the range, builds a
`t|o|h|l|c|v;` string and hashes **every character of it**. The range it is given at this
call site is `[0, totalLen)` — the whole history, not a tail. So one call costs O(bars
played), and it is paid **per paint, per panel**.

Two details make it worse than a slow function:

1. **The fingerprint is computed before the memo comparison.** At `replay-system`-adjacent
   line 11755 the code computes `var fp = this._m19iExactTailPaintFp()` and only then, at
   line 11774, compares `fp === this._m19iExactTailLastFp` to decide there is nothing to
   do. The memo prevents the *work*; it cannot prevent the *cost of deciding*. This is a
   cache whose key is more expensive than a cache miss.
2. **The function's own comment says it is bounded** — *"Cost is one bounded pass, the
   same order as the pack the post already performs"* — and it is, for the tail-window
   call sites that pass a real `tailStart`. The two call sites that pass `0`
   (`_indicatorAsyncDataToken` and `_m19iExactTailPaintFp`) are where the intent was lost.
   Both are present in deployed b114.

**A kill-switch already exists**: `window.__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1`
gates the whole path (`_m19iExactTailPaintEnabled()`). It disables a freshness guard as
well as the cost, so it is an A/B probe, not the fix. **The fix is to pass a bounded
`tailStart` instead of `0` at those two call sites**, which keeps the guard and removes
the history-length term.

### Culprit 2 — an unbounded scheduler ledger, scanned linearly on every timer clear

`m20Q6TrackScheduler` pushes one entry into `state.schedulers` for **every**
`setTimeout`, `setInterval`, `requestAnimationFrame` and `queueMicrotask` call made inside
a capture session, and entries are never removed — completion only sets
`entry.pending = false`. `m20Q6CapturedClear` then does this on every `clearTimeout`,
`clearInterval` and `cancelAnimationFrame`:

```js
for (const entry of state.schedulers) {
    if (entry.scope === scope && entry.schedulerKind === kind && entry.handle === handle) {
```

A full linear scan of a list that only ever grows. N registrations, each cleared with an
O(N) scan, is O(N²) in elapsed frames. At 60x with four panels the rAF traffic alone
pushes thousands of entries per minute.

I checked three things before naming it, because a growing wrapper looks exactly like an
instrument artefact:

- **It is product code, not a harness.** `M20Q6ReplaySystem` is the shipped replay class
  and its effect methods are wrapped unconditionally at module load
  (`m20Q6CapturedReplayEffect`), which is what opens the capture sessions.
- **It is in the deployed file.** `m20Q6CapturedClear`, the push, and the linear scan are
  all present in the b114 `replay-system.js` served over HTTP.
- **Nothing ever prunes the list.** Zero occurrences of any truncation of
  `state.schedulers` in the deployed file. `m20Q6DrainState` walks it once, at destroy.

**There is no kill-switch for this path.** Zero `__TALARIA_*M20Q6*` flags exist in the
deployed file, so per `KILL-03` A must add one with the cut. The cut itself is small: the
scan wants a Map keyed by handle, or removal of settled entries.

## Why this is the PO's curve and not the element leak

Per-bar cost rising linearly means cumulative cost rising quadratically and effective
speed falling as its inverse — 60x sagging toward 2x, then a main thread that cannot
finish a tick inside its budget, then a tab that stops answering. The PO reported exactly
that shape with **zero trades**, and the element leak I named at 22:33 is priced per
closed trade, so it contributed nothing here. Two monsters, as the Director separated
them.

## What this run does NOT show, stated plainly

- **I did not reproduce the PO's 30x collapse; I measured 1.5x.** My headless session was
  CPU-saturated at 99.4% from the very first sample, where the PO's run "started
  acceptable". Starting inside saturation compresses the visible decay. The direction, the
  slope, the pinned-supply arithmetic and the named functions all hold; the *magnitude* of
  the user-visible collapse does not transfer from this run, and I am not quoting one.
- **`tickMs` never read.** I wrapped `stepForward` in all four realms and it was never
  called during playback, so I have no per-call timing from inside the product's advance
  path. The per-bar cost above is therefore *derived* (renderer CPU ÷ bars advanced), and
  it is whole-process CPU across all threads. The instrument recorded this gap in its own
  output rather than reporting a confident zero. Naming the real advance function is
  carried as an open item.
- **The profile is JS only**, main thread of the page target, 1 kHz. Non-JS work appears
  only as `(program)` and `(garbage collector)` pseudo-frames, which are reported above
  rather than hidden. `getBoundingClientRect` at 8.18% in the first profile is a layout
  cost the JS profiler attributes to its caller.
- **n=1 run.** The slopes carry CIs within the run, but there is one run.

## GATE-01

Before the instrument was pointed at the product it was shown to be capable of being
wrong: an offline self-test plants a tick whose cost grows with bars played and a control
tick whose cost is constant. The growing arm read **+0.083 ms per 1,000 bars, CI [0.076,
0.090], CLIMBS**; the constant arm read **−0.003, CI [−0.008, 0.002]**, not climbing.
GATE-01 **PASS**. The self-test also caught a reporting defect first time through — a
per-bar x-axis rounded every real slope to `0`, which is why every slope in this finding
is quoted per 1,000 bars.

## For A, in priority order

1. `_m19iB62WindowFp(data, 0, len)` at `_m19iExactTailPaintFp` and
   `_indicatorAsyncDataToken`: bound the window. Existing flag
   `__TALARIA_DISABLE_M19I_EXACT_TAIL_PAINT_V1` A/Bs the whole path tonight.
   Predicted effect: removes the history-length term from per-paint cost, so the
   CPU-ms-per-bar slope should collapse toward zero. It is 29.26% of self time by the end
   of twenty minutes and still climbing.
2. `m20Q6CapturedClear` / `m20Q6TrackScheduler` in `replay-system.js`: the ledger needs
   pruning or a handle-keyed Map, **and it needs a kill-switch, which does not exist
   today**. Predicted effect: removes a quadratic term; 10.4% of self time by minute 20,
   0.82% at minute 2, so its share grows fastest of anything in the profile.

Both are reachable under CONF-01 by construction — they were measured *in* it (`CONF-03`).

## Artifacts

- `_evidence\manager-C\REPLAY-DECAY-HUNT-V1-20260730-2340.json` — 40 samples, both profiles
- `_evidence\manager-C\DECAY-REGRADE-V1-20260731-0005.json` — per-bar cost series and fits
- `scripts\replay-decay-hunt.mjs`, `scripts\decay-regrade.mjs`, `scripts\indicator-fp-probe.mjs`
