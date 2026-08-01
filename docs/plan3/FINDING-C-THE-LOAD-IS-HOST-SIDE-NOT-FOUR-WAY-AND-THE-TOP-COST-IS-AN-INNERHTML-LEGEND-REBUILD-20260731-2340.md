# FINDING C — the load is host-side, not four-way, and the largest single cost is an innerHTML legend rebuild

**31 Jul 2026, 23:40. Build 20260731b120. Host: ANGLE (NVIDIA RTX 4060 Laptop, D3D11) — hardware rasterised,
verified on two routes. bfcache: default (enabled), read-only attach, no navigation.**

Ordered sequence executed: nonce check, then long-animation-frame, then the reconfigured trace. The cheap
instruments pre-answered enough that the expensive one became confirmation, which is what they were for.

---

## 1. The bfcache gate CLEARS. Reset numbers are not fiction.

`BFCACHE-NONCE-CHECK-20260731.json`. Marker set on a chart-bearing `/chart/` document, F5, re-read:

| signal | before | after | meaning |
|---|---|---|---|
| `window.__C_NONCE` | set | **gone** | a JS global cannot survive a real navigation |
| `performance.timeOrigin` | 1785532297090.3 | **1785532351396.6** | a NEW document exists |
| sessionStorage marker | 1 | **1** (survived) | same tab, same session — the control |
| navigation type | `navigate` | **`reload`** | the browser agrees |

F5 genuinely replaces the document. Every reset measurement taken across a reload compares two documents, and
the RESET-01 reload arm's return axis stands.

Two things worth recording from the run. First, my control was mis-specified: I expected the sessionStorage
counter to *increment*, but nothing on the page increments it — persistence is the pass, and the original
grading would have suppressed a valid result as INCONCLUSIVE. Second, a bare navigation to `/chart/` after
login produced a document with **no chart at all**, independently reproducing the open `reentry-no-chart`
defect on a second instrument; the test was re-run through a full CONF-01 boot to get a real chart.

---

## 2. Long-animation-frame: 98.8% JavaScript, and a forced-reflow cost nothing had shown

`LOAF-LIVE-20260731.json`, 7 minutes, 4,115 bars, 3,504 long animation frames, 851.7 ms/s total.

**The phase names matter and the obvious ones are wrong.** The interval `renderStart → styleAndLayoutStart` is
where `requestAnimationFrame` callbacks run. It is author JavaScript, not paint. Labelled naively this reads
"41.8% rendering" on a page whose real style-and-layout cost is 1.2%, and it would have contradicted my own
trace decomposition for no reason.

| phase | ms/s | share | what it actually is |
|---|---|---|---|
| script before render | 485.8 | 57.0% | tasks, events, timers |
| rendering-phase callbacks | 355.8 | 41.8% | **rAF callbacks — JavaScript** |
| style and layout | 10.1 | **1.2%** | the only real rendering cost |

Read correctly that is **98.8% JavaScript**, which agrees with the trace's 87% scripting instead of contradicting
it. New number: **forced synchronous reflow inside scripts is 65.7 ms/s, 13.5% of script time** — a cost no
category split had ever shown, and section 3 names who forces it.

By invoker, which is where LoAF earns its keep:

| invoker | ms/s |
|---|---|
| FrameRequestCallback | 332.8 |
| **Response.json.then** | **178.7** |
| Worker.onmessage | 141.9 |
| **Window.fetch.then** | **102.0** |
| MessagePort.onmessage | 21.3 |

**280.7 ms/s — a third of all animation-frame time — is fetch/JSON continuations.** That is network response
handling during replay, and it is a mechanism none of my previous decompositions had isolated.

---

## 3. THE ORDERED ANSWER: the load is host-side. It does not split four ways.

`FRAME-TRACE-SOAK-20260731.json`. All six mandatory settings present and asserted, not hoped for:
per-frame attribution ✓, JS sampling ✓ (32,782 samples @ 200 µs), rasteriser ✓, build stamp `20260731b120` ✓,
panel count 4 ✓, replay engaged ✓. Calibration 707.2 ms/s unthresholded (physically possible), 294.4 ms/s
blocking.

| frame | ms/s | share of attributed | resident bars |
|---|---|---|---|
| **host document** | **377.4** | **84.8%** | **24,683** |
| panel B (5m) | 32.3 | 7.3% | 1,596 |
| panel C (15m) | 19.8 | 4.4% | 1,911 |
| panel D (1h) | 15.8 | 3.5% | 495 |
| *(unattributed)* | *263.0* | *— 37.1% of thread* | — |

**The hypothesis that four serial `chart.render()` calls each carry a quarter of the load is dead.** The three
panel iframes together carry 67.9 ms/s — under a tenth of the thread. The host carries between **53.3%** (if
none of the unattributed work is host-side) and **84.8%** (of attributed work only); LoAF independently reads
64% self / 36% descendant on the same page. Two instruments, one direction, no even split.

