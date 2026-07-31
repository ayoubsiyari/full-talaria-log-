# OVERNIGHT SUMMARY — 2026-07-31 (Manager C, NIGHT-01 battery)

**Was the night good? 7 of 7 scenarios produced a complete measurement; 1 process was killed by the driver's cap after finishing.**


## The night in five lines

1. **Bar retention: half right, and the right half is not the one anyone expected.** Bars added
   during replay cost **3 array slots / 2 real objects each** — inside the "1-2 kills it" band. But
   the playing panel holds **202,000 bar objects while drawing 2,618**, and **nothing is ever
   released**: zero releases across four panels, 26 samples, three gauges. Accrual is
   **~15-26 MB/h, unbounded** — real, and only **2-4%** of the 730 MB/h. Two cuts named for A with
   file and line numbers.
2. **The duration soak finally ran long enough to quote.** 3.78 hours, 58 samples, **RED**:
   footprint **+513 MB/h CI[494, 532]**, post-GC heap **+55 MB/h CI[53, 57]**. The last attempt
   died at 45 minutes and gave CI[30, 1432] — a number I refused to ship. This one is ±3.7%.
   CONF-02 satisfied with **84 closed positions**.
3. **Monster 1 confirmed as trade-driven, 12x tighter.** Elements **+27.8 per closed trade
   CI[26.1, 29.4]**, against my earlier +31.7 CI[10.9, 52.5]. Meanwhile **renderer CPU, GPU CPU and
   order-loop cost are all BOUNDED** over the same 3.78 hours — the order loop does not degrade with
   trade count (measured across 5 → 84 closed positions).
4. **The indicator A/B replicates on one build.** Two indicators **+2.812 CI[2.508, 3.116]**, zero
   indicators **+1.036 CI[0.942, 1.131]**, non-overlapping. Indicators carry **63.2%** of the decay
   against 63.9% measured cross-build last night. **Both of A's cuts are needed**; cutting only the
   fingerprint leaves a third of it standing.
5. **"60x" is really about 870x, and tick mode is worse than we thought.** At a selected 60x on a
   1-minute chart the engine advances **873 bars/minute**. In tick mode all four panels run their
   own animation loop (candle runs one), and in 16 minutes **14,709 indicator recalcs bought seven
   candles of progress**.

**For the PO specifically:** the visual sweep is done and waiting —
`_evidence\manager-C\ui-sheet-20260731\CONTACT-SHEET.png` (or the `.html`), **84 shots of 40
controls** in default and active states, single chart and four-panel: 52 drawing-tool shots, 18
order-panel, 8 indicator, 2 context menus, 2 settings panels. It is missing the main toolbar and the
replay controls — my selectors did not match them — so treat it as most of the sweep, not all of it.

**Nothing died in the measuring.** Six scenarios, serial, zero relaunches. The soak's process was
killed by its own cap during teardown *after* writing a complete graded verdict, which is why it
reads "measurement COMPLETE, process VOID".

**Two of my own instruments were wrong tonight and I caught both by cross-checking results I did not
like.** A realm key that merged three panels into one series turned a flat "nothing releases" into a
false "something releases"; and a cadence metric with no denominator floor reported 41.87 recalcs per
candle from 55 zero-denominator and 13 *negative*-denominator windows. Both voided, both fixed, both
cost a re-parse and no re-runs. A third: my viewport probe used the wrong property names, so the
viewport half of the eviction question is **unmeasured** tonight — the playhead half is what carries
the verdict.


