# Finding — Higher-timeframe bars have no session calendar (epoch-aligned bucketing)

**Date:** 2026-07-27 (evening) · **Found by:** PO visual check D1 + Director code confirmation · **Surface verified on:** host, backtest mode, session 877, EURUSD, b75
**Class:** data integrity (values-level, not cosmetic) · **Tier:** 3 · **Rows touched:** cluster I (TAL-01922, TAL-01918, TAL-01886, TAL-01802, TAL-01925+TAL-01898), cluster H (TAL-01913, TAL-01938)

## Statement

All higher-timeframe bars are bucketed by **epoch-aligned floor division**, with no session calendar and no instrument awareness. Daily bars therefore break at **00:00 UTC**, and weekly bars break on **Thursdays at 00:00 UTC**. Neither matches the FX convention our testers (and FX Replay, our reference product) use.

## Code confirmation

One bucket rule governs every timeframe. `chart.js` `parseTimeframe()` returns fixed durations:

```
'd': 24 * 60 * 60 * 1000      // 86400000
'w': 7 * 24 * 60 * 60 * 1000  // 604800000
```

and both resample paths floor the raw timestamp against it:

- `chart.js` `_resampleDataFull()` — `Math.floor(candle.t / timeframeMs) * timeframeMs`
- `chart-data-pipeline.js` `_tryIncrementalResample()` — identical formula; its full path delegates to `_resampleDataFull`

Consequences of epoch-aligned floor:

- `floor(t / 86400000) * 86400000` → every daily bar opens at **00:00 UTC**.
- `floor(t / 604800000) * 604800000` → since **epoch day 0 is Thursday 1 Jan 1970**, every weekly bar opens **Thursday 00:00 UTC**.
- Monthly is *not* affected: the `^(\d+)mo$` branch uses real calendar months via `Date.UTC(year, month, 1)`. Monthly is correct; daily and weekly are not.
- Intraday timeframes that divide evenly into a day (5m, 15m, 1h, 4h) are unaffected in practice.

## UI evidence (independent of the code, and it corroborates)

Daily crosshair stamps, chart display timezone **EST**:

| Sample | Displayed stamp | Local zone | = UTC |
|---|---|---|---|
| Late Oct 2012 (28–31 Oct) | 20:00 | EDT (UTC−4) | 00:00 UTC |
| Dec 2012 (5–13 Dec) | 19:00 | EST (UTC−5) | 00:00 UTC |

The one-hour shift between samples falls exactly on the end of US daylight time (4 Nov 2012). A session-anchored boundary would have held 17:00 local across both; a UTC-anchored boundary shifts local by one hour at the DST edge. **This is direct confirmation that the anchor is UTC-fixed, not session-relative.**

**Weekly boundary confirmed on the product surface (PO, 2026-07-27 22:42).** On the 1W timeframe the crosshair stamps read **Wed 12 Dec '12 19:00**, **Wed 19 Dec '12 19:00** and **Wed 26 Dec '12 19:00** — three consecutive weekly bars, exactly seven days apart, all Wednesdays at 19:00 EST. Wednesday 19:00 EST **is** Thursday 00:00 UTC. This is the predicted epoch-week boundary (`floor(t / 604800000)`, epoch day zero = Thursday 1 Jan 1970) observed directly, and it upgrades the weekly defect from code inference to confirmed product behaviour.

Practical size of the error: the FX week opens Sunday 17:00 ET, so our weekly bars are anchored roughly **three and a half days out of phase** — each weekly candle splits the trading week near its middle rather than bounding it.

Also observed: **28 October 2012 (a Sunday) carries its own daily candle.** With a UTC-midnight day and the FX week opening Sunday 17:00 ET (22:00 UTC), the Sunday UTC day contains ~2 hours of trading — so a genuine Sunday stub bar is produced. Chart weekday labels are themselves correct (31 Oct rendered as Wednesday, 13 Dec as Thursday), so the Sunday bar is genuinely a Sunday bar and not a labelling slip.