The reason is in the same table: **the host holds 24,683 of 28,685 resident bars (86%)**. Cost tracks bars, and
the host has the bars. `applyMultichartMirrorFrame → _finishMultichartMirrorRender` is cheap here not because
serial rendering is cheap but because the panels it renders are nearly empty.

I am publishing the unattributed bucket rather than choosing a denominator quietly: 263 ms/s, 37.1% of the
thread, of which **RunMicrotasks is 181.8** — promise continuations declare no frame. LoAF says those
continuations are `Response.json.then` and `Window.fetch.then`, so the two instruments corroborate each other
on the piece the trace cannot attribute.

---

## 4. Named writers, with call sites. This is the actionable part.

Aggregated by **function identity, not profile node id** — V8 emits one node per call path, so the top function
first read 3.8% when it was really 14.9%, understated fourfold.

**`set innerHTML` — 18.5% of the main thread, the single largest cost.**
- 46% ← `talariaAppendIndicatorLegendRow` (indicator-ui.js:2968) ← `talariaRebuildOhlcIndicatorLegend`
  (indicator-ui.js:3145) ← `Chart.updateOHLCIndicators` (indicator-ui.js:6496)
- 28% ← same appender ← `Chart.updateOHLCIndicators` ← `runReplayPlayIndicatorPass`
  (chart-indicators-full.js:11401) ← `Chart.scheduleReplayIndicatorRecalc` (chart-indicators-full.js:11352)
- 7% ← `talariaFillLegendLoadingDots` (indicator-ui.js:2849) ← `talariaSyncOhlcIndicatorLegendValues`

**The indicator legend — a few rows of text — is rebuilt with `innerHTML` on every replay indicator pass.**

**`_m19iB62WindowFp` (chart-indicators-full.js:10526) — 11.8%.** 54% from `_m19iExactTailPaintFp` ←
`drawIndicatorsOptimized` ← `render`; **45% is cache-validity fingerprinting** (`_indicatorAsyncTokenMatches`
23% + `_indicatorAsyncDataToken` 22%), confirming the earlier "half is fingerprinting" reading precisely.

**`m20Q6CapturedClear` (replay-system.js:9800) — 11.8%.** 45% ← `replay-dashboard-sync.js:10`, 44% ←
`economic-news-sidebar.js:1504`, both via `dispatchEvent` ← `_dispatchReplayVirtualTimeChanged` ←
`updateTimeDisplay`. That is 89% from two non-chart listeners on every clock update — matching the 84% measured
independently this afternoon.

**`getBoundingClientRect` — 4.1%, and this is the forced reflow.** 95% ← `_isMultichartPanelVisibleForPaint`
(chart.js:3046) ← `_shouldSkipMultichartBackgroundRender` (chart.js:3094) ← `render`. **The optimisation that
decides whether to skip a background render forces a synchronous layout every time it asks.**

`_chartIndexForCloseMarkerOnChart` is 4.7% here against 31.8% inside this afternoon's freeze — consistent with
its cost being trades × bars, measured at fewer of both. The falsifiable prediction stands.

---

## 5. Instrument innocence: the named mechanism is absent, my retrospective control was degenerate

`SAMPLING-INNOCENCE-20260731.json`. Code audit first, free: **zero `evaluateHandle`, zero
`Runtime.queryObjects`, zero raw `Runtime.evaluate`** — the three ways to retain a remote object handle. All 214
sampling sites use `page.evaluate`, which returns by value and releases. `Network.enable` is never called, so
no response bodies are buffered. No console listeners, so puppeteer holds no `ConsoleMessage` handles. Caveat:
`Debugger.enable` (which pins parsed scripts) is used by `baseline-census`, **not** by the soak.

I then tried to satisfy the control retrospectively from two arms sampled 2.62× apart in cadence, and **it does
not work**: they differ only **1.03× in bars per sample** (912 vs 936), because the slower-sampling arm also
delivered bars faster. With bars-per-sample constant, "MB per thousand bars" and "MB per sample" are the same
quantity relabelled; their 0.4% agreement is arithmetic, not evidence. **Recorded as NOT a control.** The
purpose-built arm — same configuration and speed, cadence alone moved 10× — runs when the host is free.

---

## 6. Contention incident, and the samples that carry a mark

**My own teardown defect.** At 22:16 the run rolled to segment 2. Segment 1's *browser* process exited; its
*renderer* did not. Pid 30588 survived as an orphan, ran for another 67 minutes at ~120% of a core, and held
**2,489 MB private**. Killed at 23:23 after burning 21,986 CPU-seconds.

The OS working-set reading that looked like a release was the orphan being trimmed, not memory being returned:
the orphan showed **1,354 MB working set against 2,489 MB private** (a 1,141 MB gap — Windows trimming under
pressure), while the soak renderer at the same moment showed 1,762 MB working set against 1,945 MB private.

Did the series bend? `CONTENTION-DISCONTINUITY-20260731.json`, matched on **resident bars**, not elapsed time:

- **Throughput did NOT bend materially**: segment 2 delivers 92% of segment 1's bars/min at matched size. The
  soak is not delivery-bound, so losing a core cost it little.
