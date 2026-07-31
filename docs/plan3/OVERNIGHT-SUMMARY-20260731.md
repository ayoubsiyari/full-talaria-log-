# OVERNIGHT SUMMARY — 2026-07-31 (Manager C, NIGHT-01 battery)

**Was the night good? 6 of 7 scenarios produced a usable artifact, none died.**
**Headline:** bar retention: LARGE DUPLICATION; eviction: SOMETHING RELEASES

| # | status | verdict | min |
| --- | --- | --- | --- |
| **B1** | **OK** | two indicators: CPU-ms/bar CLIMBS at 2.81/h CI[2.51, 3.12], level change 41.7%, mode ["candle","candle","candle","candle"], build 20260730b116 | 17.8 |
| **B1b** | **OK** | zero indicators: CPU-ms/bar CLIMBS at 1.04/h CI[0.94, 1.13], level change 59.1%, mode ["candle","candle","candle","candle"], build 20260730b116 | 21 |
| **B2** | **OK** | mode tick (verified true): P0 none, 41.87 recalcs per advanced candle, recalc cost INDETERMINATE (0.7417 -> 0.6833 ms) | 17.9 |
| **B3** | **OK** | LARGE DUPLICATION — the multiplier is the story — copies per resident bar 14 (alias factor 1.58), derived series slots per bar 0, resident bars at first paint 2011 | 17.1 |
| **B4** | **OK** | SOMETHING RELEASES — at least one realm sheds resident bars — 1m:2645->14548, 1h:1596->495 (26 releases) | 16.2 |
| **B5** | **OK** | 84 screenshots, 19 single-chart and 21 multichart controls; contact sheet at c:\Users\user\Desktop\talaria1\_evidence\manager-C\ui-sheet-20260731\CONTACT-SHEET.png | 1.8 |
| **B6** | RUNNING | in progress · latest: no verdict block (run died before grading) | — |

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

_Manifest: `c:\Users\user\Desktop\talaria1\_evidence\manager-C\OVERNIGHT-MANIFEST-20260731.json`. Driver started 2026-07-31T01:39:33.101Z. Summary regenerated 2026-07-31T03:12:53.407Z._
