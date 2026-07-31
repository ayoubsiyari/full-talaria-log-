# FINDING — the competitive deficit is CPU, not memory, and it predates Plan 3

> ## 🎯 THE SHAPE OF THE DEFICIT (2026-07-28 12:25) — supersedes every block below
>
> PO completed the A/B. **The gap is a near-constant fixed overhead, not a per-tick multiplier.**
>
> | Measurement | Talaria | TradeZella | Ratio | **Absolute gap** |
> |---|---|---|---|---|
> | Idle CPU | 12–30 (≈7.79 untraced after instrument correction) | 0.4–1.8 | ~10x | — |
> | **Replay 1x CPU** | **34.4** | **1.8** | **19x** | **32.6 pp** |
> | **Replay 10x CPU** | **114.7** | **76.1–80** | **1.4x** | **~36 pp** |
> | Memory at 10x | 460 MB | 400–490 MB | **parity** | — |
> | **Client storage** | **582 kB** | **4.3 MB** | **we use 7x LESS** | — |
>
> ### The decisive observation: the absolute gap is constant
>
> **32.6 percentage points at 1x. ~36 percentage points at 10x.** A ten-fold increase in replay work changes the gap by ~3 points. **That is the signature of a fixed cost per unit of wall-clock time, not of expensive per-tick work.**
>
> Decomposing on that basis: at 10x, subtracting our resting floor leaves roughly **1.3x** their per-tick replay cost. **Our per-tick replay work is roughly competitive.** What is not competitive is a constant overhead that runs regardless of what the chart is doing — the same thing we see as the idle floor, and it dominates completely at low speed where there is little real work to hide it.
>
> **This is very good news for the deadline.** A fixed overhead is a bug to find and delete. A per-tick multiplier would have been an architectural rewrite. **The idle floor is not a side issue that also happens to exist — it appears to BE the deficit**, visible at rest and merely diluted at speed.
>
> ### Correction — storage is NOT the memory problem. My third correction to this document today.
>
> **Talaria total client storage: 582 kB. TradeZella: 4.3 MB.** We store **7x less** than the competitor. 582 kB cannot explain 1.3 GB of memory, so **the storage-growth row I opened at 11:44 is closed as refuted.**
>
> **What actually happened with the 1.62 GB:** clearing browser data helped not by discarding stored bytes but by forcing a **fresh page load**. The growth is a **runtime leak in a long-lived tab**, consistent with A's finding that the `chart.js` missing-`removeEventListener` leak is *pure retention with zero teardown CPU*. **Restated row: memory grows with tab lifetime, not with stored data.** Measure against **session duration and interaction count**, not against storage size.
>
> ### Two architectural observations from the competitor's storage
>
> 1. **TradeZella persists candle data to IndexedDB** — a `symbol-candles` store keyed `["EURUSD", 60000, <timestamp>]`, alongside `notebookNotes`. **They spend disk to save memory; we appear to hold candles in RAM.** That is the most concrete architectural difference found so far, and it aligns with them being at memory parity while we leak.
> 2. **Our localStorage shows unbounded per-session key growth** — `u13_chart_drawings_s616_25`, `s848_25`, `s849_25`, `s850_25` and their `_meta` and `_mcla` variants, plus **two coexisting key namespaces** (`u13_`-prefixed and unprefixed, with `active_trading_session_id` 884 against `u13_active_trading_session_id` 850). Small in bytes, but it is unbounded growth and a split-brain on which key is authoritative — directly relevant to the V8/M15 preference contract.
>
> ### Consequences
>
> - **A's priority is confirmed and narrowed: find the constant overhead.** The 7.79% untraced idle is the same phenomenon. This now has the highest expected value of any work on the board.
> - **A's 73x resample ceiling needs re-reading against this.** If we genuinely did 73x the necessary work per tick, we would not be within 1.4x at 10x. Either the ceiling is a rarely-triggered worst case or resampling is cheap relative to the constant overhead. **Do not brief the 73x figure as the explanation for the CPU gap** — per BRIEF-02 it is a hypothesis this measurement partly contradicts.
> - **The 10x cap keeps its CPU rationale but loses its competitive one:** at 10x we are within 1.4x of TradeZella, and TradeZella itself reaches 76–80 at that speed. **High speed is expensive for everyone.** The cap remains a PO product decision.
> - **Confounder to note honestly:** our 1x and 10x figures carried three moving averages; TradeZella's did not. Indicators measured at ~2 points at rest, so this is unlikely to change the shape, but the re-measurement after the overhead fix should match indicator counts.