- **The memory-slope comparison is INCONCLUSIVE and is not quoted.** Band ratios disagree in direction (1.50,
  3.38, 0.27). My first estimator averaged per-interval MB/kbar ratios and produced "155% — slope bent"; the
  endpoint estimator shows the bands simply do not agree, and two things besides contention differ between
  segments (segment 2 is younger at any given bar count, and starts from a fresh browser).

**Marked:** every segment 2 sample before 23:23; `LOAF-LIVE` (22:30–22:39); `FRAME-TRACE-SOAK` (22:52–23:05);
the first paired arm (22:57–23:01, which added a third browser of its own). **Withdrawn:** allocator dump A at
22:29 as a baseline — re-taken clean at 23:26 as A2, with the second dump rescheduled to ~01:40, so the diff
sits entirely on the clean side and cannot inherit the contention silently. **Unaffected:** everything published
up to 21:45, measured inside segment 1 when it was the sole occupant.

Guard added at the point where the next segment boots: `reapOrphanedRenderers()` kills chrome renderers whose
browser parent is gone. A renderer cannot be closed by anything but its browser, so once the browser exits
nothing will ever reap it.

Two further instrument failures found and fixed in the same pass. My probes defaulted to a hard-coded debug
port; each segment launches its own browser on an ephemeral one, so the first LoAF run attached to a browser
that was torn down 45 seconds later and reported "no frames" as though the page were quiet. Port discovery plus
a browser-identity assertion now makes a segment roll **void** a measurement instead of emptying it.

---

## 7. SPEED LABEL DEFECT — tonight's soak is running at 60, not 5

`bootConf01Session` takes **`replaySpeed`**; `bend-soak` passed **`speed`**. The option was silently discarded
and the session defaulted to 60. Segments 1 and 2 were launched `--speed=5` and **ran at 60**: the live engine
reports 60, and the delivered rate is 8.44 bars/s, which 5 candles/s cannot produce.

The *condition* was fine and consistent across both segments; the *label* was false. Every rate quoted from
tonight's soak — including segment 1's settled 132.6 MB/h — belongs to 60, not 5. Fixed, and the effective
speed is now read back from the engine and recorded, with a mismatch written into the artifact rather than left
for a sibling to discover. The fix takes effect on the next segment, which would change the condition mid-run;
segment 3 only launches on an early death, and if it does the boundary is declared.

---

## 8. THE IDLE SPLIT — pausing replay does not stop the work

`FRAME-TRACE-IDLE-VS-REPLAY-20260731.json`. Both arms in one session at one bar count (6,125), so idle-versus-
replay is not confounded with 2k-versus-39k bars. The idle arm is **asserted** idle, not assumed: all four
panels paused, replay index 2194 before and 2194 after.

| | task time ms/s | blocking ms/s |
|---|---|---|
| playing | 575.9 | **47.7** |
| **paused** | **857.1** | **0.0** |

**A paused chart burns more total main-thread time than a playing one**, and the shape differs: playing produces
fewer, longer tasks (hence all the blocking); paused free-runs the animation loop as many short tasks, none over
50 ms. So replay causes the *freezes*; the always-on loop causes the *burn*. Both are real and they are
different defects.

What runs with replay stopped, by name:

| function | share of thread, PAUSED | path |
|---|---|---|
| `talariaAppendIndicatorLegendRow` | **16.5%** | 69% via `runReplayPlayIndicatorPass` ← `scheduleReplayIndicatorRecalc` |
| `getBoundingClientRect` | 5.7% | 65% via `_isMultichartPanelVisibleForPaint` ← `_tickBarCloseCountdown` ← `animate` |
| `requestAnimationFrame` | 4.9% | 88% from `animate` (chart.js:29740) |
| `_m19iB62WindowFp` | 3.6% | 94% via `drawIndicatorsOptimized` ← `render` |
| `measure` (chart.js:32059) | 3.0% | 80% via `_syncAdaptivePriceAxisMargin` ← `drawAxes` ← `render` |

**The replay-play indicator pass runs while replay is paused, and it rebuilds the legend with `innerHTML` each
time.** The `animate` loop never stops, and each turn forces a synchronous layout through the very check that
exists to decide whether the render can be skipped.

This does not license subtracting 857 from the soak's 707: the floor was measured at 6,125 bars in a fresh
session and the soak is at 39,000, and both arms shared the host with the soak (the *comparison* is unaffected
because both arms shared it equally). What it establishes is the mechanism — the loop is not replay-driven —
and that any fix aimed only at the replay path leaves most of this standing.

## 9. Still open

- **Heap classification by constructor** (what grows by 24 KB per bar across strings, compiled code,
  Object/Array, typed arrays, Map/Set, closures, detached contexts, with retainer paths for the top five, and
  workers counted separately) — designed, not yet run; it needs a stop-the-world snapshot, which goes on a
  reproduction sized to survive one, not on the live soak.
- **The purpose-built 10× sampling-cadence arm.**
