# Four suspects, one instrument-pass each — and LAG-3 is mispriced by the roster's own table

**Manager C — 2026-08-01 09:45.** Investigation queue, §3 of the kill-roster ruling.
Build `20260731b120`, digest `e5f703473654a4335f8efc5cf9a1964e`. **Unsealed — shares and ratios, no absolute
figures quoted as build-characteristic.**

---

## 1 · LAG-ZT — BOARDS THE ROSTER, and it is bigger than its seat

**No new pass consumed.** Three frame-attributed, JS-sampled traces already exist on one verified zero-trade
session at rising bar counts. Re-running would have spent a host slot to add a fourth point to a curve that
has three.

| | T05 | T22 | T42 |
|---|---|---|---|
| resident bars | 12,339 | 28,229 | 35,754 |
| blocking | 159.1 ms/s | 178.9 ms/s | 247.6 ms/s |
| `_chartIndexForCloseMarkerOnChart` | **absent** | **absent** | **absent** |
| `_m19iB62WindowFp` | 11.2% | 24.9% | **28.0%** |
| `set innerHTML` | — | 14.1% | 13.0% |
| `m20Q6CapturedClear` | — | 6.8% | 8.3% |
| `getBoundingClientRect` | 5.5% | 4.0% | 3.6% |

**The falsifiable prediction held, and non-vacuously.** I predicted the marker lookup would sit at or near
zero with trades absent, against 24.1% of the main thread with trades. It is absent at all three points, each
of which read a full 18-function list — the absence is measured, not an empty array.

Blocking rises 159 → 248 ms/s as bars go 2.9×. Three points on one warming session is a direction, not a
coefficient, and I am not quoting a slope from it.

### The part the roster needs: LAG-3 is priced in the wrong regime

The ruling's §4 table prices **LAG-3 at 10.4% of the freeze → 1.60% of the thread → 11.3 ms/s**, and totals
round one's lag kills at 81 of 805 ms/s.

That price comes from the **trade regime**, where the marker lookup dominates. In the zero-trade regime the
same function, `_m19iB62WindowFp`, is **28.0% of sampled self time at 280.1 ms/s** — and it is the single
largest item, rising with bars while everything else falls.

**LAG-3 is not a 1.6% row. It is a 1.6% row in one regime and the top row in the other.** E's memoisation is
the highest-value lag fix on the roster for any user who is not actively trading — which, by the ruling's own
observation that trades cost CPU linearly, is most users most of the time.

I am not restating the §4 total: the two figures come from different sessions and conditions, and averaging
them would be exactly the unit-unsafe move I withdrew two headlines for last night. The correction is
narrower and safe: **the table's single number for LAG-3 is a floor, not an estimate.**

**Round one does not touch this regime at all.** LAG-1a and LAG-1b — the two rows aimed at the freeze — buy
*nothing* here, because the thing they fix is absent.

## 2 · Documents enumeration — I cannot reproduce 13 vs 18, and here is what my condition shows

| | measured |
|---|---|
| `Documents` metric | **7** |
| `Frames` metric | 7 |
| frames enumerable | **4** |
| frames carrying a chart | **4** |
| distinct `timeOrigin` values | 4 |
| nodes / listeners | 40,816 / 8,394 |

By URL: 3 frames at `/chart/multichart-prod/chart-embed.html` (4,002 bars between them) and 1 at
`/chart/dist-v9/index.html` (2,932 bars). Browser targets: 1 browser, 2 page, 3 other.

**The URL diff is the deliverable and it is clean: every chart-bearing document is accounted for.** The
3-document excess carries no chart, no bars and no URL the frame tree can reach — login-navigation documents
pending reclamation, which I have watched get reclaimed in an earlier soak.

**I did not observe 13 vs 18 and I will not explain a number I cannot reproduce.** Whoever measured it was in
a different condition — more likely one that had been through open/close cycles, which is precisely what the
engine census is designed to count tonight. `scripts/documents-and-account-baseline.mjs` re-runs this
enumeration in any condition; the person who saw 13 vs 18 should run it there.

## 3 · Source-map-in-bundle — DEAD

Zero inline source maps and zero `sourceMappingURL` references of any kind, across **8 served files totalling
7,914.9 KB**. Script residency is not inflated by maps, and this cannot be part of the per-bar arena.

Worth recording from the same look, since it was free: `order-manager.js` alone is **2,450 KB** of served
script and the eight files total 7.9 MB. That is genuine script residency, it is just not source maps.

## 4 · Heavy-vs-fresh account baseline — mostly ANSWERED, and not by the route I expected

Only one account exists in this harness, so the fresh arm could not be run. But measuring the heavy arm
answered most of the question anyway, because of *what is not there*.

**Every API call at CONF-01 boot — 246 calls, 4,640.7 KB — collapses into six shapes, and five are market
data:**

| bytes | endpoint shape | account-dependent? |
|---|---|---|
| 2,344.0 KB | `/api/file/{id}/tile/{tf}/{n}` | no — keyed by dataset |
| 1,804.7 KB | `/api/file/{id}/smart` | no |
| 258.7 KB | `/api/file/{id}/bars` | no |
| 108.0 KB | `/api/finnhub/calendar/economic` | no |
| 84.3 KB | `/api/file/{id}/candles` | no |
| **28.9 KB** | **`/api/files`** | **yes — the user's file list** |

**There is no `/api/journal` call. No orders, positions, settings or preferences.** The chart never asks the
server anything account-shaped except which files exist.

So for **CONF-01, the configuration the whole memory programme is measured in, a heavy account cannot differ
from a fresh one by more than the 28.9 KB file listing** — and any larger difference would have to come
indirectly, through the listing selecting different datasets, which is a configuration difference and not
account weight. This corroborates my earlier static finding that the journal is not fetched during chart
load, and it is now measured rather than read off a call-site scan.

**What remains genuinely blocked, and the question named:** TAL-01891 and the cohort magnitude live on the
**dashboard** surface, not the chart. That surface does fetch `/api/journal` with no bounding parameter.
Deciding it needs a second, empty account — `TEST_EMAIL_FRESH` / `TEST_PASSWORD_FRESH` on the test VPS. With
one, this script run twice answers it in 20 minutes. **I will not infer the cohort by sizing a payload and
multiplying by a guessed factor**; that is a modelled number wearing a measured label.

## 5 · Also measured, and it belongs to MEM-1

The host pulls **4.0 MB of bar data in two requests** at boot — one 2,344 KB tile and one 1,678 KB smart
fetch, both for the host's own dataset — before a single bar is replayed. Set against R-1's finding that
82% of resident bars are never displayed, the pre-session residency bound (**MEM-1c**) has a visible target
at boot, not only during replay.
