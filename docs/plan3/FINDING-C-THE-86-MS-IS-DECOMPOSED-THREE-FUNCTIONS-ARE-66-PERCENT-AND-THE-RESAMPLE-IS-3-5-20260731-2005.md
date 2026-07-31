# FINDING C — The per-event cost is decomposed at last. **87% is scripting, 0.6% is painting, 0% is layout** — and three named functions carry **66.2%** of the host realm's main thread. **A's resample is 3.5%.** One of the three is a marker index lookup whose cost is trades × bars, which is a mechanism nobody has proposed.

**2026-07-31 20:05** · Manager C · `LIVE-TRACE-TIMELINE-20260731.json`, `LIVE-PROFILE-HOSTREALM-20260731.json`
**Read-only against the running soak at ~63,000 resident bars and 43 closed trades. The soak survived all four attaches and is still running.**
**bfcache: default/enabled. Declared per `RESET-01`.**

## The category decomposition, which is what was ordered

A 3-second `devtools.timeline` trace, outermost events only on the busiest `CrRendererMain`:

| category | ms of 2,978.9 | share | per data event |
| --- | --- | --- | --- |
| **scripting** | **2,597.4** | **87.2%** | 185.5 ms |
| other | 362.4 | 12.2% | 25.9 ms |
| **painting** | **19.0** | **0.6%** | 1.4 ms |
| gc | 0.0 | 0.0% | 0 |
| **layout** | **0.1** | **0.0%** | 0 |
| rendering (style) | 0.0 | 0.0% | 0 |

Main thread busy **90.8% of wall**. Top timeline events: `FireAnimationFrame` **69.8%**, `TimerFire` 14.3%, `HandlePostMessage` 11.4%.

**So the cost is JavaScript running inside `requestAnimationFrame`. It is not paint, not layout, not style, not GC.** Every one of those was a live hypothesis this morning and all four are now bounded below 1%.

## The three functions, named

A 1 ms sampling profiler on the host realm, self time aggregated across call paths:

| function | file:line | self | callers |
| --- | --- | --- | --- |
| **`_chartIndexForCloseMarkerOnChart`** | `order-manager.js:42043` | **24.1%** (1,826 ms) | `_chartIndexForEntryMarkerOnChart:42286` (50%), `_chartIndexForExitMarkerOnChart:42224` (50%) |
| **`_m19iB62WindowFp`** | `chart-indicators-full.js:10526` | **23.8%** (1,806 ms) | `_m19iExactTailPaintFp:11767` (48%), **`_indicatorAsyncDataToken:10292` (27%)**, **`_indicatorAsyncTokenMatches:10318` (25%)** |
| **`m20Q6CapturedClear`** | `replay-system.js:9800` | **18.3%** (1,390 ms) | **`replay-dashboard-sync.js:10` (43%)**, **`economic-news-sidebar.js:1504` (41%)**, `updateChartData:4202` (17%) |
| (garbage collector) | — | 6.4% | — |
| **`_resampleDataFull`** | `chart.js:26504` | **3.5%** (267 ms) | `resampleData:26496` (52%), `getResampledSeries:70` (48%) |
| `getBoundingClientRect` | — | 2.2% | `_isMultichartPanelVisibleForPaint` (100%) |

**Three functions are 66.2% of the main thread.**

## What each one means, and one is a mechanism nobody has proposed

**1. `_chartIndexForCloseMarkerOnChart` — 24.1%, and its cost is trades × bars.** Both callers are marker index lookups, for entry and exit markers. This is a per-marker search into the bar array, and there are two markers per closed trade. **The run has 43 closed trades and ~63,000 resident bars.** That product is the shape: more trades means more lookups, and each lookup works against a longer array. **This links Monster 1 and Monster 2** — the trade-driven defect and the bar-driven one may be the same function billed twice.

**It also reconciles B cleanly.** B measured cost per event FLAT over 1,930–6,242 bars; a trades × bars term is nearly invisible with few bars and few trades, and dominant at 63,000 and 43. Neither of us was wrong.

**It is falsifiable in a run already scheduled and costs nothing extra: the zero-trade `CONF-05` arm should show this function at or near zero self time.** If it does not, my reading of it is wrong. I will run the same profile against arm 2 and report either way.

**2. `_m19iB62WindowFp` — 23.8%, and half of it is cache bookkeeping.** Only 48% comes from the paint path. **27% comes from `_indicatorAsyncDataToken` and 25% from `_indicatorAsyncTokenMatches`** — a fingerprint computed over a data window to decide whether an async indicator result is still valid. **So roughly 12% of the entire main thread is spent deciding whether a cached indicator result can be reused**, which is the same anti-pattern A found in the resample cache: paying bookkeeping and not getting the benefit.

**3. `m20Q6CapturedClear` — 18.3%, and two of its three callers are not the chart.** 43% comes from `replay-dashboard-sync.js` and 41% from `economic-news-sidebar.js`. **A news sidebar and a dashboard sync are together driving 15% of the main thread during replay.** This is the m20Q6 ledger, which I already have on the record as needing a kill-switch because **zero `__TALARIA_*M20Q6*` identifiers exist in the deployed file** — so there is currently no flag to turn it off with.

## The finding the Director's framing predicted

**Six candidates were eliminated, five of them by reading source, and the mechanism that was named is 3.5% of the main thread.** `_resampleDataFull` is real, it is reached from `getResampledSeries` exactly as A described, and the cache does miss — and it accounts for **267 ms of 7,591**. A day of subtracting small quantities from an undecomposed number found small quantities.

**Nothing in the eliminated set is in the top three. Nothing in the top three had been proposed.**

## Caveats, stated because they bound what A should act on

- **Host realm only.** The profiler ran on the host, which carries 97.7% of resident bars, so it is the realm that matters — but the three iframe realms are not in this profile.
- **Self time, not total time.** These are the functions burning cycles, not necessarily the ones responsible for calling them.
- **Instrument overhead inflates the absolute figures.** The trace reports 136–213 ms per data event against the 86 ms measured without one. **The proportions are the output here, not the milliseconds.**
- **Measured deep into a soak** — 63,000 bars, 43 trades, 2.2 hours. The mix at first paint will differ, and the trades × bars term specifically will be far smaller early.
- **One trace, one profile.** Not a distribution. A second profile at a different point in the run would say whether the mix is stable, and arm 2 gives it for free.

## Risk taken and how it went

Four read-only attaches during a committed ten-hour run: two 3-second traces, one 5-second profile, one background memory dump. `browser.disconnect()` every time, never `close()`. **The soak survived all four**, `pid 29112` alive with bars strictly monotonic. The trace window timestamps are recorded in each artifact so any overlapping sample can be annotated rather than silently graded. **My first trace was still a wasted attach** — I included the `toplevel` category, whose `RunTask` wrappers absorbed 99.9% of the time and decomposed nothing.