## DECISIVE EVIDENCE — the daily chart has no Friday and a phantom Saturday (PO, 2026-07-27 23:03)

On 1H, **Fri 4 Jan 2013 exists and carries a full session** of bars (crosshair `Fri 4 Jan '13 16:00`, OHLC populated). On 1D over the same weekend, there is **no bar labelled Fri 4 Jan**, while a bar labelled **`Sat 5 Jan '13 19:00` does exist**.

This is precisely what epoch-aligned daily bucketing predicts, because bars are stamped at open (19:00 EST = 00:00 UTC next day):

| Label on screen | Real UTC window | Contents |
|---|---|---|
| `Thu 3 Jan 19:00` | Fri 4 Jan 00:00–24:00 UTC | **Friday's entire session** |
| `Fri 4 Jan 19:00` | Sat 5 Jan 00:00–24:00 UTC | market closed (shut Fri 22:00 UTC) → **empty, no bar drawn** |
| `Sat 5 Jan 19:00` | Sun 6 Jan 00:00–24:00 UTC | Sunday 22:00–24:00 UTC FX open → **~2h stub bar** |

Consequences, stated plainly:

- **Every daily candle is labelled one day behind the session it contains.**
- **There is no Friday candle on the daily chart.** A trader cannot locate Friday's daily bar.
- **A Saturday candle exists** and contains Sunday-evening data.
- The same shift applies to the intraday-vs-daily comparison, so any cross-check of a daily bar against its constituent 1H bars will disagree on the date.

This elevates the finding from "wrong OHLC window" to **wrong and missing candles on the primary timeframe**, visible without instrumentation to any FX trader in seconds.

## Why this is values-level, not cosmetic

1. **Every daily O/H/L/C is computed over the wrong 24-hour window** — 00:00–24:00 UTC instead of 17:00–17:00 ET. Open, high, low and close all differ from what the tester expects, on every daily bar, for every FX instrument.
2. **Daily bars are labelled a day off convention.** A bar stamped `Thu 13 Dec 19:00 EST` spans into Friday's session; FX convention names that window Friday.
3. **A Sunday stub bar exists** that conventionally should be folded into Monday.
4. **Weekly bars start Thursday 00:00 UTC — CONFIRMED on surface**, rendering as Wednesday 19:00 EST. Each weekly candle is ~3.5 days out of phase with the FX trading week, splitting it near the middle. This is a strong root-cause candidate for **TAL-01925 + TAL-01898** (PO-confirmed recurring): if a timeframe switch re-centres the viewport on the current bucket's **open** timestamp, and the weekly bucket opened as much as seven days ago on a Wednesday evening, then dropping from 1W to 1h necessarily throws the view backwards, away from the region under analysis. Testable prediction: note the current weekly bar's stamp, switch to 1h, and check whether the view lands at that stamp. **FALSIFIED (PO, 2026-07-27 22:47).** With the playhead at 9 Jan 2013 — roughly five days into a weekly bucket that opened Wed 2 Jan 19:00, i.e. near the maximum possible divergence between bucket-open and playhead — switching 1W→1H held the playhead at 9 Jan. The view did not jump. A plain "timeframe switch re-centres on bucket open" mechanism is therefore ruled out, and since the test sat near the worst case for that mechanism, the falsification is reasonably strong.

**TAL-01925 + TAL-01898 are consequently de-linked from this finding** and return to open with no named cause. The ticket says the jump happens "sometimes," so the trigger is conditional on something not yet captured — candidates worth a later pass: whether the tester was on the live/rightmost forming weekly bar rather than mid-history, whether a data fetch for the lower timeframe intervenes, and whether it requires the weekly bar to be the one currently being built by replay. **The weekly-anchor defect stands on its own evidence and does not depend on this link.**
5. **Session-derived overlays inherit the error** — daily-open vertical lines (TAL-01913) and ORB (TAL-01938) anchor to a boundary that isn't the session open.
6. **Cross-timeframe price/OHLC disagreement** (TAL-01886, TAL-01802) is partly explained wherever the compared windows differ.