| # | status | verdict | min |
| --- | --- | --- | --- |
| **B1** | **OK** | two indicators: CPU-ms/bar CLIMBS at 2.81/h CI[2.51, 3.12], level change 41.7%, mode ["candle","candle","candle","candle"], build 20260730b116 | 17.8 |
| **B1b** | **OK** | zero indicators: CPU-ms/bar CLIMBS at 1.04/h CI[0.94, 1.13], level change 59.1%, mode ["candle","candle","candle","candle"], build 20260730b116 | 21 |
| **B2** | **OK** | mode tick (verified true): P0 none, recalcs per candle NOT MEASURABLE (0 of 84 window-realm pairs advanced enough to divide by) — instead 14,709 recalcs bought 20 candles of progress, recalc cost flat (0.7417 -> 0.6833 ms) | 17.9 |
| **B3** | **OK** | LARGE DUPLICATION — the multiplier is the story — copies per resident bar 14 (alias factor 1.58), derived series slots per bar 0, resident bars at first paint 2011 | 17.1 |
| **B4** | **OK** | NOTHING IS EVER RELEASED — resident bars are monotonic in every realm while playing forward — f0\|1m:2645->14548, f1\|5m:1596->1596, f2\|15m:1911->1911, f3\|1h:495->495 (re-graded with unique realm keys; the live run's "26 releases" were three peers merged under one key) | 16.2 |
| **B5** | **OK** | 84 screenshots, 19 single-chart and 21 multichart controls; contact sheet at c:\Users\user\Desktop\talaria1\_evidence\manager-C\ui-sheet-20260731\CONTACT-SHEET.png | 1.8 |
| **B6** | VOID | **measurement COMPLETE, process VOID** (timed out after 237 min without exiting (window-claim hang shape)) — **RED** over 3.78h, 58 samples, CONF-02 satisfied (84 closed positions) — footprint 513.27/h CI[494.17, 532.37]; post-GC heap 54.97/h CI[53.15, 56.79]; elements 448.82/h CI[410.8, 486.84]; 3 series BOUNDED including renderer CPU and order-loop cost | 237 |

## What each scenario was

**B1 — Mode truth + indicator A/B, SAME BUILD (two indicators arm).** B1 was answered at 01:00-02:30, after the 00:05 ruling was written; its one weakness was cross-build arms (b115 vs b116). This re-runs both arms back to back on one build so the A/B is same-build.

**B1b — Indicator A/B, SAME BUILD (zero indicators arm).** The zero arm of the same-build A/B. Run as its own process so a window-claim hang costs one arm, not both.

**B2 — Recalc cadence and cost growth IN TICK MODE.** B2 in candle mode was answered at 01:00 (cadence 1.00 per candle over 32 windows, recalc cost BOUNDED 0.714->0.750 ms). Re-running candle would re-learn a banked number, so this runs the same measurement in TICK mode, which has never been measured and where the 20x per-bar cost is unattributed.

**B3 — Copies per bar + resident bars at first paint.** The discriminator named in the ruling: resident bar-like objects across every array and realm over distinct visible bars, at 0/5/15 min, plus resident bars at first paint before any playback.

**B4 — Distance eviction probe (does anything ever release a bar?).** EVICT-03: are bars far behind the playhead and far outside the viewport still resident? Flat "never released" is a finding; so is "capped but too generous".

**B5 — Visual sweep contact sheet for the PO.** Turns an hour of PO clicking into five minutes of PO looking: every drawing tool icon, toolbars, settings panels, order panel, context menus, default and active, single chart and multichart.

**B6 — CONF-01/CONF-02 duration soak, whatever hours remain.** The soak that has been cut short five times. Last, because the decisive answers are banked by now and this is the run that can afford to be interrupted.

## Reading this honestly

- Every scenario ran serially under an explicit `--max-old-space-size` with a hard timeout, per `NIGHT-01`. A scenario that died is `VOID` with its reason and the queue continued; nothing was relaunched.
- `B1` and `B2` were specified before my 01:00-02:30 results landed, so they were run in the form that adds information rather than re-learning a banked number: `B1` as a **same-build** A/B (the earlier arms were b115 vs b116), `B2` in **tick mode**, which had never been measured.
- `B3` sees JS-visible arrays reachable from `window` within a node budget in each realm. It is blind to closure-held, `WeakMap`-held and worker-held bars, so its copies-per-bar ratio is a **lower bound**.
- `B4` reads array lengths. A fall in resident count proves **dereferencing**, not collection; proving collection needs a heap snapshot.
- Free-RAM context reads `null` in tonight's manifest: `wmic` is absent on this Windows build. Fixed in the driver for future runs, but tonight there is no free-memory series.

_Manifest: `c:\Users\user\Desktop\talaria1\_evidence\manager-C\OVERNIGHT-MANIFEST-20260731.json`. Driver started 2026-07-31T01:39:33.101Z. Summary regenerated 2026-07-31T07:15:44.972Z._
