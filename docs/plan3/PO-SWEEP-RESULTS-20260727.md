# PO data-integrity sweep — results, 2026-07-27 evening

**Surface:** host, backtest mode, session 877, EURUSD, b75. Separate findings filed for D1 (`FINDING-SESSION-CALENDAR-20260727.md`) and D2 (`FINDING-COMPLETED-BAR-CLOSE-MUTATION-20260727.md`).

## D3 — price consistency across timeframes — PARTIAL, needs numbers

1m, 5m and 15m all agreed at **1.31868**. PO reports the coarser timeframes showed "something" different but did not record the values.

**Blocked on data.** The distinction that matters: a few-pip divergence points at the D2 trim mechanism, while a large divergence points at bucketing. Need actual readings for 1H, 4H, 1D and 1W at one frozen playhead.

Note the correlation with D2 if the divergence is confirmed: the agreeing timeframes (1m/5m/15m) are exactly the non-coarse set, and the code's trim carve-out names "coarse TFs (15m+)". D2 failed on 1H and passed on 5m. If D3's coarse readings are stale rather than wrong-window, D3 and D2 are one defect, not two.

## D4 — timeframe switch redraws candles — PASS

Candles switch normally between timeframes. **TAL-01917 not reproduced on b75.**

## D5 — price scale not recomputed after a timeframe switch — REPRODUCED

Switching 1W → 1m leaves the **weekly price range applied to the 1m chart**. Evidence: the 1m view rendered with a price axis spanning ~1.22000–1.36000 while the visible 1m data occupied roughly 1.30200–1.30600, collapsing every candle into an unreadable horizontal ribbon. A later screenshot of the same 1m view shows a correct 1.30200–1.30600 axis, so the state is recoverable.

Consistent with prior reports: **TAL-01823** (rescale artifact until move), **TAL-01768** (price-scale rescale needs a second attempt), and the PO's earlier Test-3 note *"when it happens all it needs is to drag the chart or move it and it resolves."* The vertical scale is inherited from the previous timeframe and only recomputes on user interaction.

Severity is higher than "cosmetic": on entering a lower timeframe the chart is unreadable until the user happens to drag, and a user who does not know the workaround sees a flat line where their data should be.

## Regression report — drawing snap ("Magnet Mode") is unreachable in the current shell

PO reports that vertical lines used to snap to candle centres on creation and while being dragged, and no longer do.

**Investigated. The engine survived the shell migration; the control did not.**

- `chart.js` initialises `this.magnetMode = 'off'` — comment: *"Magnet mode for snapping to OHLC"*.
- The snapping machinery is present and referenced: `snapToOHLC(...)` in trendline / rectangle / fibonacci previews, `snapIdx` used for `type: 'vertical'`, a crosshair candle-centre snap (*"Snap vertical crosshair to the nearest candle center (TradingView-style)"*), a `force` option documented as *"Force snap even when magnet mode is off"*, and a `ctrlMagnetSnap` path.
- The **UI control** — magnet button, dropdown, and off/weak/strong strength selector, with `strong` marked active — exists **only** in `legacy-index.html`.
- The current shell has **zero** occurrences of `magnet`: `chart v 1.4/talaria-design/live/index.html` → 0 matches. `chart/modules/*.js` → 0 matches.

So magnet mode defaults to `off` and there is no way for a user to turn it on. This is **not a regression introduced by a recent fix** — it is a control that was never carried into the new shell.

**This is the same bug class as tonight's loader finding: capability loss without failure, one level up.** Nothing errors; the feature is simply absent, and every consumer behaves "correctly" with snapping disabled.

### Policy gap this exposes (§A4c / §A6 amendment needed)

The presence gate I ruled tonight asserts *module* presence on servable shells. It would not have caught this, because no module is missing — a **UI control** is. Required addition:

> **UI control inventory diff.** Enumerate the interactive controls present in `legacy-index.html` and diff them against the current shell. Every control present in legacy and absent in current is either deliberately retired (recorded, with a reason) or a migration loss (a bug row).

