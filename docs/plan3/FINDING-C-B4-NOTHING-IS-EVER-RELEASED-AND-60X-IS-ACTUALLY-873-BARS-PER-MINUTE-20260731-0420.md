# FINDING C — B4: nothing is ever released, and "60x" is 873 bars per minute

**2026-07-31 04:20** · Manager C · overnight battery B4 · tier=mid model=claude-opus-5-thinking-high
**Instrument:** `BAR-EVICTION-PROBE-V1` (GATE-01 PASS: monotonic, planted drop, plateau)
**Build read off the page:** `20260730b116` · **CONF-04:** all four realms `candle`, zero trades
**Artifact:** `_evidence\manager-C\B4-BAR-EVICTION-PROBE-20260731.json` (includes the re-grade)

## Verdict

**Nothing is ever released.** Zero releases in all four realms across 26 samples over 13.7 minutes
of hard forward play, on all three residency gauges. `EVICT-03` has no implementation to grade.

The stronger form: **the playhead sat at `resident − 1` in every single sample.** The resident array
*is* the played history. Every bar the replay engine advances over is appended and never trimmed.

| realm | resident bars, first → last | releases | verdict |
| --- | --- | --- | --- |
| host, 1m | 2,645 → **14,548** | 0 | NEVER RELEASED — monotonic |
| peer, 5m | 1,596 → 1,596 | 0 | NEVER RELEASED (never grew either) |
| peer, 15m | 1,911 → 1,911 | 0 | NEVER RELEASED (never grew either) |
| peer, 1h | 495 → 495 | 0 | NEVER RELEASED (never grew either) |

## Growth rate, and a correction to the Director's arithmetic

**873 bars/minute = 52,359 resident bars/hour** on the playing panel.

The ruling estimated ~3,600 bars/hour, from "60x on a 1-minute chart advances one bar per second".
The measured rate is **14.5 bars/second**, so the estimate is low by 14.5x — and this is not a
measurement quirk, it is the same "replay speed is not honoured" defect from the other direction.
At a selected **60x** on a 1-minute chart the engine advances at roughly **870x real time**. The
three candle runs tonight all agree: 11-20 bars/s at a requested 60x.

Combining with B3's three-slots-per-bar:

| term | per hour on the playing panel |
| --- | --- |
| resident bars added | 52,359 |
| array entries added (3 slots/bar) | 157,077 |
| identity-distinct objects added (2/bar) | 104,718 |
| **at 150 B/object (ruling's figure)** | **~15 MB/h** |
| at 250 B/object (a 6-field JS object with map overhead) | ~26 MB/h |

So bar accrual is **~15-26 MB/h, unbounded, nothing released** — against the ruling's ~540 KB/h.
That is 29-48x the ruling's estimate, and it is still only 2-4% of the 730 MB/h I measured on the
duration gate. **Bar retention is real, is genuinely unbounded, and is not Monster 1.** Both halves
of that sentence matter.

## What this means for `EVICT-03`

The doctrine is measurable and currently unimplemented. The cheapest correct cut is bounded by
what B3 found:

1. The host's resident triple (`data`, `rawData`, `_resampleCache.result`) grows without limit for
   as long as playback runs. A cap keyed to distance behind the playhead would bound it, and
   because the fetch is already viewport-windowed at load (2,011 bars at first paint), the
   re-request path the PO described **already exists**.
2. It is **not canary-blocking** on these numbers. A one-hour session costs ~15-26 MB in bar
   objects. A user replaying for eight hours costs 120-210 MB, which is when it starts to matter.

## My own instrument defect, found and corrected in this run

The live grader keyed realms on the last 52 characters of the frame URL. **The three peer panels
share an identical suffix**, so all three were merged into one series, and that merged series
hopping between 1,596, 1,911 and 495 was scored as **"26 releases"** and produced the aggregate
answer "SOMETHING RELEASES — at least one realm sheds resident bars".

That answer was wrong and it was wrong in the *interesting* direction, which is the dangerous kind.
The realm key is now the frame ordinal plus the timeframe, the artifact carries the re-grade
alongside the original, and the corrected answer is unanimous: nothing releases. Cost: one re-parse,
no re-run.

## Honest limits

- Array lengths prove **dereferencing**, not collection. "Never released" here means the reference
  is retained, which is the stronger statement anyway.
- **The viewport half of `EVICT-03` was not measured.** I probed `viewStartIndex`/`_viewStart`; the
  product's names are `visibleStartIndex`/`visibleEndIndex` (`chart.js` ~27293), so every
  viewport-distance figure in tonight's artifact reads `null`. Fixed in the instrument, unmeasured
  tonight. The playhead-distance half is unaffected and is what carries the verdict.
- Peers never grew at all, so "never released" is only *tested* on the host. For the peers it is a
  statement about a static array.