> ## ✅ CONTROLLED LADDER (2026-07-28 11:39) — supersedes both blocks below. Read this one.
>
> PO ran `PO-PROTOCOL-CPU-AB-20260728.md` in a **fresh private window with browser data cleared**, EURUSD 1m, 3 years, one pair.
>
> | Phase | Memory | CPU | TradeZella equivalent |
> |---|---|---|---|
> | **P1 idle**, no indicators, not playing | 447 MB → settles **303 MB** | 25.4 → **12.3, oscillating up to 29.5** | 280 MB, **0.4–5.1** |
> | **P3/P4 idle**, +3 indicators (SMA/EMA/WMA 20) | **331 MB** | **14.0** | — |
> | **P5 replay 1x** | 365 MB | **34.4** | 0.4–5.1 at 1x |
> | **P6 replay 10x** | 460 MB | **114.7** | not captured |
> | **P8 10x + 8 trades, 7 open, 1 pending** | 536 MB | 95.1 | — |
> | **P7 pause** | returns to baseline | **returns to baseline** | — |
>
> ### Correction 1 — memory is at parity on clean storage. The 1.62 GB was accumulated client-side state.
>
> Idle memory on a **cleared** profile is **303 MB against TradeZella's 280 MB — parity.** The earlier 1.62 GB reading was the same idle configuration on an **uncleared** profile. **Clearing browser data cut idle memory by 5x.**
>
> **This is not good news and must not be reported as parity.** No user clears their browser storage, so **1.62 GB is the real user experience and 303 MB is the laboratory one.** The defect is restated: *we start at parity and degrade roughly 5x with accumulated use, and the growth lives in client-side storage rather than in the runtime.* New row — establish what grows: IndexedDB stores, localStorage keys, service-worker caches, per-session records (the PO's sessions ran 882, 883 …), and the ~160 MB of `accounts.google.com` / `hcaptcha` subframes seen earlier. Growth per session and a bounded-retention policy are the deliverables.
>
> **I have now been wrong twice in one hour on memory parity — once by comparing against FX Replay, which is itself heavy, and once by not controlling storage state. Every future memory claim states the storage condition it was measured under.**
>
> ### Correction 2 — speed does drive CPU, and my earlier retraction was too broad
>
> **1x costs 34.4; 10x costs 114.7.** Speed materially drives CPU on the product's real surface. My retraction at `f990eb4b5` was correct about the *fast-renderer retirement* premise and **too broad in implying speed is not a CPU driver.** The PO's original suspicion was better than my correction of it. **The 10x cap therefore does have a CPU rationale after all** — restore that to its disposition, measured rather than asserted, and capture TradeZella at 10x to complete the comparison.
>
> ### What is now clean, and stops being investigated
>
> 1. **Pause returns to baseline.** Replay leaves **no** work running after it stops. P7 refuted — drop that hypothesis.
> 2. **Indicators are nearly free at idle:** 303 → 331 MB and 12 → 14% for three MAs. Indicator *calculation* is not the resting cost, which is consistent with A's finding that idle cost exists with no indicators at all.
>
> ### The two defects that remain, both real, ranked
>
> **D1 — the idle floor. Nothing is playing, no indicators, one pair, and CPU sits at 12–30% while TradeZella sits at 0.4–5%.** Still 3–6x worse, and **it oscillates**, which means periodic work with no input change. This remains the cleanest, cheapest, most confined defect on the board and the suspect list is unchanged: the M20-Q2 countdown idle-render path first, then any surviving `setInterval` poll, the forming-candle updater, autosave, and time-driven cache invalidation.
>
> **D2 — replay cost. 34.4% at 1x against TradeZella's 0.4–5.1% at 1x — roughly 7x worse at the same speed.** A's measurement of **2.000 full resamples per tick with a 73x ceiling and three optimisation defeats** is the leading explanation and is already in hand. Note D1 is a floor *underneath* D2: 12–30% of the 34.4% is present before replay starts.
>
> **Ordering: fix D1 first.** It is smaller, better isolated, requires no architectural change, and it lowers D2 by the same amount for free.

> ## ⚠ SUPERSEDING OBSERVATION (2026-07-28 11:13) — IDLE CPU. Read this first.
>
> **Talaria: one pair, 1m, NOTHING PLAYING, immediately after refresh, no indicators, no orders — 1.62 GB, CPU 20.6 with periodic spikes to ~120 falling back to 10–30.**
> **TradeZella: one pair, comparable 3-year period — 280–499 MB, CPU 0.4–5.1.**
>
> **Memory 3–6x worse. Idle CPU 4–50x worse.**
>
> **§1's parity claim is CORRECTED.** Memory parity held against **FX Replay** (891 MB), which is itself a heavy client. Against **TradeZella** — the comparison the PO actually cares about and the one that started this investigation — **we are not at parity on either axis.**
>
> ### Why this observation outranks everything else in this document
>
> An idle chart with no replay, no indicators, no orders and one symbol **should consume approximately zero CPU.** The competitor's does: 0.4%. Ours sustains ~20% and spikes to a full core.
>
> **This eliminates every confounder we have been fighting for three days.** Not replay speed — nothing is playing. Not indicators — none loaded. Not multichart — one panel. Not teardown residue — this is a fresh refresh. Not data volume driving per-tick work — there are no ticks.
>
> **Therefore: a loop is executing with no input change.** The periodic signature — spike to ~120, fall to 10–30, repeat — is a **periodic task**, not steady-state cost. Named suspects, all cheap to check and all in A's territory:
>
> 1. **The bar-close countdown idle-render path (M20-Q2).** That fix explicitly changed how the countdown triggers renders. An idle render loop is exactly what its name describes, and it is the first thing to check.
> 2. **Any surviving `setInterval` polling** — M20-Q1 v9 replaced a DOM poll with an observer; verify the poll is actually gone rather than additionally present.
> 3. **The forming/animated candle updater**, which may be repainting on a timer with no new data.
> 4. **Autosave / session persistence** on an interval.
> 5. **A resample or layer-cache invalidation on a timer** rather than on data change.
>
> ### Why this is very likely the whole story
>
> If the floor is ~20% with 120% spikes at complete rest, then replay, indicators and a second panel are *added on top of that floor*. The 129% figure in §1 may be substantially this same defect plus load. **Fixing an idle loop is a small, low-risk, local change — not an architectural rewrite** — which makes this the only credible route to a real CPU improvement inside 46 hours.
>
> ### Diagnosis is trivial because there is no confounding activity
>
> Chrome Performance recording of **10 seconds on a completely idle chart**. With nothing happening, whatever appears in the flame chart *is* the defect. This supersedes measurement 0's ordering: **take the idle recording first.** Also worth capturing: `performance.getEntriesByType('measure')`, and a census of live intervals/timeouts/rAF handles at rest.
>
> **Also of note:** the tab carries three subframes — `accounts.google.com` and two `hcaptcha.com` frames totalling ~160 MB. Establish whether hCaptcha belongs on an authenticated chart surface at all; if not, that is free memory and possibly free CPU.


**Source:** PO A/B against FX Replay, 2026-07-25 ~16:00, screenshots supplied 2026-07-28 10:59.

## 1. The measurement

Chrome task-manager, side by side, same machine (Ryzen 9 7950X, 32 GB):

| | Talaria V9 Live | FX Replay | Ratio |
|---|---|---|---|
| Tab memory footprint | 955 MB | 891 MB | **1.07x — parity** |
| **Tab CPU** | **129.3** | **24.0** | **5.4x worse** |
| Tab GPU memory | 154 MB | 34 MB | **4.5x worse** |
| Helper process CPU | 29.0 (GPU process) | 16.5 (CPU process) | 1.8x |
| Combined CPU | ~158 | ~40 | **~4x worse** |

**Talaria configuration:** two panels (EURUSD 15m + EURUSD 1m), **no indicators**, one open position, order panel open, measured after **15 minutes of replay**. Page self-reported 782 MB. Adding **20 orders drove it to 1.6 GB**.

**Date matters: 2026-07-25.** This is *before* b74/b75 and before every Plan 3 change under discussion. **The CPU gap is not a regression introduced this week — it is the pre-existing architecture.**

## 2. Why this reframes the foundation decision — read before answering §1.2

**We have been optimising the wrong axis.** The §A9 memory row, the 2.5–2.7 GB figures, the 3.5 GB single-layout report, the ~230 MB teardown residual, and the C3a single-data-owner design all target **memory**. This measurement says our memory is **at parity with the competitor** and our **CPU is 4–5x worse**.

**Consequence for §1.2, which the Director was about to decide at 15:15:** a panel-side residency cap reduces *retained bytes*. If bytes are already at parity, **a residency cap may deliver close to nothing on the axis that actually differentiates us.** It could still be worth shipping for the ratchet and the teardown residue, but it must no longer be presented as the cheaper route to competitive performance.

**§1.2's question is therefore restated:** the acceptance criterion for any foundation increment is **CPU per replay tick and per rendered frame**, with memory as a secondary constraint rather than the target. A proposal that halves memory and leaves CPU unchanged does not address the deficit.

## 3. Two architectural signals visible in the competitor's process list

1. **FX Replay runs multiple dedicated workers.** Their task list shows several `Dedicated worker` entries plus a service worker. Talaria's tab shows the work concentrated in the tab process at 129% — i.e. **more than a full core on the main thread**. We have an indicator worker, but the evidence suggests the main thread is still carrying the bulk. **Hypothesis, per BRIEF-02: their CPU advantage is off-main-thread execution, not a cheaper algorithm.** Refutable by measuring what fraction of our per-tick work runs on the main thread.
2. **GPU memory 154 MB against 34 MB.** 4.5x more GPU residency for a comparable chart suggests we retain far more render surface — many layers, large canvases, or per-indicator/per-overlay surfaces that are not pooled. **Hypothesis:** render-surface strategy, not data volume. Refutable by counting live canvas/SVG layers and their dimensions on both.

Both are cheap to probe and neither requires product changes.

## 4. Reconciling with 2026-07-28's numbers — no regression established

| | 2026-07-25 | 2026-07-28 |
|---|---|---|
| Panels | 2 (15m + 1m) | 1, then 2 (1m + 1D) |
| Indicators | **none** | **4 MAs per panel** (SMA/EMA/WMA/DEMA, 8 instances across 2 panels) |
| Speed | 100x (per PO) | 5x, then 1x |
| Memory | 955 MB / 1.6 GB with 20 orders | 1.0 GB single / 2.5 GB multi / 1.8 GB after teardown |

**The configurations are not comparable**, and the 28th's run carried eight indicator instances the 25th's did not. **No regression is established, and none is claimed.** The build on TEST is unchanged at `20260726b75` — A held every deploy on the 28th — so no code change can explain a behavioural difference between the two runs.

**Still worth one hour:** re-run the 28th's exact protocol against a b73 image, since the PO's recollection brackets the good result as pre-b74 and immutable images with pinned rollback exist. Two numbers taken the same way settles it, and "I'm fairly sure" is what produced three days of ghost-chasing.

## 5. What this does not excuse

Memory work is not cancelled. The **ratchet** is real and separately evidenced — 1.0 → 2.5 → 1.8 GB with 800 MB never returning (`FINDING-LAG-IS-RESIDUE-20260728.md`), and that residue is the leading hypothesis for the lag family. Parity on peak memory says nothing about a leak.

**The correction is one of priority and of acceptance criteria, not of scope:** CPU is the competitive gap, the residue is the correctness gap, and peak memory is neither.