This is cheap, mechanical, and likely to surface more than one silently-dropped feature. Magnet mode was found by a human noticing muscle memory failing — that is not a repeatable detection method.

## External tester (Rayan) — sustained-load report, and it reopens the memory closure

Reported over Discord, ~23:46–23:57:

- **Four layouts:** fine for ~5 minutes, then "so slow"; **froze for approximately 1 minute 30 seconds**, then resumed but laggy. Memory **2.5 GB**.
- **Dropping to one layout:** returned to normal immediately.
- **One layout, continued:** still stalls randomly — "stopped moving… then moved again… it stops randomly then moves again."
- **One layout on the 1m timeframe:** **"untradable," memory reached 3.5 GB.**
- Memory observed dropping and then climbing again (sawtooth).

Test included indicators and live trades, which the PO's earlier memory tests did not.

### This invalidates the scope of the memory closure

Memory was closed as a *bounded multichart working set*. Rayan reached **3.5 GB on a single layout**, worst on 1m, with indicators and trades present — so the closure was scoped to a configuration narrower than real usage. **Reopen.** See the ruling amendment in `DIRECTOR-RULINGS-20260727.md`.

Also note the 90-second freeze is qualitatively different from lag. A stall of that length is not explained by garbage collection alone and points to synchronous whole-history work on the replay path.

## LEADING HYPOTHESIS — the M20-Q9 correctness correction defeats its own optimisation, costing O(n) work per replay tick

This is the highest-value item in this document. It is a hypothesis with a named mechanism and a cheap existing verification path; it is **not** yet established.

The chain:

1. `ChartDataPipeline.getResampledSeries()` has an incremental branch intended to make replay resampling O(1) when exactly one raw bar is appended (`cache.sourceRef === source && cache.sourceLen === source.length - 1`).
2. The M20-Q9 prefix-slice fix keeps **one stable identity** for `chart.rawData`, which is precisely the condition that lets that incremental branch fire.
3. But the correctness correction for the stale-trimmed-bucket hazard is to drop the consumer's resample cache: `_installPlayheadPrefix()` calls `_m20Q9DropConsumerResampleCache(consumerChart)` on **every install** — i.e. every tick — and that sets `sourceRef = null`, `sourceLen = -1`, `result = null`.
4. Consequently the incremental branch **can never fire on this path**, and every replay tick performs a **full resample of the entire sliced raw array**, allocating a fresh output object per bar.

If correct, this predicts exactly Rayan's observations:

- **Per-tick cost scales with total history**, not with the one new bar — so sustained replay burns CPU proportional to dataset size.
- **Output allocation is largest on the finest display timeframe**, because 1m display emits ~n output bars where 1H emits ~n/60. So **1m is the worst case** — which is precisely where Rayan measured 3.5 GB and "untradable."
- **Sawtooth memory** is the signature of high-rate short-lived allocation with GC reclaiming between bursts.
- **Long stalls** follow from repeated whole-history synchronous work rather than from GC alone.

### Verification is cheap — the counter already exists

`chart.js` `resampleData()` already increments a diagnostic on full-array resamples:

```
if (this._mcDiag && this._mcDiagIsFullArrayResample(data)) this._mcDiag.resamples++;
```

Read that counter across a replay run. If it advances roughly once per tick, the incremental path is dead and the hypothesis is confirmed. Compare 1m against 1H, and compare with the M20-Q9 kill-switch ON and OFF.

### Why this matters strategically

If confirmed, **one change fixes both the D2 correctness defect and this performance defect**, because they share a cause: the playhead trim writes into the pipeline's cached result array, which is what forced the every-tick cache drop in the first place. Make the trim **non-destructive** — apply it as a render-time overlay rather than mutating `chart.data[lastIdx]` — and then:

- finalised buckets are never left holding trimmed OHLC (fixes D2 / TAL-01918), **and**
- the cache no longer needs dropping every tick, so the incremental O(1) branch works as designed (addresses the CPU and memory profile).

This also reframes the C3a work: before committing to an architectural re-slice for multichart memory, establish whether the dominant cost is this per-tick full resample. **Measure before building.**