Any indicator computed on daily or weekly series inherits all of the above.

## Fix shape — deliberately not a constant swap

- Introduce a **per-instrument-class session calendar**: FX 17:00 New York (DST-aware), CME index futures per CME calendar, crypto 00:00 UTC (already correct today).
- Bucketing must anchor to **session boundaries with DST awareness**, so the anchor cannot remain a fixed millisecond offset. Both the full and incremental resample paths must share one implementation — divergence between them would be a fresh bug class.
- **Weekly must anchor to the session week start** (Sunday 17:00 ET), not epoch weeks.
- Bar labelling convention must be decided explicitly: stamp-at-open with session-date naming, so a Sunday-17:00-ET open is named Monday.

## Required gates

- **§A7 differential oracle applies.** This changes displayed values on every daily and weekly chart, so old-vs-new bars must be diffed deliberately rather than silently replaced.
- **Kill-switch gated** per §A4c; correctness class.
- **Migration question, needs a Director call:** saved analysis, drawings anchored to daily bars, and journal entries referencing daily OHLC will shift when the boundary moves. Enumerate what is anchored to bar timestamps before flipping.

## Canary interaction (§A3)

This is a §A3 data-integrity gate item and it is larger than the gate assumed. Realistic options, requiring a Director decision:

**Superseded by the decisive evidence above. Revised ruling: this is a canary blocker and must be fixed, not disclosed.**

The earlier options assumed the defect was a wrong-but-defensible 24-hour window that could be disclosed as a convention difference. That framing died with the missing-Friday observation. "Our daily chart has no Friday candle and shows a Saturday candle" is not a disclosable convention; handed to Rayan and Ninja it reads as the product not knowing what a trading day is, and it would discredit every other fix in the canary build.

Revised sequencing: the session-calendar fix enters the queue **immediately behind the loader fix**, ahead of the canary. Two factors make this more tractable than the original Tier-3 framing suggested:

- **The raw data is correct.** 1H shows a full Friday session and no Saturday bars, so this is a re-slicing job over good data, not a data-repair job.
- **There are only two bucketing call sites** — `_resampleDataFull` and `_tryIncrementalResample` — and they must share one session-calendar helper rather than each computing boundaries.

The residual risk is downstream, not in the bucket math: drawings, journal entries and saved analysis anchored to daily/weekly bar timestamps will shift. That audit is the real cost and is what the manager must estimate first.

## Open items still to confirm

- ~~Whether a Saturday bar exists.~~ **RESOLVED — yes.** `Sat 5 Jan '13 19:00` confirmed present on 1D by hover, while the Friday slot is absent. See decisive evidence above.
- The 5m price-scale badge read **`05:08`** on a 5-minute chart. Time-to-close cannot exceed the bar interval; needs a watch-and-confirm pass. Possible countdown defect, and the countdown path was touched by M20-Q2.
- ~~5m axis gridlines land at :20 past the hour; candidate match for TAL-01936.~~ **Withdrawn.** `:20` is a legitimate 5-minute boundary, and the labels sit at uniform ~3-hour (36-bar) spacing, so this is axis label *placement* every N bars, not bucket misalignment. Do not dispatch; TAL-01936 needs its own repro.
- Encouraging sign on the raw data, worth confirming rather than assuming: the 1H view appears to carry a small number of bars on Sunday evenings (30 Dec 2012) and none through Saturdays, which is exactly the FX week opening Sunday 17:00 ET / 22:00 UTC. That is consistent with the Sunday daily stub being a real ~2-hour bucket rather than fabricated data — i.e. the raw feed looks correct and only the bucketing is wrong. Confirm by hovering.
